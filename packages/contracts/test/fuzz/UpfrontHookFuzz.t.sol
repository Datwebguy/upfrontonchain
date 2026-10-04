// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RevenueMath} from "../../src/RevenueMath.sol";
import {FeeSplit, PoolConfig} from "../../src/Types.sol";
import {UpfrontBase} from "../utils/UpfrontBase.t.sol";

contract UpfrontHookFuzzTest is UpfrontBase {
    /// @dev USDG the hook holds in the PoolManager. Fuzzed hookData can name any referrer, so the fee taken is
    ///      measured here instead of summing a fixed set of payees.
    function _held() internal view returns (uint256) {
        return manager.balanceOf(address(upfront), usdgC.toId());
    }

    /// I-2 and I-3 for USDG as the specified currency, exact in and exact out.
    function testFuzz_usdgSpecified(uint256 amount, bool exactIn, bytes calldata hookData) public {
        amount = bound(amount, 1, 1e12 * 1e6 / 1e4); // up to ~0.01% of pool depth in USDG units
        uint256 quoted = upfront.quoteFee(poolId, amount);
        uint256 heldBefore = _held();
        // USDG is specified when (usdgIn == exactIn).
        _swap(exactIn, exactIn, amount, hookData);
        assertEq(_held() - heldBefore, quoted, "fee charged != fee quoted");
        assertEq(quoted, amount * FEE_BPS / 10_000, "fee rounds down");
    }

    /// I-2 for USDG as the unspecified currency, exact in and exact out.
    function testFuzz_usdgUnspecified(uint256 amount, bool exactIn, bytes calldata hookData) public {
        amount = bound(amount, 1e6, 1e9 ether / 1e9);
        uint256 beforeBal = usdgToken.balanceOf(address(this));
        uint256 heldBefore = _held();
        _swap(!exactIn, exactIn, amount, hookData);
        uint256 fee = _held() - heldBefore;
        uint256 moved =
            exactIn ? usdgToken.balanceOf(address(this)) - beforeBal : beforeBal - usdgToken.balanceOf(address(this));
        uint256 poolLeg = exactIn ? moved + fee : moved - fee;
        assertEq(fee, upfront.quoteFee(poolId, poolLeg), "fee charged != fee quoted");
    }

    /// I-2: the parts always sum to the fee, for any fee and any valid shares.
    function testFuzz_splitSums(uint256 fee, uint16 appBps, uint16 refBps, uint16 protoBps, bool hasRef) public pure {
        fee = bound(fee, 0, type(uint128).max);
        appBps = uint16(bound(appBps, 0, 10_000));
        refBps = uint16(bound(refBps, 0, 10_000 - appBps));
        protoBps = uint16(bound(protoBps, 0, 10_000 - appBps - refBps));
        uint16 ownerBps = 10_000 - appBps - refBps - protoBps;
        PoolConfig memory cfg = PoolConfig(address(1), 100, 100, ownerBps, appBps, refBps, protoBps);
        FeeSplit memory s = RevenueMath.split(fee, cfg, hasRef);
        assertEq(s.owner + s.app + s.referrer + s.protocol, fee);
    }

    /// I-7: repayment never exceeds what is due, nor the owner's share.
    function testFuzz_repayCapped(uint256 gross, uint16 shareBps, uint256 remaining) public pure {
        gross = bound(gross, 0, type(uint128).max);
        shareBps = uint16(bound(shareBps, 0, 10_000));
        remaining = bound(remaining, 0, type(uint96).max);
        uint256 repay = RevenueMath.repayPortion(gross, shareBps, remaining);
        assertLe(repay, gross);
        assertLe(repay, remaining);
    }

    /// Daily buckets saturate and never revert.
    function testFuzz_bucketNeverReverts(uint256 bucket, uint32 day, uint128 amount) public pure {
        RevenueMath.addToBucket(bucket, day, amount);
    }
}
