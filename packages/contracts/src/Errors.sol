// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Custom errors shared by Upfront contracts.
interface UpfrontErrors {
    // --- access ---
    /// @notice Caller is not the UpfrontLauncher (I-9).
    error NotLauncher();
    /// @notice Caller is not the AdvanceDesk.
    error NotAdvanceDesk();
    /// @notice Caller is not the address allowed to wire the hook at deployment.
    error NotWirer();
    /// @notice The hook has already been wired.
    error AlreadyWired();
    /// @notice Caller is not the launcher's admin multisig.
    error NotLauncherAdmin();
    /// @notice Caller is not the pool's owner.
    error NotPoolOwner();
    /// @notice Caller is not the pool's pending owner.
    error NotPendingOwner();

    // --- pool creation (BUILD_SPEC §4.2, §4.3, §4.5) ---
    /// @notice Neither side of the pool is USDG (rule 3).
    error PoolNotUsdg();
    /// @notice The pool's trading fee is dynamic. Upfront pools need a fixed trading fee (rule 1).
    error DynamicFeeNotAllowed();
    /// @notice The pool's trading fee is above the launcher's cap.
    error TradingFeeTooHigh();
    /// @notice The Upfront fee is above the hard maximum (rule 2).
    error FeeAboveMax();
    /// @notice Shares don't add up to 100% of the Upfront fee (I-2).
    error InvalidShares();
    /// @notice A share is set for a party with no address.
    error MissingAddress();
    /// @notice The pool is already registered.
    error PoolAlreadyRegistered();
    /// @notice The pool isn't an Upfront pool on this hook.
    error PoolNotRegistered();
    /// @notice Native ETH pools aren't supported in v1.
    error NativeNotSupported();
    /// @notice The paired token is USDG itself.
    error SameToken();

    // --- pool changes (rule 2, rule 6) ---
    /// @notice A new fee must be strictly lower than the current fee (I-4).
    error FeeNotLower();
    /// @notice Pool ownership is locked while an advance is open (I-6).
    error AdvanceOpen();

    // --- advances ---
    /// @notice No advance is open on this pool.
    error NoAdvanceOpen();
    /// @notice Advance terms are outside the hook's hard bounds.
    error InvalidAdvanceTerms();

    // --- claims ---
    /// @notice There is nothing ready to claim.
    error NothingToClaim();

    // --- admin (BUILD_SPEC §4.8) ---
    /// @notice A setting is outside its hard bound.
    error OutOfBounds();
}
