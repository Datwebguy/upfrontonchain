// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Events shared by Upfront contracts. The indexer and app depend on these.
/// @dev Never remove or rename an event without shipping a new version (AGENTS.md §5).
interface UpfrontEvents {
    // --- UpfrontHook ---

    /// @notice The hook was wired to its launcher and advance desk. Happens once.
    event Wired(address indexed launcher, address indexed advanceDesk);

    /// @notice A pool was registered with its fixed settings.
    event PoolRegistered(
        PoolId indexed poolId,
        address indexed owner,
        address indexed app,
        uint16 upfrontFeeBps,
        uint16 ownerBps,
        uint16 appBps,
        uint16 referrerBps,
        uint16 protocolBps
    );

    /// @notice An Upfront fee was taken on a swap, and how it was split.
    /// @param trader The address that called the PoolManager (usually a router).
    /// @param referrer The referrer read from hookData, or zero if none.
    /// @param usdgAmount The USDG leg the fee was charged on.
    /// @param fee The total Upfront fee. Always equals quoteFee(poolId, usdgAmount) (I-3).
    /// @param day The day bucket (block.timestamp / 1 days).
    event FeeTaken(
        PoolId indexed poolId,
        address indexed trader,
        address indexed referrer,
        uint256 usdgAmount,
        uint256 fee,
        uint32 day,
        uint256 ownerAmount,
        uint256 appAmount,
        uint256 referrerAmount,
        uint256 protocolAmount,
        uint256 repayAmount
    );

    /// @notice A pool's Upfront fee was lowered.
    event FeeLowered(PoolId indexed poolId, uint16 oldFeeBps, uint16 newFeeBps);

    /// @notice A pool changed owner.
    event PoolOwnerChanged(PoolId indexed poolId, address indexed previousOwner, address indexed newOwner);

    /// @notice A USDG balance was paid out.
    event Claimed(address indexed account, address indexed recipient, uint256 amount);

    /// @notice An advance was opened on a pool.
    event AdvanceOpened(PoolId indexed poolId, uint96 totalDue, uint16 repayShareBps, uint40 behindAt);

    /// @notice An advance fell behind schedule. All of the owner's share now goes to repayment until repaid.
    event AdvanceBehindSchedule(PoolId indexed poolId, uint96 repaid, uint96 totalDue);

    /// @notice An advance was repaid in full and closed in the same transaction.
    event AdvanceRepaid(PoolId indexed poolId, uint96 totalDue);

    /// @notice An advance was closed by the AdvanceDesk before being repaid in full.
    event AdvanceClosed(PoolId indexed poolId, uint96 repaid, uint96 totalDue);

    // --- UpfrontLauncher ---

    /// @notice A pool was launched through the launcher.
    event PoolLaunched(
        PoolId indexed poolId,
        address indexed token,
        address indexed owner,
        address launcher,
        uint24 tradingFee,
        int24 tickSpacing,
        uint256 positionId,
        uint256 version
    );

    /// @notice A pool ownership transfer was started.
    event PoolOwnershipTransferStarted(PoolId indexed poolId, address indexed owner, address indexed pendingOwner);

    /// @notice The protocol share for future pools changed.
    event ProtocolShareSet(uint16 oldShareBps, uint16 newShareBps);
}
