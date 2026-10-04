// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {UpfrontErrors} from "./Errors.sol";
import {UpfrontEvents} from "./Events.sol";
import {RevenueMath} from "./RevenueMath.sol";
import {PoolConfig} from "./Types.sol";
import {UpfrontHook} from "./UpfrontHook.sol";

/// @notice Everything a launch needs. Shares are in basis points of the Upfront fee.
struct LaunchParams {
    /// @notice The token the pool trades against USDG.
    address token;
    /// @notice The pool's own trading fee, in hundredths of a basis point (3000 = 0.30%). Fixed, never dynamic.
    uint24 tradingFee;
    int24 tickSpacing;
    /// @notice The Upfront fee, in basis points of the USDG leg. Fixed at launch, can only go down.
    uint16 upfrontFeeBps;
    /// @notice The share of each Upfront fee to the owner. With `appBps`, `referrerBps` and the protocol share
    ///         it must sum to 10_000.
    uint16 ownerBps;
    uint16 appBps;
    uint16 referrerBps;
    /// @notice The app the pool is launched for. Required when `appBps` is not zero.
    address app;
    /// @notice The pool owner. Earns the owner share and receives the first liquidity position.
    address owner;
    uint160 sqrtPriceX96;
    int24 tickLower;
    int24 tickUpper;
    uint128 liquidity;
    /// @notice The most of each pool currency the launcher may pull for the first liquidity.
    uint128 amount0Max;
    uint128 amount1Max;
}

