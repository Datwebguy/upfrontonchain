// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdvanceDesk, DeskParams} from "../../src/AdvanceDesk.sol";
import {LenderVault} from "../../src/LenderVault.sol";
import {UpfrontBase} from "./UpfrontBase.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Same fixtures as UpfrontBase, with the real vault and desk wired in and a lender who has deposited.
abstract contract AdvanceBase is UpfrontBase {
    LenderVault internal vault;
    AdvanceDesk internal advDesk;
    address internal lender = makeAddr("lender");

    uint256 internal constant LENDER_DEPOSIT = 1_000_000e6;
    uint256 internal constant DAY_SWAP = 100_000e6; // USDG per daily swap; owner earns 700 USDG of the 1,000 fee

    function setUp() public virtual override {
        vm.warp(1000 days); // so the 35-day record never reaches before day 0
        super.setUp();

        usdgToken.mint(lender, LENDER_DEPOSIT);
        vm.startPrank(lender);
        usdgToken.approve(address(vault), type(uint256).max);
        vault.deposit(LENDER_DEPOSIT, lender);
        vm.stopPrank();
    }

    function _wireDesk() internal override {
        vault = new LenderVault(IERC20(address(usdgToken)), address(this));
        advDesk = new AdvanceDesk(
            upfront,
            vault,
            admin,
            DeskParams({
                periodDays: 1,
                minHistoryDays: 1,
                minPeriodEarnings: 10e6,
                behindAfter: 2 days,
                poolCap: 100_000e6,
                maxVaultShareBps: 5000,
                repayShareBps: 2000
            })
        );
        vault.wire(address(advDesk));
        upfront.wire(address(launcher), address(advDesk));
        desk = address(advDesk);
    }

    /// @dev Five days of identical trading: the four complete days before today each earned the owner 700 USDG.
    function _buildHistory() internal {
        for (uint256 i; i < 5; ++i) {
            _swap(true, true, DAY_SWAP, "");
            skip(1 days);
        }
    }
}
