// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice A pool's fixed settings. Packed into exactly one storage slot so a swap reads it once.
/// @dev Shares are in basis points of the Upfront fee and always sum to 10_000 (I-2).
///      Only `owner` and `upfrontFeeBps` can ever change, and the fee can only go down (I-4, I-5).
struct PoolConfig {
    /// @notice Who earns the owner share and can take an advance.
    address owner;
    /// @notice The Upfront fee charged now, in basis points of the USDG leg.
    uint16 upfrontFeeBps;
    /// @notice The fee at launch. The most a trader will ever pay in this pool.
    uint16 maxFeeBps;
    /// @notice Owner share of each Upfront fee.
    uint16 ownerBps;
    /// @notice App share of each Upfront fee.
    uint16 appBps;
    /// @notice Referrer share of each Upfront fee. Goes to the owner when a trade has no referrer.
    uint16 referrerBps;
    /// @notice Protocol share of each Upfront fee, fixed at launch.
    uint16 protocolBps;
}

/// @notice A pool's app address plus its running owner earnings. One slot.
struct PoolState {
    /// @notice The app the pool was launched for. Zero only when `appBps` is zero.
    address app;
    /// @notice Lifetime owner earnings in USDG (6 decimals), before any repayment is taken.
    uint88 ownerEarned;
    /// @notice True while an advance is open. Mirrors `Advance.open` so swaps skip the advance slot otherwise.
    bool advanceOpen;
}

/// @notice An open or closed advance, as tracked by the hook. One slot.
struct Advance {
    /// @notice Principal plus flat fee, in USDG.
    uint96 totalDue;
    /// @notice Repaid so far, in USDG. Never exceeds `totalDue` (I-7).
    uint96 repaid;
    /// @notice Share of the owner's earnings that goes to repayment, in basis points.
    uint16 repayShareBps;
    /// @notice When the behind-schedule check starts to apply (unix seconds).
    uint40 behindAt;
    /// @notice True from acceptance until repaid in full or closed by the AdvanceDesk.
    bool open;
}

/// @notice How one Upfront fee was split. Amounts always sum to `fee` (I-2).
struct FeeSplit {
    uint256 owner;
    uint256 app;
    uint256 referrer;
    uint256 protocol;
    uint256 repay;
}
