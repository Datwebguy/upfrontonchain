// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {AdvanceDesk} from "../../src/AdvanceDesk.sol";
import {LenderVault} from "../../src/LenderVault.sol";
import {Advance} from "../../src/Types.sol";
import {UpfrontHook} from "../../src/UpfrontHook.sol";
import {AdvanceBase} from "../utils/AdvanceBase.t.sol";

/// @dev Drives swaps, time, advances, repayments, ownership attempts, write-offs and lender flows together.
///      Every action is guarded so it only runs when it can succeed: with fail_on_revert, any revert that gets
///      through (for example a swap) fails the run.
contract AdvanceHandler is AdvanceBase {
    address public ownerAtOpen;
    bool public thirdPartyTouched; // rule 6: app, referrer or protocol lost or gained anything extra
    uint256 public advancesTaken;
    uint256 public settles;
    uint256 public writeOffs;
    uint256 public ownershipMoves;

    function setUp() public override {
        super.setUp();
    }

    function swap(uint256 amount) external {
        amount = bound(amount, 5e9, 2e11); // owner earns at least ~35 USDG, above the testnet minimum
        uint256 fee0 = upfront.claimable(app);
        uint256 fee1 = upfront.claimable(treasury);
        uint256 held = manager.balanceOf(address(upfront), usdgC.toId());
        _swap(true, true, amount, "");
        uint256 fee = manager.balanceOf(address(upfront), usdgC.toId()) - held;
        // The app and protocol shares are fixed fractions of every fee, advance or not (rule 6).
        if (
            upfront.claimable(app) - fee0 != fee * 2000 / 10_000
                || upfront.claimable(treasury) - fee1 != fee * PROTOCOL_BPS / 10_000
        ) thirdPartyTouched = true;
    }

    function elapse(uint256 d) external {
        skip(bound(d, 0, 2) * 1 days + 1);
    }

    /// @dev A steady day of trading, so pools build the history an advance needs.
    function dailyTrade(uint256 amount) external {
        _swap(true, true, bound(amount, 5e9, 2e11), "");
        skip(1 days);
    }

    /// @dev Long enough for an unpaid advance to become writable off.
    function elapseLong() external {
        skip(185 days);
    }

    function accept() external {
        if (!advDesk.getOffer(poolId).eligible) return;
        address o = upfront.ownerOf(poolId);
        vm.prank(o);
        advDesk.acceptOffer(poolId, 0, 1200);
        ownerAtOpen = o;
        ++advancesTaken;
    }

    function settle() external {
        if (upfront.advanceOf(poolId).repaid <= advDesk.recordOf(poolId).settled) return;
        if (advDesk.recordOf(poolId).writtenOff) return;
        advDesk.settle(poolId);
        ++settles;
    }

    function tryMoveOwnership() external {
        address next = makeAddr("next");
        address o = upfront.ownerOf(poolId);
        vm.prank(o);
        try launcher.transferPoolOwnership(poolId, next) {} catch {}
        vm.prank(next);
        try launcher.acceptPoolOwnership(poolId) {
            ++ownershipMoves;
        } catch {}
    }

    function writeOff() external {
        if (!upfront.isAdvanceOpen(poolId)) return;
        if (block.timestamp < uint256(upfront.advanceOf(poolId).behindAt) + advDesk.WRITE_OFF_DELAY()) return;
        advDesk.writeOff(poolId);
        ++writeOffs;
    }

    function ownerClaim() external {
        address o = upfront.ownerOf(poolId);
        if (upfront.claimable(o) == 0) return;
        vm.prank(o);
        upfront.claim();
    }

    function lenderDeposit(uint256 amount) external {
        amount = bound(amount, 1e6, 1_000_000e6);
        usdgToken.mint(lender, amount);
        vm.prank(lender);
        vault.deposit(amount, lender);
    }

    function lenderRedeem(uint256 fraction) external {
        uint256 max = vault.maxRedeem(lender);
        uint256 shares = max * bound(fraction, 0, 100) / 100;
        if (shares == 0) return;
        vm.prank(lender);
        vault.redeem(shares, lender, lender);
    }

    // views for the invariant contract
    function theHook() external view returns (UpfrontHook) {
        return upfront;
    }

    function theDesk() external view returns (AdvanceDesk) {
        return advDesk;
    }

    function theVault() external view returns (LenderVault) {
        return vault;
    }

    function usdgBalance(address a) external view returns (uint256) {
        return usdgToken.balanceOf(a);
    }

    function thePool() external view returns (bytes32) {
        return PoolId.unwrap(poolId);
    }
}

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

