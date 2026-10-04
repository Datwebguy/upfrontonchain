// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {Advance, PoolConfig} from "../../src/Types.sol";
import {UpfrontHook} from "../../src/UpfrontHook.sol";
import {UpfrontBase} from "../utils/UpfrontBase.t.sol";

/// @dev Drives random swaps, claims, fee cuts and ownership attempts against the real PoolManager.
contract UpfrontHandler is UpfrontBase {
    uint256 public ghostFees; // total fees quoted for the swaps made
    uint256 public ghostClaimed;
    uint16 public lastFeeBps = FEE_BPS;
    bool public feeEverRose;

    address[] internal payees;

    function setUp() public override {
        super.setUp();
        payees = [poolOwner, app, referrer, treasury, desk];
    }

    function payee(uint256 i) external view returns (address) {
        return payees[i % payees.length];
    }

    function swapUsdgSpecified(uint256 amount, bool exactIn, uint8 refKind) external {
        amount = bound(amount, 1, 1e9);
        _doSwap(exactIn, exactIn, amount, refKind);
    }

    function swapUsdgUnspecified(uint256 amount, bool exactIn, uint8 refKind) external {
        amount = bound(amount, 1e6, 1e12); // far inside the pool depth, so swaps never drain the range
        _doSwap(!exactIn, exactIn, amount, refKind);
    }

    function _doSwap(bool usdgIn, bool exactIn, uint256 amount, uint8 refKind) internal {
        bytes memory data;
        uint8 kind = refKind % 4;
        if (kind == 1) data = abi.encode(referrer);
        else if (kind == 2) data = hex"abcd";
        else if (kind == 3) data = abi.encode(type(uint256).max);

        uint256 before = _held();
        // No try/catch: with fail_on_revert, a swap that reverts fails the run (I-10).
        _swap(usdgIn, exactIn, amount, data);
        ghostFees += _held() - before;
    }

    function _held() internal view returns (uint256) {
        return manager.balanceOf(address(upfront), usdgC.toId());
    }

    function claim(uint256 who) external {
        address a = this.payee(who);
        uint256 owed = upfront.claimable(a);
        if (owed == 0) return;
        vm.prank(a);
        upfront.claim();
        ghostClaimed += owed;
    }

    function lowerFee(uint16 newFee) external {
        uint16 cur = upfront.poolConfig(poolId).upfrontFeeBps;
        if (cur == 0) return;
        newFee = uint16(bound(newFee, 0, cur - 1));
        vm.prank(poolOwner);
        launcher.lowerFee(poolId, newFee);
        if (upfront.poolConfig(poolId).upfrontFeeBps > lastFeeBps) feeEverRose = true;
        lastFeeBps = upfront.poolConfig(poolId).upfrontFeeBps;
    }

    function theHook() external view returns (address) {
        return address(upfront);
    }

    function theLauncher() external view returns (address) {
        return address(launcher);
    }

    function thePoolId() external view returns (PoolId) {
        return poolId;
    }

    function sumClaimable() public view returns (uint256 s) {
        for (uint256 i; i < payees.length; ++i) {
            s += upfront.claimable(payees[i]);
        }
    }

    function heldClaims() public view returns (uint256) {
        return _held();
    }
}

contract UpfrontInvariantsTest is StdInvariant, Test {
    UpfrontHandler internal h;
    PoolConfig internal cfg0;

    function setUp() public {
        h = new UpfrontHandler();
        h.setUp();
        cfg0 = UpfrontHook(h.theHook()).poolConfig(h.thePoolId());
        targetContract(address(h));
        bytes4[] memory sel = new bytes4[](4);
        sel[0] = UpfrontHandler.swapUsdgSpecified.selector;
        sel[1] = UpfrontHandler.swapUsdgUnspecified.selector;
        sel[2] = UpfrontHandler.claim.selector;
        sel[3] = UpfrontHandler.lowerFee.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
    }

    /// I-1: the hook holds at least everything that can be claimed.
    function invariant_I1_hookCoversClaims() public view {
        assertGe(h.heldClaims(), h.sumClaimable());
    }

    /// I-2: every fee taken is accounted for as a claim, or was already claimed.
    function invariant_I2_feesAccounted() public view {
        assertEq(h.ghostFees(), h.sumClaimable() + h.ghostClaimed());
    }

    /// I-4: the fee never rises and never exceeds the maximum.
    function invariant_I4_feeOnlyDown() public view {
        PoolConfig memory c = UpfrontHook(h.theHook()).poolConfig(h.thePoolId());
        assertLe(c.upfrontFeeBps, c.maxFeeBps);
        assertLe(c.maxFeeBps, UpfrontHook(h.theHook()).MAX_UPFRONT_FEE_BPS());
        assertFalse(h.feeEverRose());
    }

    /// I-5: shares never change after launch.
    function invariant_I5_sharesImmutable() public view {
        PoolConfig memory c = UpfrontHook(h.theHook()).poolConfig(h.thePoolId());
        assertEq(c.ownerBps, cfg0.ownerBps);
        assertEq(c.appBps, cfg0.appBps);
        assertEq(c.referrerBps, cfg0.referrerBps);
        assertEq(c.protocolBps, cfg0.protocolBps);
    }

    /// I-9: only the PoolManager can drive the hook, and only the launcher creates pools.
    function invariant_I9_wiringFixed() public view {
        assertEq(UpfrontHook(h.theHook()).launcher(), h.theLauncher());
    }
}