/// @title UpfrontLauncher
/// @notice Creates Upfront pools, adds first liquidity and handles ownership and fee lowering.
/// @dev The only contract that can create pools on the hook (I-9). The Upfront fee and the shares are fixed here
///      and only the owner's fee can move, down only (rules 2 and 5). Not upgradeable (rule 8).
contract UpfrontLauncher is ReentrancyGuardTransient, UpfrontErrors, UpfrontEvents {
    using SafeERC20 for IERC20;

    /// @notice This launcher's version, stored with every pool it creates (BUILD_SPEC §4.9).
    uint256 public constant VERSION = 1;

    /// @notice Upper bound for the protocol share of a pool, 20% of the Upfront fee (BUILD_SPEC §4.8).
    uint16 public constant MAX_PROTOCOL_SHARE_BPS = 2000;

    /// @notice Upper bound for a pool's own trading fee, 10%.
    uint24 public constant MAX_TRADING_FEE = 100_000;

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    UpfrontHook public immutable hook;
    Currency public immutable usdg;

    /// @notice The protocol multisig. It can only change the protocol share for future pools, within bounds.
    address public immutable admin;

    /// @notice The protocol share given to pools launched from now on. Live pools never change (rule 7).
    uint16 public protocolShareBps;

    /// @notice The pool each launch created, to check ownership calls.
    mapping(PoolId => bool) public isLaunched;

    /// @notice The address that must accept a pending ownership transfer.
    mapping(PoolId => address) public pendingOwner;

    constructor(
        IPoolManager poolManager_,
        IPositionManager positionManager_,
        IAllowanceTransfer permit2_,
        UpfrontHook hook_,
        address admin_,
        uint16 protocolShareBps_
    ) {
        if (admin_ == address(0)) revert MissingAddress();
        if (protocolShareBps_ > MAX_PROTOCOL_SHARE_BPS) revert OutOfBounds();
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        hook = hook_;
        usdg = hook_.usdg();
        admin = admin_;
        protocolShareBps = protocolShareBps_;
    }

    // ---------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------

    /// @notice Creates an Upfront pool paired with USDG and adds the first liquidity.
    /// @dev Anyone can call. The caller approves both pool tokens to this contract first. Unused tokens go back to
    ///      the caller. The first liquidity position is minted to `p.owner`.
    ///      Emits {PoolLaunched} here and {PoolRegistered} from the hook.
    /// @param p The launch settings.
    /// @return id The new pool.
    /// @return positionId The position token minted to the owner.
    function launch(LaunchParams calldata p) external nonReentrant returns (PoolId id, uint256 positionId) {
        PoolKey memory key = _validateAndKey(p);
        id = key.toId();

        PoolConfig memory cfg = PoolConfig({
            owner: p.owner,
            upfrontFeeBps: p.upfrontFeeBps,
            maxFeeBps: p.upfrontFeeBps,
            ownerBps: p.ownerBps,
            appBps: p.appBps,
            referrerBps: p.referrerBps,
            protocolBps: protocolShareBps
        });
        hook.registerPool(key, cfg, p.app);
        isLaunched[id] = true;

        poolManager.initialize(key, p.sqrtPriceX96);
        positionId = _addFirstLiquidity(key, p);

        emit PoolLaunched(id, p.token, p.owner, address(this), p.tradingFee, p.tickSpacing, positionId, VERSION);
    }

    function _validateAndKey(LaunchParams calldata p) internal view returns (PoolKey memory key) {
        Currency token = Currency.wrap(p.token);
        if (p.token == address(0)) revert NativeNotSupported();
        if (token == usdg) revert SameToken();
        if (p.owner == address(0)) revert MissingAddress();
        if (p.tradingFee > MAX_TRADING_FEE) revert TradingFeeTooHigh();
        // Rule 2: fixed at launch with a hard maximum.
        if (p.upfrontFeeBps > hook.MAX_UPFRONT_FEE_BPS()) revert FeeAboveMax();
        // I-2, I-5: the parts always add up to the whole fee and never change.
        if (uint256(p.ownerBps) + p.appBps + p.referrerBps + protocolShareBps != RevenueMath.BPS) {
            revert InvalidShares();
        }
        if (p.appBps != 0 && p.app == address(0)) revert MissingAddress();

        (Currency c0, Currency c1) = Currency.unwrap(token) < Currency.unwrap(usdg) ? (token, usdg) : (usdg, token);
        key = PoolKey({
            currency0: c0, currency1: c1, fee: p.tradingFee, tickSpacing: p.tickSpacing, hooks: IHooks(address(hook))
        });
    }

    function _addFirstLiquidity(PoolKey memory key, LaunchParams calldata p) internal returns (uint256 positionId) {
        address t0 = Currency.unwrap(key.currency0);
        address t1 = Currency.unwrap(key.currency1);
        _pull(t0, p.amount0Max);
        _pull(t1, p.amount1Max);

        positionId = positionManager.nextTokenId();
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key, p.tickLower, p.tickUpper, uint256(p.liquidity), p.amount0Max, p.amount1Max, p.owner, bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        _refund(t0);
        _refund(t1);
    }

    /// @dev Pulls tokens from the caller and lets PositionManager take them through Permit2.
    function _pull(address token, uint128 amount) internal {
        if (amount == 0) return;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(permit2), amount);
        // forge-lint: disable-next-line(unsafe-typecast)
        permit2.approve(token, address(positionManager), uint160(amount), uint48(block.timestamp));
    }

    function _refund(address token) internal {
        uint256 left = IERC20(token).balanceOf(address(this));
        if (left != 0) IERC20(token).safeTransfer(msg.sender, left);
    }

    // ---------------------------------------------------------------------
    // Owner actions
    // ---------------------------------------------------------------------

    /// @notice Lowers a pool's Upfront fee. It can never go up (rule 2, I-4).
    /// @dev Only the pool owner. The hook enforces that the new fee is lower. Emits {FeeLowered} from the hook.
    function lowerFee(PoolId id, uint16 newFeeBps) external {
        if (msg.sender != hook.ownerOf(id)) revert NotPoolOwner();
        hook.lowerFee(id, newFeeBps);
    }

    /// @notice Starts moving a pool to a new owner. The new owner must accept.
    /// @dev Only the pool owner, and not while an advance is open (rule 6, I-6). Emits {PoolOwnershipTransferStarted}.
    function transferPoolOwnership(PoolId id, address newOwner) external {
        if (msg.sender != hook.ownerOf(id)) revert NotPoolOwner();
        if (hook.isAdvanceOpen(id)) revert AdvanceOpen();
        if (newOwner == address(0)) revert MissingAddress();
        pendingOwner[id] = newOwner;
        emit PoolOwnershipTransferStarted(id, msg.sender, newOwner);
    }

    /// @notice Accepts a pending ownership transfer.
    /// @dev Only the pending owner. The hook re-checks that no advance is open. Emits {PoolOwnerChanged} from the hook.
    function acceptPoolOwnership(PoolId id) external {
        if (msg.sender != pendingOwner[id]) revert NotPendingOwner();
        delete pendingOwner[id];
        hook.setOwner(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Admin (BUILD_SPEC §4.8)
    // ---------------------------------------------------------------------

    /// @notice Sets the protocol share for pools launched from now on.
    /// @dev Only the admin multisig, within a hard bound. Live pools are never touched. Emits {ProtocolShareSet}.
    function setProtocolShare(uint16 newShareBps) external {
        if (msg.sender != admin) revert NotLauncherAdmin();
        if (newShareBps > MAX_PROTOCOL_SHARE_BPS) revert OutOfBounds();
        emit ProtocolShareSet(protocolShareBps, newShareBps);
        protocolShareBps = newShareBps;
    }

    /// @notice The pool id for a token paired with USDG at the given trading fee and tick spacing.
    function poolIdFor(address token, uint24 tradingFee, int24 tickSpacing) external view returns (PoolId) {
        Currency t = Currency.wrap(token);
        (Currency c0, Currency c1) = token < Currency.unwrap(usdg) ? (t, usdg) : (usdg, t);
        return PoolKey({
                currency0: c0, currency1: c1, fee: tradingFee, tickSpacing: tickSpacing, hooks: IHooks(address(hook))
            }).toId();
    }
}
