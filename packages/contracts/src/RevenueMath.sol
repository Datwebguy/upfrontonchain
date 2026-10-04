// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FeeSplit, PoolConfig} from "./Types.sol";

/// @title RevenueMath
/// @notice Pure maths for Upfront: fees, splits, repayment and daily earnings buckets.
/// @dev Everything here is pure so the swap path and the quote views share one implementation (I-3).
///      USDG has 6 decimals. Every amount in this library is in USDG units.
library RevenueMath {
    /// @notice 100% in basis points.
    uint256 internal constant BPS = 10_000;

    /// @notice Number of daily earnings buckets kept per pool (BUILD_SPEC §6).
    uint256 internal constant HISTORY_DAYS = 35;

    /// @dev A bucket packs the day in the top 32 bits and the amount in the low 224 bits.
    uint256 private constant AMOUNT_BITS = 224;
    uint256 private constant MAX_BUCKET_AMOUNT = (1 << AMOUNT_BITS) - 1;

    // ---------------------------------------------------------------------
    // Fees and splits
    // ---------------------------------------------------------------------

    /// @notice The Upfront fee for a USDG amount.
    /// @dev Rounds down, so the trader never pays more than the shown rate (AGENTS.md §5).
    ///      `usdgAmount` comes from an int128 swap amount, so the product cannot overflow.
    function feeFor(uint256 usdgAmount, uint256 feeBps) internal pure returns (uint256) {
        return usdgAmount * feeBps / BPS;
    }

    /// @notice Split a fee between owner, app, referrer and protocol. Repayment is not applied here.
    /// @dev App, referrer and protocol round down. The owner receives the remainder, so the parts
    ///      always sum to `fee` exactly (I-2) and rounding dust favours the owner.
    ///      With no referrer, the referrer share goes to the owner (BUILD_SPEC §4.5).
    function split(uint256 fee, PoolConfig memory cfg, bool hasReferrer) internal pure returns (FeeSplit memory s) {
        s.app = fee * cfg.appBps / BPS;
        s.protocol = fee * cfg.protocolBps / BPS;
        if (hasReferrer) s.referrer = fee * cfg.referrerBps / BPS;
        // Shares sum to BPS, so app + protocol + referrer <= fee and this cannot underflow.
        s.owner = fee - s.app - s.protocol - s.referrer;
    }

    /// @notice The part of the owner's earnings that goes to an open advance.
    /// @dev Rounds up, in the lenders' favour (AGENTS.md §5), then is capped at `ownerGross` and at `remaining`,
    ///      so repayment only ever comes from the owner's share (I-6) and never exceeds what is due (I-7).
    function repayPortion(uint256 ownerGross, uint256 repayShareBps, uint256 remaining)
        internal
        pure
        returns (uint256 repay)
    {
        repay = (ownerGross * repayShareBps + BPS - 1) / BPS;
        if (repay > ownerGross) repay = ownerGross;
        if (repay > remaining) repay = remaining;
    }

    // ---------------------------------------------------------------------
    // Offers (BUILD_SPEC §7)
    // ---------------------------------------------------------------------

    /// @notice Lowest and total owner earnings across the last `periods` complete periods.
    /// @dev `amounts[0]` is today and is skipped because today is not complete. Period 0 is the most recent complete
    ///      one: days 1..periodDays ago. The window must fit the 35-day buffer, so `periods * periodDays <= 34`.
    ///      Bounded loops over a fixed-size window. Only used in views and `acceptOffer`, never in a swap.
    function weakestPeriod(uint256[35] memory amounts, uint256 periodDays, uint256 periods)
        internal
        pure
        returns (uint256 weakest, uint256 total)
    {
        weakest = type(uint256).max;
        for (uint256 p; p < periods; ++p) {
            uint256 sum;
            for (uint256 d = 1; d <= periodDays; ++d) {
                sum += amounts[p * periodDays + d];
            }
            total += sum;
            if (sum < weakest) weakest = sum;
        }
        if (periods == 0) weakest = 0;
    }

    /// @notice The flat fee in basis points: from `minBps` when earnings are perfectly steady to `maxBps` when the
    ///         weakest period is nothing (BUILD_SPEC §7: "lower when weekly earnings are steadier").
    /// @dev Steadiness is weakest / average, capped at 100%. Rounds up, in the lenders' favour.
    function flatFeeBps(uint256 weakest, uint256 total, uint256 periods, uint256 minBps, uint256 maxBps)
        internal
        pure
        returns (uint256)
    {
        if (total == 0) return maxBps;
        uint256 steadiness = weakest * periods * BPS / total; // weakest <= total / periods, so <= BPS
        if (steadiness > BPS) steadiness = BPS;
        uint256 discount = (maxBps - minBps) * steadiness / BPS; // rounds down, so the fee rounds up
        return maxBps - discount;
    }

    /// @notice The advance principal: `weakest * multiplier`, capped by the pool cap and by a share of the vault's
    ///         idle USDG.
    function offerAmount(
        uint256 weakest,
        uint256 multiplier,
        uint256 poolCap,
        uint256 vaultIdle,
        uint256 maxVaultShareBps
    ) internal pure returns (uint256 amount) {
        amount = weakest * multiplier;
        if (amount > poolCap) amount = poolCap;
        uint256 vaultLimit = vaultIdle * maxVaultShareBps / BPS;
        if (amount > vaultLimit) amount = vaultLimit;
    }

    /// @notice Principal plus the flat fee. Rounds up, in the lenders' favour.
    function totalDue(uint256 principal, uint256 flatBps) internal pure returns (uint256) {
        return (principal * (BPS + flatBps) + BPS - 1) / BPS;
    }

    /// @notice How much of the cumulative `repaid` has gone to principal. Rounds up, so principal is returned
    ///         first-ish and the vault is never short. Equals `principal` exactly once `repaid == due`.
    function principalPaid(uint256 repaid, uint256 principal, uint256 due) internal pure returns (uint256) {
        if (repaid >= due) return principal;
        return (repaid * principal + due - 1) / due;
    }

    // ---------------------------------------------------------------------
    // Daily earnings buckets
    // ---------------------------------------------------------------------

    /// @notice The day number for a timestamp.
    function dayOf(uint256 timestamp) internal pure returns (uint32) {
        return uint32(timestamp / 1 days);
    }

    /// @notice The ring-buffer slot for a day.
    function slotOf(uint32 day) internal pure returns (uint256) {
        return uint256(day) % HISTORY_DAYS;
    }

    /// @notice Pack a day and an amount into one bucket.
    function packBucket(uint32 day, uint256 amount) internal pure returns (uint256) {
        return (uint256(day) << AMOUNT_BITS) | amount;
    }

    /// @notice The amount stored in `bucket` for `day`, or zero if the bucket holds an older day.
    function bucketAmount(uint256 bucket, uint32 day) internal pure returns (uint256) {
        if (uint32(bucket >> AMOUNT_BITS) != day) return 0;
        return bucket & MAX_BUCKET_AMOUNT;
    }

    /// @notice Add `amount` to `bucket` for `day`, resetting it first if it holds an older day.
    /// @dev Saturates instead of overflowing, so recording earnings can never make a swap fail (rule 4).
    function addToBucket(uint256 bucket, uint32 day, uint256 amount) internal pure returns (uint256) {
        uint256 current = bucketAmount(bucket, day);
        uint256 next;
        unchecked {
            // current < 2^224 and amount < 2^128, so this cannot overflow 256 bits.
            next = current + amount;
        }
        if (next > MAX_BUCKET_AMOUNT) next = MAX_BUCKET_AMOUNT;
        return packBucket(day, next);
    }
}
