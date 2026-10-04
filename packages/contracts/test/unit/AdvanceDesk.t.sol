// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdvanceDesk, DeskParams, Offer} from "../../src/AdvanceDesk.sol";
import {UpfrontErrors} from "../../src/Errors.sol";
import {RevenueMath} from "../../src/RevenueMath.sol";
import {Advance} from "../../src/Types.sol";
import {AdvanceBase} from "../utils/AdvanceBase.t.sol";

contract AdvanceDeskTest is AdvanceBase {
    // History: owner earns 700 USDG a day, steady, so weakest = 700e6, flat fee 6%.
    uint256 internal constant PRINCIPAL = 2800e6; // weakest day x 4
    uint256 internal constant TOTAL_DUE = 2968e6; // principal x 1.06

    // --- eligibility ---

    function test_noOfferForNewPool() public {
        Offer memory o = advDesk.getOffer(poolId);
        assertFalse(o.eligible);
        assertEq(o.reason, UpfrontErrors.HistoryTooShort.selector);
    }

    function test_noOfferWithWeakHistory() public {
        skip(3 days);
        // Earns on a single day only: the weakest of the last four days is zero.
        _swap(true, true, DAY_SWAP, "");
        skip(1 days);
        Offer memory o = advDesk.getOffer(poolId);
        assertFalse(o.eligible);
        assertEq(o.reason, UpfrontErrors.EarningsTooLow.selector);
    }

    function test_offerUsesWeakestPeriod() public {
        _buildHistory();
        Offer memory o = advDesk.getOffer(poolId);
        assertTrue(o.eligible);
        assertEq(o.weakestPeriod, 700e6);
        assertEq(o.amount, PRINCIPAL);
        assertEq(o.flatFeeBps, 600);
        assertEq(o.totalDue, TOTAL_DUE);
        assertEq(o.repayShareBps, 2000);
    }

    function test_oneGoodDayCannotInflateOffer() public {
        _buildHistory();
        // A huge swap today does not count: today is not a complete day.
        _swap(true, true, 1_000_000e6, "");
        assertEq(advDesk.getOffer(poolId).amount, PRINCIPAL);
    }

    function test_unsteadyEarningsCostMore() public {
        for (uint256 i; i < 5; ++i) {
            _swap(true, true, i % 2 == 0 ? DAY_SWAP : DAY_SWAP / 4, "");
            skip(1 days);
        }
        Offer memory o = advDesk.getOffer(poolId);
        assertTrue(o.eligible);
        assertGt(o.flatFeeBps, 600);
        assertLe(o.flatFeeBps, 1200);
    }

    function test_offerCappedByVaultShare() public {
        _buildHistory();
        vm.prank(admin);
        advDesk.setOfferSettings(100_000e6, 1, 2000); // 0.01% of 1,000,000 USDG idle
        assertEq(advDesk.getOffer(poolId).amount, 100e6);
    }

    function test_offerCappedByPoolCap() public {
        _buildHistory();
        vm.prank(admin);
        advDesk.setOfferSettings(1000e6, 5000, 2000);
        assertEq(advDesk.getOffer(poolId).amount, 1000e6);
    }

    // --- acceptance ---

    function test_acceptPaysOwnerAndOpensAdvance() public {
        _buildHistory();
        uint256 before = usdgToken.balanceOf(poolOwner);
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);

        assertEq(usdgToken.balanceOf(poolOwner) - before, PRINCIPAL);
        assertEq(vault.outstanding(), PRINCIPAL);
        assertEq(vault.totalAssets(), LENDER_DEPOSIT); // lending out changes nothing about what lenders own
        Advance memory adv = upfront.advanceOf(poolId);
        assertTrue(adv.open);
        assertEq(adv.totalDue, TOTAL_DUE);
        assertEq(adv.repayShareBps, 2000);
        assertEq(adv.behindAt, block.timestamp + 2 days);
    }

    function test_onlyOwnerAccepts() public {
        _buildHistory();
        vm.expectRevert(UpfrontErrors.NotPoolOwner.selector);
        advDesk.acceptOffer(poolId, 0, 1200);
    }

    function test_acceptRevertsIfOfferChanged() public {
        _buildHistory();
        vm.startPrank(poolOwner);
        vm.expectRevert(UpfrontErrors.OfferChanged.selector);
        advDesk.acceptOffer(poolId, PRINCIPAL + 1, 600);
        vm.expectRevert(UpfrontErrors.OfferChanged.selector);
        advDesk.acceptOffer(poolId, PRINCIPAL, 599);
        vm.stopPrank();
    }

    function test_acceptRevertsWhenNotEligible() public {
        vm.prank(poolOwner);
        vm.expectRevert(UpfrontErrors.HistoryTooShort.selector);
        advDesk.acceptOffer(poolId, 0, 1200);
    }

    function test_noSecondAdvanceWhileOpen() public {
        _buildHistory();
        vm.startPrank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.expectRevert(UpfrontErrors.AdvanceOpen.selector);
        advDesk.acceptOffer(poolId, 0, 1200);
        vm.stopPrank();
    }

    function test_ownershipLockedByRealAdvance() public {
        _buildHistory();
        vm.startPrank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.expectRevert(UpfrontErrors.AdvanceOpen.selector);
        launcher.transferPoolOwnership(poolId, makeAddr("next"));
        vm.stopPrank();
    }

    // --- repayment ---

    function test_settleSplitsPrincipalLenderFeeAndProtocol() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);

        _swap(true, true, DAY_SWAP, ""); // owner earns 700, 20% = 140 repays
        uint256 repay = 140e6;
        assertEq(upfront.advanceOf(poolId).repaid, repay);

        uint256 vaultBefore = usdgToken.balanceOf(address(vault));
        uint256 treasuryBefore = usdgToken.balanceOf(treasury);
        uint256 got = advDesk.settle(poolId);
        assertEq(got, repay);

        uint256 principalPart = (repay * PRINCIPAL + TOTAL_DUE - 1) / TOTAL_DUE;
        uint256 feePart = repay - principalPart;
        uint256 protocolFee = feePart * 1500 / 10_000;
        assertEq(usdgToken.balanceOf(treasury) - treasuryBefore, protocolFee);
        assertEq(usdgToken.balanceOf(address(vault)) - vaultBefore, principalPart + feePart - protocolFee);
        assertEq(vault.outstanding(), PRINCIPAL - principalPart);
        assertEq(usdgToken.balanceOf(address(advDesk)), 0);
    }

    function test_settleNothingReverts() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.expectRevert(UpfrontErrors.NothingToSettle.selector);
        advDesk.settle(poolId);
    }

    function test_fullRepaymentClosesAndLendersEarnTheFee() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);

        uint256 treasuryBefore = usdgToken.balanceOf(treasury);
        uint256 guard;
        while (upfront.isAdvanceOpen(poolId) && guard++ < 100) {
            _swap(true, true, DAY_SWAP, "");
        }
        assertFalse(upfront.isAdvanceOpen(poolId));
        assertEq(upfront.advanceOf(poolId).repaid, TOTAL_DUE);
        advDesk.settle(poolId);

        uint256 flat = TOTAL_DUE - PRINCIPAL;
        uint256 protocolFee = flat * 1500 / 10_000;
        assertEq(usdgToken.balanceOf(treasury) - treasuryBefore, protocolFee);
        assertEq(vault.outstanding(), 0);
        assertEq(vault.totalAssets(), LENDER_DEPOSIT + flat - protocolFee);
        assertEq(usdgToken.balanceOf(address(advDesk)), 0);

        // Ownership is free again, and the full share resumes.
        vm.prank(poolOwner);
        launcher.transferPoolOwnership(poolId, makeAddr("next"));
    }

    function test_settleInPiecesEqualsSettleOnce() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        uint256 guard;
        while (upfront.isAdvanceOpen(poolId) && guard++ < 100) {
            _swap(true, true, DAY_SWAP, "");
            if (guard % 3 == 0 && upfront.advanceOf(poolId).repaid > advDesk.recordOf(poolId).settled) {
                advDesk.settle(poolId);
            }
        }
        uint256 flat = TOTAL_DUE - PRINCIPAL;
        uint256 pendingBefore = upfront.advanceOf(poolId).repaid - advDesk.recordOf(poolId).settled;
        if (pendingBefore != 0) advDesk.settle(poolId);
        assertEq(vault.outstanding(), 0);
        assertEq(vault.totalAssets(), LENDER_DEPOSIT + flat - flat * 1500 / 10_000);
    }

    function test_cannotStartNewAdvanceUntilSettled() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        uint256 guard;
        while (upfront.isAdvanceOpen(poolId) && guard++ < 100) {
            _swap(true, true, DAY_SWAP, "");
        }
        Offer memory o = advDesk.getOffer(poolId);
        assertFalse(o.eligible);
        assertEq(o.reason, UpfrontErrors.SettleFirst.selector);

        advDesk.settle(poolId);
        // Rebuild a record; then a second advance is possible.
        for (uint256 i; i < 5; ++i) {
            skip(1 days);
            _swap(true, true, DAY_SWAP, "");
        }
        skip(1 days);
        assertTrue(advDesk.getOffer(poolId).eligible);
    }

    function test_behindScheduleRoutesWholeShareToRepayment() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        skip(2 days);
        uint256 ownerBefore = upfront.claimable(poolOwner);
        _swap(true, true, DAY_SWAP, "");
        assertEq(upfront.claimable(poolOwner), ownerBefore);
        assertEq(upfront.advanceOf(poolId).repayShareBps, 10_000);
        assertEq(upfront.advanceOf(poolId).repaid, 700e6);
    }

    // --- write-off ---

    function test_writeOffOnlyLongAfterSchedule() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.expectRevert(UpfrontErrors.NotWrittenOffYet.selector);
        advDesk.writeOff(poolId);
        skip(2 days + 180 days - 1);
        vm.expectRevert(UpfrontErrors.NotWrittenOffYet.selector);
        advDesk.writeOff(poolId);
    }

    function test_writeOffIsALossForLendersAndUnlocksOwnership() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        skip(2 days + 180 days);
        advDesk.writeOff(poolId);

        assertEq(vault.outstanding(), 0);
        assertEq(vault.writtenOff(), PRINCIPAL);
        assertEq(vault.totalAssets(), LENDER_DEPOSIT - PRINCIPAL);
        assertFalse(upfront.isAdvanceOpen(poolId));
        vm.prank(poolOwner);
        launcher.transferPoolOwnership(poolId, makeAddr("next"));
    }

    function test_writeOffSettlesWhatWasRepaidFirst() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        _swap(true, true, DAY_SWAP, "");
        uint256 repay = 140e6;
        uint256 principalPart = (repay * PRINCIPAL + TOTAL_DUE - 1) / TOTAL_DUE;
        skip(2 days + 180 days);
        advDesk.writeOff(poolId);
        assertEq(vault.writtenOff(), PRINCIPAL - principalPart);
        assertEq(usdgToken.balanceOf(address(advDesk)), 0);
    }

    // --- admin ---

    function test_pauseStopsNewAdvancesOnly() public {
        _buildHistory();
        vm.prank(admin);
        advDesk.setPaused(true);
        Offer memory o = advDesk.getOffer(poolId);
        assertEq(o.reason, UpfrontErrors.AdvancesPaused.selector);
        vm.prank(poolOwner);
        vm.expectRevert(UpfrontErrors.AdvancesPaused.selector);
        advDesk.acceptOffer(poolId, 0, 1200);

        // Swaps and claims still work.
        _swap(true, true, DAY_SWAP, "");
        vm.prank(poolOwner);
        upfront.claim();
    }

    function test_pauseDoesNotStopRepaymentOfLiveAdvance() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.prank(admin);
        advDesk.setPaused(true);
        _swap(true, true, DAY_SWAP, "");
        advDesk.settle(poolId);
    }

    function test_onlyAdminAndBounded() public {
        vm.expectRevert(UpfrontErrors.NotAdvanceAdmin.selector);
        advDesk.setPaused(true);
        vm.expectRevert(UpfrontErrors.NotAdvanceAdmin.selector);
        advDesk.setOfferSettings(1e6, 100, 2000);

        vm.startPrank(admin);
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        advDesk.setOfferSettings(0, 100, 2000);
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        advDesk.setOfferSettings(1e6, 5001, 2000);
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        advDesk.setOfferSettings(1e6, 100, 999);
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        advDesk.setOfferSettings(1e6, 100, 5001);
        vm.stopPrank();
    }

    function test_liveAdvanceKeepsItsTerms() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, PRINCIPAL, 600);
        vm.prank(admin);
        advDesk.setOfferSettings(1e6, 100, 5000);
        assertEq(upfront.advanceOf(poolId).repayShareBps, 2000);
        assertEq(upfront.advanceOf(poolId).totalDue, TOTAL_DUE);
    }

    function test_constructorBounds() public {
        DeskParams memory p = DeskParams(1, 1, 10e6, 2 days, 1e9, 5000, 2000);
        p.periodDays = 8;
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        new AdvanceDesk(upfront, vault, admin, p);
        p.periodDays = 1;
        p.minPeriodEarnings = 0;
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        new AdvanceDesk(upfront, vault, admin, p);
        p.minPeriodEarnings = 10e6;
        p.behindAfter = 1 hours;
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        new AdvanceDesk(upfront, vault, admin, p);
    }

    function test_deskCannotBeRewired() public {
        vm.expectRevert(UpfrontErrors.AlreadyWired.selector);
        upfront.wire(address(1), address(2));
        vm.expectRevert(UpfrontErrors.DeskAlreadySet.selector);
        vault.wire(address(1));
    }
}
