// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {UpfrontErrors} from "../../src/Errors.sol";
import {AdvanceBase} from "../utils/AdvanceBase.t.sol";

contract LenderVaultTest is AdvanceBase {
    address internal other = makeAddr("other");

    function test_depositAndWithdrawRoundTrip() public {
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        uint256 out = vault.redeem(shares, lender, lender);
        assertEq(out, LENDER_DEPOSIT); // no loss on an untouched vault
        assertEq(vault.totalAssets(), 0);
    }

    function test_lenderCannotWithdrawLentOutFunds() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, 2800e6, 600);

        uint256 idle = vault.idle();
        assertEq(idle, LENDER_DEPOSIT - 2800e6);
        assertEq(vault.maxWithdraw(lender), idle);
        assertLe(vault.previewRedeem(vault.maxRedeem(lender)), idle);

        vm.prank(lender);
        vm.expectRevert();
        vault.withdraw(idle + 1, lender, lender);

        vm.prank(lender);
        vault.withdraw(idle, lender, lender);
        assertEq(vault.idle(), 0);
    }

    function test_sharePriceRisesAfterRepayment() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, 2800e6, 600);
        uint256 priceBefore = vault.convertToAssets(1e12);
        uint256 guard;
        while (upfront.isAdvanceOpen(poolId) && guard++ < 100) {
            _swap(true, true, DAY_SWAP, "");
        }
        advDesk.settle(poolId);
        assertGt(vault.convertToAssets(1e12), priceBefore);
    }

    function test_sharePriceFallsAfterShortfall() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, 2800e6, 600);
        uint256 priceBefore = vault.convertToAssets(1e12);
        skip(2 days + 180 days);
        advDesk.writeOff(poolId);
        assertLt(vault.convertToAssets(1e12), priceBefore);
    }

    function test_roundingFavoursTheVault() public {
        // A dust deposit never mints shares worth more than was paid in.
        usdgToken.mint(other, 55);
        vm.startPrank(other);
        usdgToken.approve(address(vault), type(uint256).max);
        for (uint256 a = 1; a <= 10; ++a) {
            uint256 shares = vault.deposit(a, other);
            assertLe(vault.convertToAssets(shares), a);
        }
        vm.stopPrank();
    }

    function test_donationDoesNotStealLaterDeposits() public {
        // Fresh vault: attacker deposits 1 wei and donates, victim deposits next.
        usdgToken.mint(other, 1e6 + 10_000e6);
        address victim = makeAddr("victim");
        usdgToken.mint(victim, 5000e6);
        uint256 lenderShares = vault.balanceOf(lender);
        vm.prank(lender);
        vault.redeem(lenderShares, lender, lender);

        vm.startPrank(other);
        usdgToken.approve(address(vault), type(uint256).max);
        vault.deposit(1, other);
        usdgToken.transfer(address(vault), 10_000e6);
        vm.stopPrank();

        vm.startPrank(victim);
        usdgToken.approve(address(vault), type(uint256).max);
        vault.deposit(5000e6, victim);
        vm.stopPrank();
        // The victim keeps (nearly) everything they put in.
        assertGt(vault.convertToAssets(vault.balanceOf(victim)), 4990e6);
    }

    function test_onlyDeskMovesAdvanceFunds() public {
        PoolId id = poolId;
        vm.expectRevert(UpfrontErrors.NotVaultDesk.selector);
        vault.fundAdvance(id, other, 1);
        vm.expectRevert(UpfrontErrors.NotVaultDesk.selector);
        vault.receiveRepayment(id, 1, 0);
        vm.expectRevert(UpfrontErrors.NotVaultDesk.selector);
        vault.writeOff(id, 1);
    }

    function test_deskCannotFundMoreThanIdle() public {
        vm.prank(address(advDesk));
        vm.expectRevert(UpfrontErrors.VaultLiquidityLow.selector);
        vault.fundAdvance(poolId, other, LENDER_DEPOSIT + 1);
    }

    function test_totalAssetsEqualsIdlePlusOutstanding() public {
        _buildHistory();
        vm.prank(poolOwner);
        advDesk.acceptOffer(poolId, 2800e6, 600);
        assertEq(vault.totalAssets(), usdgToken.balanceOf(address(vault)) + vault.outstanding());
    }
}
