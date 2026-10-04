// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {UpfrontErrors} from "../../src/Errors.sol";
import {RevenueMath} from "../../src/RevenueMath.sol";
import {Advance, FeeSplit, PoolConfig, PoolState} from "../../src/Types.sol";
import {LaunchParams} from "../../src/UpfrontLauncher.sol";
import {UpfrontBase} from "../utils/UpfrontBase.t.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract UpfrontHookTest is UpfrontBase {
    uint96 internal constant ONE = 1e6; // 1 USDG

    function _fee(uint256 usdgAmount) internal pure returns (uint256) {
        return usdgAmount * FEE_BPS / 10_000;
    }

    function _total() internal view returns (uint256) {
        return upfront.claimable(poolOwner) + upfront.claimable(app) + upfront.claimable(referrer)
            + upfront.claimable(treasury) + upfront.claimable(desk);
    }

    // --- permissions ---

    function test_hookAddressEncodesExactFlags() public view {
        assertEq(uint160(address(upfront)) & Hooks.ALL_HOOK_MASK, HOOK_FLAGS);
        Hooks.validateHookPermissions(IHooks(address(upfront)), upfront.getHookPermissions());
    }

    // --- fee maths: both directions, USDG specified and unspecified ---

    function test_exactIn_usdgSpecified_chargesQuotedFee() public {
        uint256 amount = 1000 * ONE;
        uint256 quoted = upfront.quoteFee(poolId, amount);
        uint256 before = usdgToken.balanceOf(address(this));
        _swap(true, true, amount, "");
        // The trader pays exactly the amount they specified; the fee comes out of it.
        assertEq(before - usdgToken.balanceOf(address(this)), amount);
        assertEq(_total(), quoted);
        assertEq(quoted, _fee(amount));
    }

    function test_exactOut_usdgSpecified_chargesQuotedFee() public {
        uint256 amount = 1000 * ONE;
        uint256 quoted = upfront.quoteFee(poolId, amount);
        uint256 before = usdgToken.balanceOf(address(this));
        _swap(false, false, amount, "");
        // Trader receives exactly what they asked for.
        assertEq(usdgToken.balanceOf(address(this)) - before, amount);
        assertEq(_total(), quoted);
    }

    function test_exactIn_usdgUnspecified_chargesFeeOnOutput() public {
        uint256 amount = 1000 ether;
        uint256 before = usdgToken.balanceOf(address(this));
        _swap(false, true, amount, "");
        uint256 received = usdgToken.balanceOf(address(this)) - before;
        // Fee is 1% of the pool's USDG output, taken from the trader's side.
        uint256 fee = _total();
        assertEq(fee, upfront.quoteFee(poolId, received + fee));
        assertGt(fee, 0);
    }

    function test_exactOut_usdgUnspecified_chargesFeeOnInput() public {
        uint256 amount = 1000 ether;
        uint256 before = usdgToken.balanceOf(address(this));
        _swap(true, false, amount, "");
        uint256 paid = before - usdgToken.balanceOf(address(this));
        uint256 fee = _total();
        // Pool's USDG input plus the fee equals what the trader paid.
        assertEq(fee, upfront.quoteFee(poolId, paid - fee));
        assertGt(fee, 0);
    }

    function test_feeRoundsDown() public pure {
        assertEq(RevenueMath.feeFor(99, 100), 0);
        assertEq(RevenueMath.feeFor(199, 100), 1);
    }

    function test_dustSwapChargesNoFeeAndDoesNotRevert() public {
        _swap(true, true, 99, "");
        assertEq(_total(), 0);
    }

    function test_maxFeeIsTwoPercent() public {
        _launchSecond(200);
        vm.expectRevert(UpfrontErrors.FeeAboveMax.selector);
        launcher.launch(_withFee(201));
    }

    // --- splits ---

    function test_splitSumsToFeeWithReferrer() public {
        uint256 amount = 12_345_678;
        _swap(true, true, amount, abi.encode(referrer));
        uint256 fee = _fee(amount);
        assertEq(_total(), fee);
        assertEq(upfront.claimable(referrer), fee * 1000 / 10_000);
        assertEq(upfront.claimable(app), fee * 2000 / 10_000);
        assertEq(upfront.claimable(treasury), fee * PROTOCOL_BPS / 10_000);
    }

    function test_missingReferrerShareGoesToOwner() public {
        uint256 amount = 1000 * ONE;
        _swap(true, true, amount, "");
        uint256 fee = _fee(amount);
        assertEq(upfront.claimable(referrer), 0);
        assertEq(upfront.claimable(poolOwner), fee - fee * 2000 / 10_000 - fee * PROTOCOL_BPS / 10_000);
        assertEq(_total(), fee);
    }

    function test_malformedHookDataNeverReverts() public {
        uint256 amount = 100 * ONE;
        bytes[] memory datas = new bytes[](5);
        datas[0] = hex"01"; // too short
        datas[1] = abi.encodePacked(bytes32(type(uint256).max)); // dirty upper bits
        datas[2] = abi.encode(address(0)); // zero
        datas[3] = abi.encode(address(upfront)); // the hook itself
        datas[4] = new bytes(5000); // long
        for (uint256 i; i < datas.length; ++i) {
            _swap(true, true, amount, datas[i]);
        }
        assertEq(upfront.claimable(referrer), 0);
        assertEq(upfront.claimable(address(upfront)), 0);
        assertEq(_total(), _fee(amount) * datas.length);
    }

    function test_longValidReferrerDataStillParses() public {
        _swap(true, true, 100 * ONE, abi.encodePacked(abi.encode(referrer), hex"deadbeef"));
        assertGt(upfront.claimable(referrer), 0);
    }

    // --- earnings record ---

    function test_recordsDailyEarningsAndLifetimeTotal() public {
        uint256 amount = 1000 * ONE;
        _swap(true, true, amount, "");
        uint32 today = RevenueMath.dayOf(block.timestamp);
        uint256 ownerGross = upfront.claimable(poolOwner);
        assertEq(upfront.dailyEarnings(poolId, today), ownerGross);
        assertEq(upfront.poolState(poolId).ownerEarned, ownerGross);

        skip(1 days);
        _swap(true, true, amount, "");
        assertEq(upfront.dailyEarnings(poolId, today + 1), ownerGross);
        assertEq(upfront.dailyEarnings(poolId, today), ownerGross);

        // 35 days later the ring-buffer slot is reused, and old days read as zero.
        skip(34 days);
        _swap(true, true, amount, "");
        assertEq(upfront.dailyEarnings(poolId, today), 0);
        assertEq(upfront.dailyEarnings(poolId, today + 35), ownerGross);
    }

    // --- claims ---

    function test_claimPaysBalance() public {
        _swap(true, true, 1000 * ONE, "");
        uint256 owed = upfront.claimable(poolOwner);
        vm.prank(poolOwner);
        assertEq(upfront.claim(), owed);
        assertEq(usdgToken.balanceOf(poolOwner), owed);
        assertEq(upfront.claimable(poolOwner), 0);
    }

    function test_claimZeroReverts() public {
        vm.prank(trader);
        vm.expectRevert(UpfrontErrors.NothingToClaim.selector);
        upfront.claim();
    }

    function test_claimToRecipient() public {
        _swap(true, true, 1000 * ONE, "");
        uint256 owed = upfront.claimable(app);
        vm.prank(app);
        upfront.claimTo(trader);
        assertEq(usdgToken.balanceOf(trader), owed);
    }

    function test_hookHoldsEnoughForEveryClaim() public {
        _swap(true, true, 1000 * ONE, abi.encode(referrer));
        _swap(false, true, 1000 ether, abi.encode(referrer));
        uint256 claims = manager.balanceOf(address(upfront), usdgC.toId());
        assertGe(claims, _total());
    }

    // --- access (I-9) ---

    function test_callbacksOnlyFromPoolManager() public {
        PoolKey memory k = poolKey;
        vm.expectRevert();
        upfront.beforeInitialize(address(launcher), k, 0);
    }

    function test_onlyLauncherRegistersPools() public {
        PoolConfig memory cfg;
        vm.expectRevert(UpfrontErrors.NotLauncher.selector);
        upfront.registerPool(poolKey, cfg, app);
    }

    function test_poolNotCreatedByLauncherIsRejected() public {
        PoolKey memory k = poolKey;
        k.fee = 500;
        vm.expectRevert();
        manager.initialize(k, 79_228_162_514_264_337_593_543_950_336);
    }

    function test_wireOnlyOnce() public {
        vm.expectRevert(UpfrontErrors.AlreadyWired.selector);
        upfront.wire(address(1), address(2));
    }

    // --- launcher rules ---

    function test_poolWithoutUsdgIsRejected() public {
        MockERC20Alt other = new MockERC20Alt();
        PoolKey memory k = PoolKey({
            currency0: Currency.wrap(address(other)) < stockC ? Currency.wrap(address(other)) : stockC,
            currency1: Currency.wrap(address(other)) < stockC ? stockC : Currency.wrap(address(other)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(upfront))
        });
        PoolConfig memory cfg = PoolConfig(poolOwner, 100, 100, 6000, 2000, 1000, 1000);
        vm.prank(address(launcher));
        vm.expectRevert(UpfrontErrors.PoolNotUsdg.selector);
        upfront.registerPool(k, cfg, app);
    }

    function test_sharesMustSumToWhole() public {
        LaunchParams memory p = _params(FEE_BPS, 6000, 2000, 999);
        vm.expectRevert(UpfrontErrors.InvalidShares.selector);
        launcher.launch(p);
    }

    function test_shareFixedAtLaunch() public view {
        PoolConfig memory cfg = upfront.poolConfig(poolId);
        assertEq(cfg.ownerBps, 6000);
        assertEq(cfg.appBps, 2000);
        assertEq(cfg.referrerBps, 1000);
        assertEq(cfg.protocolBps, PROTOCOL_BPS);
    }

    function test_feeCanOnlyGoDown() public {
        vm.startPrank(poolOwner);
        launcher.lowerFee(poolId, 50);
        assertEq(upfront.poolConfig(poolId).upfrontFeeBps, 50);
        assertEq(upfront.poolConfig(poolId).maxFeeBps, FEE_BPS);
        vm.expectRevert(UpfrontErrors.FeeNotLower.selector);
        launcher.lowerFee(poolId, 50);
        vm.expectRevert(UpfrontErrors.FeeNotLower.selector);
        launcher.lowerFee(poolId, 150);
        vm.stopPrank();
    }

    function test_onlyOwnerLowersFee() public {
        vm.expectRevert(UpfrontErrors.NotPoolOwner.selector);
        launcher.lowerFee(poolId, 50);
    }

    function test_hookRejectsFeeChangeNotFromLauncher() public {
        vm.prank(poolOwner);
        vm.expectRevert(UpfrontErrors.NotLauncher.selector);
        upfront.lowerFee(poolId, 50);
    }

    function test_loweredFeeIsWhatIsCharged() public {
        vm.prank(poolOwner);
        launcher.lowerFee(poolId, 50);
        _swap(true, true, 1000 * ONE, "");
        assertEq(_total(), 1000 * ONE * 50 / 10_000);
    }

    function test_launchRefundsUnusedTokens() public {
        uint256 u = usdgToken.balanceOf(address(this));
        uint256 s = stock.balanceOf(address(this));
        _launchSecond(100);
        // Up to 1e18 of each is pulled, but only the amount the position needs is kept.
        assertGt(usdgToken.balanceOf(address(this)), u - 1e18);
        assertGt(stock.balanceOf(address(this)), s - 1e18);
        assertEq(usdgToken.balanceOf(address(launcher)), 0);
        assertEq(stock.balanceOf(address(launcher)), 0);
    }

    function test_launchMintsPositionToOwner() public view {
        assertEq(IERC721(address(lpm)).ownerOf(1), poolOwner);
    }

    // --- ownership ---

    function test_ownershipTransferNeedsAcceptance() public {
        address next = makeAddr("next");
        vm.prank(poolOwner);
        launcher.transferPoolOwnership(poolId, next);
        assertEq(upfront.ownerOf(poolId), poolOwner);

        vm.expectRevert(UpfrontErrors.NotPendingOwner.selector);
        launcher.acceptPoolOwnership(poolId);

        vm.prank(next);
        launcher.acceptPoolOwnership(poolId);
        assertEq(upfront.ownerOf(poolId), next);

        _swap(true, true, 1000 * ONE, "");
        assertGt(upfront.claimable(next), 0);
    }

    function test_ownershipLockedWhileAdvanceOpen() public {
        vm.prank(desk);
        upfront.openAdvance(poolId, 1000 * ONE, 2000, uint40(block.timestamp + 60 days));

        vm.prank(poolOwner);
        vm.expectRevert(UpfrontErrors.AdvanceOpen.selector);
        launcher.transferPoolOwnership(poolId, makeAddr("next"));
    }

    function test_pendingTransferCannotCompleteWhileAdvanceOpen() public {
        address next = makeAddr("next");
        vm.prank(poolOwner);
        launcher.transferPoolOwnership(poolId, next);
        vm.prank(desk);
        upfront.openAdvance(poolId, 1000 * ONE, 2000, uint40(block.timestamp + 60 days));

        vm.prank(next);
        vm.expectRevert(UpfrontErrors.AdvanceOpen.selector);
        launcher.acceptPoolOwnership(poolId);
        assertEq(upfront.ownerOf(poolId), poolOwner);
    }

    // --- protocol share (admin) ---

    function test_adminSetsProtocolShareForFuturePoolsOnly() public {
        vm.prank(admin);
        launcher.setProtocolShare(500);
        assertEq(upfront.poolConfig(poolId).protocolBps, PROTOCOL_BPS);
    }

    function test_adminBoundedAndAdminOnly() public {
        vm.prank(admin);
        vm.expectRevert(UpfrontErrors.OutOfBounds.selector);
        launcher.setProtocolShare(2001);
        vm.expectRevert(UpfrontErrors.NotLauncherAdmin.selector);
        launcher.setProtocolShare(500);
    }

    // --- advance repayment ---

    function test_repaymentComesOnlyFromOwnerShare() public {
        vm.prank(desk);
        upfront.openAdvance(poolId, 1_000_000 * ONE, 2000, uint40(block.timestamp + 60 days));

        uint256 amount = 1000 * ONE;
        _swap(true, true, amount, abi.encode(referrer));
        uint256 fee = _fee(amount);
        uint256 appShare = fee * 2000 / 10_000;
        uint256 refShare = fee * 1000 / 10_000;
        uint256 protoShare = fee * PROTOCOL_BPS / 10_000;
        uint256 ownerGross = fee - appShare - refShare - protoShare;

        // Rule 6: app, referrer and protocol are untouched by an advance.
        assertEq(upfront.claimable(app), appShare);
        assertEq(upfront.claimable(referrer), refShare);
        assertEq(upfront.claimable(treasury), protoShare);
        assertEq(upfront.claimable(desk), (ownerGross * 2000 + 9999) / 10_000);
        assertEq(upfront.claimable(poolOwner) + upfront.claimable(desk), ownerGross);
        assertEq(_total(), fee);
    }

    function test_advanceClosesInSameTransactionWhenRepaid() public {
        vm.prank(desk);
        upfront.openAdvance(poolId, 100, 2000, uint40(block.timestamp + 60 days));
        assertTrue(upfront.isAdvanceOpen(poolId));

        _swap(true, true, 10_000 * ONE, "");
        assertFalse(upfront.isAdvanceOpen(poolId));
        Advance memory adv = upfront.advanceOf(poolId);
        assertEq(adv.repaid, adv.totalDue);
        assertFalse(adv.open);

        // The owner's full share has resumed.
        uint256 beforeOwner = upfront.claimable(poolOwner);
        uint256 beforeDesk = upfront.claimable(desk);
        _swap(true, true, 1000 * ONE, "");
        assertEq(upfront.claimable(desk), beforeDesk);
        assertGt(upfront.claimable(poolOwner), beforeOwner);

        vm.prank(poolOwner);
        launcher.transferPoolOwnership(poolId, makeAddr("next"));
    }

    function test_behindScheduleTakesWholeOwnerShare() public {
        vm.prank(desk);
        upfront.openAdvance(poolId, 1_000_000 * ONE, 2000, uint40(block.timestamp + 2 days));

        _swap(true, true, 1000 * ONE, "");
        uint256 deskNormal = upfront.claimable(desk);
        uint256 ownerNormal = upfront.claimable(poolOwner);
        assertGt(ownerNormal, 0);

        skip(2 days);
        _swap(true, true, 1000 * ONE, "");
        // After the deadline with under 25% repaid, the owner gets nothing new until repaid.
        assertEq(upfront.claimable(poolOwner), ownerNormal);
        assertGt(upfront.claimable(desk), deskNormal);
        assertEq(upfront.advanceOf(poolId).repayShareBps, 10_000);
    }

    function test_onlyDeskOpensAdvances() public {
        vm.expectRevert(UpfrontErrors.NotAdvanceDesk.selector);
        upfront.openAdvance(poolId, 1, 2000, uint40(block.timestamp + 1 days));
    }

    function test_advanceTermsAreBounded() public {
        vm.startPrank(desk);
        vm.expectRevert(UpfrontErrors.InvalidAdvanceTerms.selector);
        upfront.openAdvance(poolId, 0, 2000, uint40(block.timestamp + 1 days));
        vm.expectRevert(UpfrontErrors.InvalidAdvanceTerms.selector);
        upfront.openAdvance(poolId, 1, 5001, uint40(block.timestamp + 1 days));
        vm.expectRevert(UpfrontErrors.InvalidAdvanceTerms.selector);
        upfront.openAdvance(poolId, 1, 2000, uint40(block.timestamp));
        vm.stopPrank();
    }

    function test_deskCanCloseAdvance() public {
        vm.startPrank(desk);
        upfront.openAdvance(poolId, 1000 * ONE, 2000, uint40(block.timestamp + 1 days));
        upfront.closeAdvance(poolId);
        vm.expectRevert(UpfrontErrors.NoAdvanceOpen.selector);
        upfront.closeAdvance(poolId);
        vm.stopPrank();
    }

    // --- helpers ---

    function _withFee(uint16 feeBps) internal view returns (LaunchParams memory p) {
        p = _params(feeBps, 6000, 2000, 1000);
        p.tickSpacing = 10;
    }

    function _launchSecond(uint16 feeBps) internal returns (uint256, uint256) {
        launcher.launch(_withFee(feeBps));
        return (0, 0);
    }
}

contract MockERC20Alt {}