contract AdvanceInvariantsTest is StdInvariant, Test {
    AdvanceHandler internal h;
    PoolId internal id;
    UpfrontHook internal hook;
    AdvanceDesk internal desk;
    LenderVault internal vault;

    function setUp() public {
        h = new AdvanceHandler();
        h.setUp();
        hook = h.theHook();
        desk = h.theDesk();
        vault = h.theVault();
        id = PoolId.wrap(h.thePool());

        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](11);
        sel[0] = AdvanceHandler.swap.selector;
        sel[1] = AdvanceHandler.elapse.selector;
        sel[2] = AdvanceHandler.accept.selector;
        sel[3] = AdvanceHandler.settle.selector;
        sel[4] = AdvanceHandler.tryMoveOwnership.selector;
        sel[5] = AdvanceHandler.writeOff.selector;
        sel[6] = AdvanceHandler.ownerClaim.selector;
        sel[7] = AdvanceHandler.lenderDeposit.selector;
        sel[8] = AdvanceHandler.lenderRedeem.selector;
        sel[9] = AdvanceHandler.dailyTrade.selector;
        sel[10] = AdvanceHandler.elapseLong.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// I-6: while an advance is open the owner is the one who took it.
    function invariant_I6_ownerLockedWhileOpen() public view {
        if (hook.isAdvanceOpen(id)) assertEq(hook.ownerOf(id), h.ownerAtOpen());
    }

    /// I-6 / rule 6: repayment never touches the app's, referrer's or protocol's share.
    function invariant_I6_onlyOwnerShareIsTaken() public view {
        assertFalse(h.thirdPartyTouched());
    }

    /// I-7: never repaid more than due, and an advance is open exactly until repaid in full (or written off).
    function invariant_I7_repaidNeverExceedsDue() public view {
        Advance memory a = hook.advanceOf(id);
        assertLe(a.repaid, a.totalDue);
        assertEq(a.open, hook.isAdvanceOpen(id));
        if (a.totalDue != 0 && !desk.recordOf(id).writtenOff) {
            assertEq(a.open, a.repaid < a.totalDue);
        }
    }

    /// I-8: assets equal idle USDG plus outstanding principal, and outstanding matches the live advance.
    function invariant_I8_vaultAccounting() public view {
        assertEq(vault.totalAssets(), h.usdgBalance(address(vault)) + vault.outstanding());
        AdvanceDesk.Record memory r = desk.recordOf(id);
        uint256 expected = r.writtenOff ? 0 : r.principal - r.principalSettled;
        assertEq(vault.outstanding(), expected);
    }

    /// The desk can always pay what it owes the vault and the protocol.
    function invariant_deskCanPayWhatItOwes() public view {
        AdvanceDesk.Record memory r = desk.recordOf(id);
        if (r.writtenOff || r.totalDue == 0) return;
        uint256 owed = hook.advanceOf(id).repaid - r.settled;
        assertGe(h.usdgBalance(address(desk)) + hook.claimable(address(desk)), owed);
    }

    /// Every dollar lent out was either repaid, written off, or is still outstanding.
    function invariant_principalConserved() public view {
        AdvanceDesk.Record memory r = desk.recordOf(id);
        if (r.totalDue == 0) return;
        assertLe(r.principalSettled, r.principal);
        assertLe(r.settled, r.totalDue);
    }
}
