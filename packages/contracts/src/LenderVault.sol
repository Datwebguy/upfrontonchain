// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {UpfrontErrors} from "./Errors.sol";
import {UpfrontEvents} from "./Events.sol";

/// @title LenderVault
/// @notice ERC-4626 vault in USDG. Lenders deposit, the AdvanceDesk lends the USDG out as advances, and repayments
///         plus the lenders' part of each flat fee flow back in.
/// @dev USDG has 6 decimals. Shares carry a decimals offset so a first-depositor donation can't skew the price.
///      Rounding follows OpenZeppelin's defaults, which favour the vault (AGENTS.md §5): deposits and mints round
///      shares down, withdrawals and redeems round the vault's cost up.
///      USDG leaves the vault only as a deposit withdrawal or an advance the desk funds (SECURITY.md §1.6).
///      Not upgradeable (rule 8).
contract LenderVault is ERC4626, ReentrancyGuardTransient, UpfrontErrors, UpfrontEvents {
    using SafeERC20 for IERC20;

    /// @notice The deployer, allowed to call `wire` once.
    address public immutable wirer;

    /// @notice The only contract allowed to fund advances and report repayments.
    address public desk;

    /// @notice Principal lent out and not yet repaid or written off.
    /// @dev I-8: totalAssets() == idle USDG + outstanding.
    uint256 public outstanding;

    /// @notice Principal written off over the vault's life. Information only; it already left `outstanding`.
    uint256 public writtenOff;

    modifier onlyDesk() {
        if (msg.sender != desk) revert NotVaultDesk();
        _;
    }

    /// @param usdg_ The USDG token.
    /// @param wirer_ The deployer allowed to call `wire` once.
    constructor(IERC20 usdg_, address wirer_) ERC20("Upfront Lender Vault", "upLEND") ERC4626(usdg_) {
        if (wirer_ == address(0)) revert MissingAddress();
        wirer = wirer_;
    }

    /// @notice Sets the advance desk. Can only be called once, by the deployer.
    /// @dev After this nobody can change the desk, so no admin can redirect lender funds (rule 7). Emits {VaultWired}.
    function wire(address desk_) external {
        if (msg.sender != wirer) revert NotVaultWirer();
        if (desk != address(0)) revert DeskAlreadySet();
        if (desk_ == address(0)) revert MissingAddress();
        desk = desk_;
        emit VaultWired(desk_);
    }

    // ---------------------------------------------------------------------
    // Accounting
    // ---------------------------------------------------------------------

    /// @notice Idle USDG plus principal lent out (I-8).
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + outstanding;
    }

    /// @notice USDG in the vault that is not lent out.
    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @dev Withdrawals can only be paid from idle USDG.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner_), idle());
    }

    /// @dev Redemptions can only be paid from idle USDG.
    function maxRedeem(address owner_) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner_), _convertToShares(idle(), Math.Rounding.Floor));
    }

    /// @dev Six extra decimals of share precision against donation attacks.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    // ---------------------------------------------------------------------
    // Desk-only
    // ---------------------------------------------------------------------

    /// @notice Pays an accepted advance out of idle USDG.
    /// @dev Only the AdvanceDesk. The desk checks eligibility and sizes the offer. Emits {AdvanceFunded}.
    function fundAdvance(PoolId poolId, address to, uint256 amount) external onlyDesk nonReentrant {
        if (amount > idle()) revert VaultLiquidityLow();
        outstanding += amount;
        emit AdvanceFunded(poolId, to, amount);
        IERC20(asset()).safeTransfer(to, amount);
    }

    /// @notice Records a repayment the desk has already sent to the vault.
    /// @dev Only the AdvanceDesk. `principalPart` moves from outstanding back to idle, `lenderFee` is new earnings
    ///      for lenders: both are already in the vault's USDG balance. Emits {RepaymentReceived}.
    function receiveRepayment(PoolId poolId, uint256 principalPart, uint256 lenderFee) external onlyDesk {
        // Derived from the advance's own principal, so it can't exceed what is outstanding.
        outstanding -= principalPart;
        emit RepaymentReceived(poolId, principalPart, lenderFee);
    }

    /// @notice Writes off principal that will not be repaid. This is a loss for lenders.
    /// @dev Only the AdvanceDesk, only after an advance is long past its schedule. Emits {WrittenOff}.
    function writeOff(PoolId poolId, uint256 amount) external onlyDesk {
        outstanding -= amount;
        writtenOff += amount;
        emit WrittenOff(poolId, amount);
    }
}
