// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {BaseHook} from "@openzeppelin/uniswap-hooks/base/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {UpfrontErrors} from "./Errors.sol";
import {UpfrontEvents} from "./Events.sol";
import {RevenueMath} from "./RevenueMath.sol";
import {Advance, FeeSplit, PoolConfig, PoolState} from "./Types.sol";

/// @title UpfrontHook
/// @notice Takes the Upfront fee in USDG on every swap in an Upfront pool, splits it between the owner, app,
///         referrer and protocol, routes the advance repayment, records daily earnings and pays out claims.
/// @dev One hook serves every Upfront pool, keyed by PoolId. Not upgradeable (rule 8).
///
///      Swaps never fail because of Upfront (rule 4, I-10):
///      - callbacks make no token transfers and no external calls except to the PoolManager;
///      - the fee is held as ERC-6909 USDG claims in the PoolManager, which is a pure balance update;
///      - payees are credited internally and pull their USDG later with `claim`;
///      - hookData is parsed without ever reverting;
///      - no loops.
///
///      The fee is charged on the USDG leg only (rule 3):
///      - USDG is the specified currency: taken in beforeSwap from the specified amount;
///      - USDG is the unspecified currency: taken in afterSwap from the unspecified amount.
contract UpfrontHook is BaseHook, IUnlockCallback, ReentrancyGuardTransient, UpfrontErrors, UpfrontEvents {
    /// @notice This hook's version. A behaviour change means a new deployment with a new version (rule 8).
    uint256 public constant VERSION = 1;

    /// @notice Hard maximum Upfront fee for any pool: 2% (BUILD_SPEC §4.2).
    uint16 public constant MAX_UPFRONT_FEE_BPS = 200;

    /// @notice Hard maximum normal repayment share the AdvanceDesk can set: 50% of the owner's share.
    /// @dev Bounds a desk bug. The behind-schedule rule can still raise it to 100% (BUILD_SPEC §7).
    uint16 public constant MAX_REPAY_SHARE_BPS = 5000;

    /// @notice Behind schedule means less than 25% repaid once `behindAt` has passed (BUILD_SPEC §7).
    uint16 public constant BEHIND_MIN_REPAID_BPS = 2500;

    /// @notice USDG, the only fee currency (rule 3).
    Currency public immutable usdg;

    /// @notice Receives the protocol share of every fee.
    address public immutable treasury;

    /// @notice The one address allowed to call `wire`, once, at deployment.
    address public immutable wirer;

    /// @notice The only contract allowed to create pools on this hook (I-9).
    address public launcher;

    /// @notice The only contract allowed to open and close advances.
    address public advanceDesk;

    /// @notice USDG ready to claim, per account. Advance repayments are credited to `advanceDesk`.
    mapping(address account => uint256 amount) public claimable;

    mapping(PoolId => PoolConfig) internal _configs;
    mapping(PoolId => PoolState) internal _states;
    mapping(PoolId => Advance) internal _advances;
    mapping(PoolId => uint256[35]) internal _days; // RevenueMath.HISTORY_DAYS

    modifier onlyLauncher() {
        if (msg.sender != launcher) revert NotLauncher();
        _;
    }

    modifier onlyAdvanceDesk() {
        if (msg.sender != advanceDesk) revert NotAdvanceDesk();
        _;
    }

    /// @param poolManager_ The Uniswap v4 PoolManager.
    /// @param usdg_ The USDG token.
    /// @param treasury_ Receives the protocol share (the protocol multisig).
    /// @param wirer_ The deployer allowed to call `wire` once.
    constructor(IPoolManager poolManager_, Currency usdg_, address treasury_, address wirer_) BaseHook(poolManager_) {
        if (Currency.unwrap(usdg_) == address(0) || treasury_ == address(0) || wirer_ == address(0)) {
            revert MissingAddress();
        }
        usdg = usdg_;
        treasury = treasury_;
        wirer = wirer_;
    }

    // ---------------------------------------------------------------------
    // Deployment wiring
    // ---------------------------------------------------------------------

    /// @notice Sets the launcher and the advance desk. Can only be called once.
    /// @dev Called by `wirer` in the deploy script, before any pool exists. After this, nobody can change either
    ///      address, so no admin can redirect fees or open advances (rule 7).
    ///      Emits {Wired}.
    /// @param launcher_ The UpfrontLauncher.
    /// @param advanceDesk_ The AdvanceDesk.
    function wire(address launcher_, address advanceDesk_) external {
        if (msg.sender != wirer) revert NotWirer();
        if (launcher != address(0)) revert AlreadyWired();
        if (launcher_ == address(0) || advanceDesk_ == address(0)) revert MissingAddress();
        launcher = launcher_;
        advanceDesk = advanceDesk_;
        emit Wired(launcher_, advanceDesk_);
    }

    // ---------------------------------------------------------------------
    // Hook permissions and callbacks
    // ---------------------------------------------------------------------

    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @dev Only the launcher may create pools on this hook (I-9), only for a registered config, only with a
    ///      USDG side (rule 3) and only with a fixed trading fee, so the shown total can't drift (rule 1).
    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        if (sender != launcher) revert NotLauncher();
        if (!(key.currency0 == usdg) && !(key.currency1 == usdg)) revert PoolNotUsdg();
        if (LPFeeLibrary.isDynamicFee(key.fee)) revert DynamicFeeNotAllowed();
        if (_configs[key.toId()].owner == address(0)) revert PoolNotRegistered();
        return this.beforeInitialize.selector;
    }

    /// @dev Takes the fee when USDG is the specified currency. A positive specified delta makes the hook the
    ///      receiver of `fee`: for exact input the trader pays the same amount and `fee` less is swapped, for exact
    ///      output the pool sends `fee` more and the trader receives the requested amount.
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        Currency specified = (params.amountSpecified < 0 == params.zeroForOne) ? key.currency0 : key.currency1;
        if (!(specified == usdg)) return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 fee = _takeFee(sender, key, _abs(params.amountSpecified), hookData);
        // fee <= amount * 2%, and amount fits in int128, so the cast is safe.
        return (this.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    /// @dev Takes the fee when USDG is the unspecified currency. A positive unspecified delta makes the hook the
    ///      receiver of `fee`: for exact input the trader receives `fee` less USDG, for exact output they pay
    ///      `fee` more USDG.
    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        bool specifiedIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        Currency unspecified = specifiedIs0 ? key.currency1 : key.currency0;
        if (!(unspecified == usdg)) return (this.afterSwap.selector, 0);

        int128 usdgDelta = specifiedIs0 ? delta.amount1() : delta.amount0();
        uint256 fee = _takeFee(sender, key, _abs(usdgDelta), hookData);
        return (this.afterSwap.selector, int128(int256(fee)));
    }

    // ---------------------------------------------------------------------
    // Fee taking (swap path: no loops, no transfers, no reverts)
    // ---------------------------------------------------------------------

    /// @dev Computes, splits and books the fee, then mints the matching ERC-6909 USDG claim to this hook.
    ///      The mint creates a -fee delta for the hook that cancels the +fee delta returned to the PoolManager.
    function _takeFee(address trader, PoolKey calldata key, uint256 usdgAmount, bytes calldata hookData)
        internal
        returns (uint256 fee)
    {
        PoolId id = key.toId();
        PoolConfig memory cfg = _configs[id];
        fee = RevenueMath.feeFor(usdgAmount, cfg.upfrontFeeBps);
        if (fee == 0) return 0;

        address referrer = _parseReferrer(hookData);
        FeeSplit memory s = RevenueMath.split(fee, cfg, referrer != address(0));
        uint256 ownerGross = s.owner;

        PoolState memory st = _states[id];
        if (st.advanceOpen) {
            (s.repay, st.advanceOpen) = _applyRepayment(id, ownerGross);
            s.owner = ownerGross - s.repay;
        }

        // Effects. Zero credits are skipped to save gas.
        if (s.owner != 0) claimable[cfg.owner] += s.owner;
        if (s.app != 0) claimable[st.app] += s.app;
        if (s.referrer != 0) claimable[referrer] += s.referrer;
        if (s.protocol != 0) claimable[treasury] += s.protocol;
        if (s.repay != 0) claimable[advanceDesk] += s.repay;

        uint32 day = RevenueMath.dayOf(block.timestamp);
        uint256 slot = RevenueMath.slotOf(day);
        _days[id][slot] = RevenueMath.addToBucket(_days[id][slot], day, ownerGross);
        st.ownerEarned = _saturatingAdd56(st.ownerEarned, ownerGross);
        _states[id] = st;

        // Pure balance update inside the PoolManager. No token moves (rule 4).
        poolManager.mint(address(this), usdg.toId(), fee);

        emit FeeTaken(id, trader, referrer, usdgAmount, fee, day, s.owner, s.app, s.referrer, s.protocol, s.repay);
    }

    /// @dev Works out the repayment from the owner's gross share and closes the advance once repaid.
    /// @return repay The amount credited to the AdvanceDesk.
    /// @return stillOpen False if this fee repaid the advance in full.
    function _applyRepayment(PoolId id, uint256 ownerGross) internal returns (uint256 repay, bool stillOpen) {
        Advance memory adv = _advances[id];

        // Behind schedule: once `behindAt` passes with less than 25% repaid, all of the owner's share goes to
        // repayment until the advance is repaid (BUILD_SPEC §7). The switch is stored, so it stays on.
        if (
            adv.repayShareBps != RevenueMath.BPS && block.timestamp >= adv.behindAt
                && uint256(adv.repaid) * RevenueMath.BPS < uint256(adv.totalDue) * BEHIND_MIN_REPAID_BPS
        ) {
            adv.repayShareBps = uint16(RevenueMath.BPS);
            emit AdvanceBehindSchedule(id, adv.repaid, adv.totalDue);
        }

        repay = RevenueMath.repayPortion(ownerGross, adv.repayShareBps, adv.totalDue - adv.repaid);
        // repay <= totalDue - repaid, so this stays within uint96 (I-7).
        adv.repaid += uint96(repay);

        stillOpen = adv.repaid < adv.totalDue;
        if (!stillOpen) {
            // Repaid in full: close in the same transaction and the owner's full share resumes (BUILD_SPEC §7).
            adv.open = false;
            emit AdvanceRepaid(id, adv.totalDue);
        }
        _advances[id] = adv;
    }

    /// @dev Reads a referrer from hookData. Never reverts (rule 4, I-10).
    ///      Expects `abi.encode(address)`. Shorter data, dirty upper bits, zero, or this hook mean no referrer.
    function _parseReferrer(bytes calldata hookData) internal view returns (address referrer) {
        if (hookData.length < 32) return address(0);
        uint256 word;
        assembly ("memory-safe") {
            word := calldataload(hookData.offset)
        }
        if (word >> 160 != 0) return address(0);
        referrer = address(uint160(word));
        // A balance credited to the hook itself could never be claimed.
        if (referrer == address(this)) return address(0);
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x < 0 ? uint256(-x) : uint256(x);
    }

    /// @dev Lifetime earnings saturate instead of overflowing so a swap can never fail on them (rule 4).
    function _saturatingAdd56(uint56 a, uint256 b) internal pure returns (uint56) {
        uint256 sum = uint256(a) + b; // a < 2^56, b < 2^128: no overflow
        return sum > type(uint56).max ? type(uint56).max : uint56(sum);
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    /// @notice Pays the caller their USDG balance.
    /// @dev Anyone with a balance can call. Checks, effects, then the transfer through the PoolManager.
    ///      Emits {Claimed}.
    /// @return amount The USDG paid.
    function claim() external returns (uint256 amount) {
        return _claim(msg.sender);
    }

    /// @notice Pays the caller's USDG balance to `recipient`.
    /// @dev For contracts that hold balances on behalf of others. Emits {Claimed}.
    /// @param recipient Where the USDG goes.
    /// @return amount The USDG paid.
    function claimTo(address recipient) external returns (uint256 amount) {
        if (recipient == address(0)) revert MissingAddress();
        return _claim(recipient);
    }

    function _claim(address recipient) internal nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        emit Claimed(msg.sender, recipient, amount);
        poolManager.unlock(abi.encode(recipient, amount));
    }

    /// @notice PoolManager callback for claims: burns the hook's USDG claim and sends USDG to the recipient.
    /// @dev Only the PoolManager can call, and it only calls back the contract that unlocked it.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address recipient, uint256 amount) = abi.decode(data, (address, uint256));
        poolManager.burn(address(this), usdg.toId(), amount);
        poolManager.take(usdg, recipient, amount);
        return "";
    }

    // ---------------------------------------------------------------------
    // Launcher-only pool management
    // ---------------------------------------------------------------------

    /// @notice Registers a pool's fixed settings, just before the launcher initializes it.
    /// @dev Only the launcher. Re-checks every bound so the hook never depends on the launcher being correct.
    ///      Emits {PoolRegistered}.
    function registerPool(PoolKey calldata key, PoolConfig calldata cfg, address app) external onlyLauncher {
        if (address(key.hooks) != address(this)) revert PoolNotRegistered();
        if (!(key.currency0 == usdg) && !(key.currency1 == usdg)) revert PoolNotUsdg();
        if (cfg.owner == address(0)) revert MissingAddress();
        if (cfg.appBps != 0 && app == address(0)) revert MissingAddress();
        if (cfg.upfrontFeeBps > MAX_UPFRONT_FEE_BPS || cfg.maxFeeBps != cfg.upfrontFeeBps) revert FeeAboveMax();
        if (uint256(cfg.ownerBps) + cfg.appBps + cfg.referrerBps + cfg.protocolBps != RevenueMath.BPS) {
            revert InvalidShares();
        }

        PoolId id = key.toId();
        if (_configs[id].owner != address(0)) revert PoolAlreadyRegistered();
        _configs[id] = cfg;
        _states[id] = PoolState({
            app: app, ownerEarned: 0, advanceOpen: false, registeredDay: RevenueMath.dayOf(block.timestamp)
        });

        emit PoolRegistered(
            id, cfg.owner, app, cfg.upfrontFeeBps, cfg.ownerBps, cfg.appBps, cfg.referrerBps, cfg.protocolBps
        );
    }

    /// @notice Lowers a pool's Upfront fee. It can never go up (rule 2, I-4).
    /// @dev Only the launcher, on behalf of the pool owner. Emits {FeeLowered}.
    function lowerFee(PoolId id, uint16 newFeeBps) external onlyLauncher {
        PoolConfig storage cfg = _configs[id];
        if (cfg.owner == address(0)) revert PoolNotRegistered();
        uint16 old = cfg.upfrontFeeBps;
        if (newFeeBps >= old) revert FeeNotLower();
        cfg.upfrontFeeBps = newFeeBps;
        emit FeeLowered(id, old, newFeeBps);
    }

    /// @notice Changes a pool's owner. Blocked while an advance is open (rule 6, I-6).
    /// @dev Only the launcher, after the new owner accepts. Emits {PoolOwnerChanged}.
    function setOwner(PoolId id, address newOwner) external onlyLauncher {
        PoolConfig storage cfg = _configs[id];
        address old = cfg.owner;
        if (old == address(0)) revert PoolNotRegistered();
        if (newOwner == address(0)) revert MissingAddress();
        if (_states[id].advanceOpen) revert AdvanceOpen();
        cfg.owner = newOwner;
        emit PoolOwnerChanged(id, old, newOwner);
    }

    // ---------------------------------------------------------------------
    // AdvanceDesk-only
    // ---------------------------------------------------------------------

    /// @notice Opens an advance on a pool. From now on part of the owner's share repays it.
    /// @dev Only the AdvanceDesk, once the owner has accepted an offer. Terms are checked against hard bounds.
    ///      Emits {AdvanceOpened}.
    /// @param totalDue Principal plus flat fee, in USDG.
    /// @param repayShareBps Share of the owner's earnings that repays the advance.
    /// @param behindAt When the behind-schedule check starts to apply.
    function openAdvance(PoolId id, uint96 totalDue, uint16 repayShareBps, uint40 behindAt) external onlyAdvanceDesk {
        PoolState storage st = _states[id];
        if (_configs[id].owner == address(0)) revert PoolNotRegistered();
        if (st.advanceOpen) revert AdvanceOpen();
        if (totalDue == 0 || repayShareBps == 0 || repayShareBps > MAX_REPAY_SHARE_BPS || behindAt <= block.timestamp) {
            revert InvalidAdvanceTerms();
        }
        st.advanceOpen = true;
        _advances[id] =
            Advance({totalDue: totalDue, repaid: 0, repayShareBps: repayShareBps, behindAt: behindAt, open: true});
        emit AdvanceOpened(id, totalDue, repayShareBps, behindAt);
    }

    /// @notice Closes an open advance before it is repaid in full (for example a write-off).
    /// @dev Only the AdvanceDesk. This only stops repayment and unlocks ownership; it never takes anything.
    ///      Emits {AdvanceClosed}.
    function closeAdvance(PoolId id) external onlyAdvanceDesk {
        PoolState storage st = _states[id];
        if (!st.advanceOpen) revert NoAdvanceOpen();
        Advance storage adv = _advances[id];
        st.advanceOpen = false;
        adv.open = false;
        emit AdvanceClosed(id, adv.repaid, adv.totalDue);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The exact Upfront fee charged on a swap whose USDG leg is `usdgAmount` (rule 1, I-3).
    /// @dev The swap path uses the same function, so quote and charge can't differ.
    function quoteFee(PoolId id, uint256 usdgAmount) external view returns (uint256) {
        return RevenueMath.feeFor(usdgAmount, _configs[id].upfrontFeeBps);
    }

    /// @notice How a fee on `usdgAmount` would be split right now, including any repayment.
    /// @dev Ignores a behind-schedule switch that the next swap would trigger.
    function quoteSplit(PoolId id, uint256 usdgAmount, bool hasReferrer)
        external
        view
        returns (uint256 fee, FeeSplit memory s)
    {
        PoolConfig memory cfg = _configs[id];
        fee = RevenueMath.feeFor(usdgAmount, cfg.upfrontFeeBps);
        s = RevenueMath.split(fee, cfg, hasReferrer);
        if (_states[id].advanceOpen) {
            Advance memory adv = _advances[id];
            s.repay = RevenueMath.repayPortion(s.owner, adv.repayShareBps, adv.totalDue - adv.repaid);
            s.owner -= s.repay;
        }
    }

    /// @notice A pool's fixed settings and current fee.
    function poolConfig(PoolId id) external view returns (PoolConfig memory) {
        return _configs[id];
    }

    /// @notice A pool's app, lifetime owner earnings and whether an advance is open.
    function poolState(PoolId id) external view returns (PoolState memory) {
        return _states[id];
    }

    /// @notice A pool's current owner.
    function ownerOf(PoolId id) external view returns (address) {
        return _configs[id].owner;
    }

    /// @notice True while an advance is open on the pool.
    function isAdvanceOpen(PoolId id) external view returns (bool) {
        return _states[id].advanceOpen;
    }

    /// @notice The pool's latest advance, open or closed.
    function advanceOf(PoolId id) external view returns (Advance memory) {
        return _advances[id];
    }

    /// @notice Owner earnings recorded for a day, or zero if the day is outside the last 35 days.
    function dailyEarnings(PoolId id, uint32 day) public view returns (uint256) {
        return RevenueMath.bucketAmount(_days[id][RevenueMath.slotOf(day)], day);
    }

    /// @notice Owner earnings for the 35 days ending today. `amounts[0]` is today, `amounts[34]` is 34 days ago.
    /// @dev A view for the AdvanceDesk and the app. Bounded loop over a fixed-size buffer.
    function earningsHistory(PoolId id) external view returns (uint32 today, uint256[35] memory amounts) {
        today = RevenueMath.dayOf(block.timestamp);
        for (uint256 i; i < RevenueMath.HISTORY_DAYS && i <= today; ++i) {
            amounts[i] = dailyEarnings(id, today - uint32(i));
        }
    }
}
