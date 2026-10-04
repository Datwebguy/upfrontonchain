// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {UpfrontErrors} from "./Errors.sol";
import {UpfrontEvents} from "./Events.sol";
import {LenderVault} from "./LenderVault.sol";
import {RevenueMath} from "./RevenueMath.sol";
import {Advance, PoolState} from "./Types.sol";
import {UpfrontHook} from "./UpfrontHook.sol";

/// @notice Deployment settings. Each one has a hard bound in `AdvanceDesk`.
struct DeskParams {
    /// @notice Length of one earnings period in days: 7 on mainnet, 1 on testnet (BUILD_SPEC §7).
    uint8 periodDays;
    /// @notice The pool must be at least this many days old: 14 on mainnet, 1 on testnet.
    uint16 minHistoryDays;
    /// @notice The weakest period must have earned at least this much USDG: 1,000 on mainnet, 10 on testnet.
    uint256 minPeriodEarnings;
    /// @notice Behind-schedule check applies after this long: 60 days on mainnet, 2 days on testnet.
    uint40 behindAfter;
    /// @notice The most any one advance can be, in USDG.
    uint256 poolCap;
    /// @notice The most of the vault's idle USDG one advance can take, in basis points.
    uint16 maxVaultShareBps;
    /// @notice Share of the owner's earnings that repays an advance, in basis points.
    uint16 repayShareBps;
}

/// @notice What an owner would get right now, from the pool's own history.
struct Offer {
    bool eligible;
    /// @notice Why not eligible: zero when eligible, otherwise the error selector's first 4 bytes.
    bytes4 reason;
    uint256 amount;
    uint256 totalDue;
    uint16 flatFeeBps;
    uint16 repayShareBps;
    uint256 weakestPeriod;
}

/// @title AdvanceDesk
/// @notice Offers, pays out and tracks advances. An advance is repaid automatically from a share of the owner's
///         future fees, which the hook credits to this contract. The desk then settles each repayment to the
///         vault and the protocol.
/// @dev Offers are recomputed from the pool's own history every time they are shown or accepted, never cached.
///      The owner passes the least they will take and the most it may cost, so a changed offer can't surprise them.
///      Only the owner's share is ever taken (rule 6) and the hook enforces it. Not upgradeable (rule 8).
contract AdvanceDesk is ReentrancyGuardTransient, UpfrontErrors, UpfrontEvents {
    using SafeERC20 for IERC20;

    /// @notice Cheapest flat fee, for perfectly steady earnings: 6% (BUILD_SPEC §7).
    uint256 public constant MIN_FLAT_FEE_BPS = 600;
    /// @notice Dearest flat fee: 12%.
    uint256 public constant MAX_FLAT_FEE_BPS = 1200;
    /// @notice An advance is about one month: the weakest period times 4.
    uint256 public constant OFFER_MULTIPLIER = 4;
    /// @notice Number of complete periods the weakest is taken from.
    uint256 public constant PERIODS = 4;
    /// @notice The protocol's cut of each flat fee, fixed: 15% (BUILD_SPEC §7).
    uint256 public constant PROTOCOL_CUT_BPS = 1500;
    /// @notice How long past `behindAt` an unpaid advance waits before anyone can write it off.
    uint256 public constant WRITE_OFF_DELAY = 180 days;

    // Hard bounds for settings (SECURITY.md: admin acts only within hard bounds).
    uint256 public constant MAX_PERIOD_DAYS = 7; // PERIODS * 7 = 28 days fits the 35-day record
    uint256 public constant MAX_MIN_HISTORY_DAYS = 90;
    uint256 public constant MIN_BEHIND_AFTER = 1 days;
    uint256 public constant MAX_BEHIND_AFTER = 90 days;
    uint256 public constant MIN_MIN_PERIOD_EARNINGS = 1e6; // at least 1 USDG, so zero history can't qualify
    uint256 public constant MAX_POOL_CAP = 1e12 * 1e6; // 1 trillion USDG, well inside uint96
    uint16 public constant MAX_VAULT_SHARE_BPS = 5000;
    uint16 public constant MIN_REPAY_SHARE_BPS = 1000;
    uint16 public constant MAX_REPAY_SHARE_BPS = 5000; // equals the hook's own bound

    UpfrontHook public immutable hook;
    LenderVault public immutable vault;
    IERC20 public immutable usdg;
    address public immutable treasury;

    /// @notice The protocol multisig. It can pause new advances and change offer settings for future offers.
    address public immutable admin;

    uint8 public immutable periodDays;
    uint16 public immutable minHistoryDays;
    uint256 public immutable minPeriodEarnings;
    uint40 public immutable behindAfter;

    /// @notice Offer settings for future advances. Live advances keep the terms they were accepted with.
    uint256 public poolCap;
    uint16 public maxVaultShareBps;
    uint16 public repayShareBps;

    /// @notice True while new advances are paused. Swaps, claims, repayments and settlement keep working.
    bool public paused;

    struct Record {
        uint96 principal;
        uint96 totalDue;
        /// @notice Repayment already sent on to the vault and the protocol.
        uint96 settled;
        uint96 principalSettled;
        /// @notice The protocol's cut of the flat fee already sent to the treasury.
        uint96 protocolSettled;
        bool writtenOff;
    }

    mapping(PoolId => Record) internal _records;

    constructor(UpfrontHook hook_, LenderVault vault_, address admin_, DeskParams memory p) {
        if (admin_ == address(0)) revert MissingAddress();
        if (p.periodDays == 0 || p.periodDays > MAX_PERIOD_DAYS) revert OutOfBounds();
        if (p.minHistoryDays > MAX_MIN_HISTORY_DAYS) revert OutOfBounds();
        if (p.behindAfter < MIN_BEHIND_AFTER || p.behindAfter > MAX_BEHIND_AFTER) revert OutOfBounds();
        if (p.minPeriodEarnings < MIN_MIN_PERIOD_EARNINGS) revert OutOfBounds();
        hook = hook_;
        vault = vault_;
        usdg = IERC20(address(vault_.asset()));
        treasury = hook_.treasury();
        admin = admin_;
        periodDays = p.periodDays;
        minHistoryDays = p.minHistoryDays;
        minPeriodEarnings = p.minPeriodEarnings;
        behindAfter = p.behindAfter;
        _setOfferSettings(p.poolCap, p.maxVaultShareBps, p.repayShareBps);
    }

    // ---------------------------------------------------------------------
    // Offers
    // ---------------------------------------------------------------------

    /// @notice The offer a pool would get right now, with the reason if there is none.
    /// @dev Recomputed from the pool's own earnings every call. Never cached (BUILD_SPEC §7).
    function getOffer(PoolId id) public view returns (Offer memory o) {
        o.repayShareBps = repayShareBps;
        PoolState memory st = hook.poolState(id);
        if (hook.ownerOf(id) == address(0)) return _no(o, UpfrontErrors.PoolNotRegistered.selector);
        if (paused) return _no(o, UpfrontErrors.AdvancesPaused.selector);
        if (st.advanceOpen) return _no(o, UpfrontErrors.AdvanceOpen.selector);
        if (_hasUnsettled(id)) return _no(o, UpfrontErrors.SettleFirst.selector);

        uint32 today = RevenueMath.dayOf(block.timestamp);
        if (today < st.registeredDay + minHistoryDays) return _no(o, UpfrontErrors.HistoryTooShort.selector);

        (, uint256[35] memory amounts) = hook.earningsHistory(id);
        (uint256 weakest, uint256 total) = RevenueMath.weakestPeriod(amounts, periodDays, PERIODS);
        o.weakestPeriod = weakest;
        if (weakest < minPeriodEarnings) return _no(o, UpfrontErrors.EarningsTooLow.selector);

        o.amount = RevenueMath.offerAmount(weakest, OFFER_MULTIPLIER, poolCap, vault.idle(), maxVaultShareBps);
        if (o.amount == 0) return _no(o, UpfrontErrors.VaultLiquidityLow.selector);
        o.flatFeeBps = uint16(RevenueMath.flatFeeBps(weakest, total, PERIODS, MIN_FLAT_FEE_BPS, MAX_FLAT_FEE_BPS));
        o.totalDue = RevenueMath.totalDue(o.amount, o.flatFeeBps);
        o.eligible = true;
    }

    function _no(Offer memory o, bytes4 reason) private pure returns (Offer memory) {
        o.reason = reason;
        return o;
    }

    /// @notice Takes the offer the pool has right now. USDG goes straight to the owner.
    /// @dev Only the pool owner. The offer is recomputed here, and the call reverts with {OfferChanged} if it is now
    ///      smaller than `minAmount` or dearer than `maxFlatFeeBps`. The hook locks ownership and starts taking
    ///      `repayShareBps` of the owner's share. Emits {AdvanceAccepted}.
    /// @param minAmount The least USDG the owner will take.
    /// @param maxFlatFeeBps The highest flat fee the owner will pay.
    function acceptOffer(PoolId id, uint256 minAmount, uint16 maxFlatFeeBps)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (msg.sender != hook.ownerOf(id)) revert NotPoolOwner();
        Offer memory o = getOffer(id);
        if (!o.eligible) _revertWith(o.reason);
        if (o.amount < minAmount || o.flatFeeBps > maxFlatFeeBps) revert OfferChanged();

        amount = o.amount;
        uint40 behindAt = uint40(block.timestamp + behindAfter);

        // Effects
        // o.totalDue <= amount * 1.12 and amount <= poolCap <= MAX_POOL_CAP, so both fit in uint96.
        _records[id] = Record({
            principal: uint96(amount),
            totalDue: uint96(o.totalDue),
            settled: 0,
            principalSettled: 0,
            protocolSettled: 0,
            writtenOff: false
        });
        emit AdvanceAccepted(id, msg.sender, amount, o.totalDue, o.flatFeeBps, o.repayShareBps, behindAt);

        // Interactions: the hook locks ownership and starts repayment, then the vault pays the owner.
        hook.openAdvance(id, uint96(o.totalDue), o.repayShareBps, behindAt);
        vault.fundAdvance(id, msg.sender, amount);
    }

    function _revertWith(bytes4 reason) private pure {
        assembly ("memory-safe") {
            mstore(0, reason)
            revert(0, 4)
        }
    }

    // ---------------------------------------------------------------------
    // Repayment
    // ---------------------------------------------------------------------

    /// @notice Sends the pool's new repayments to the vault and the protocol.
    /// @dev Anyone can call. The hook credits repayments to this contract as the pool earns. This pulls them, then
    ///      splits what is new for this pool: principal and the lenders' part of the flat fee go to the vault, the
    ///      protocol's 15% of the flat fee goes to the treasury. Emits {RepaymentSettled}.
    function settle(PoolId id) external nonReentrant returns (uint256 amount) {
        amount = _settle(id);
        if (amount == 0) revert NothingToSettle();
    }

    function _settle(PoolId id) internal returns (uint256 amount) {
        Record memory r = _records[id];
        if (r.totalDue == 0 || r.writtenOff) return 0;

        uint256 repaid = hook.advanceOf(id).repaid;
        if (repaid <= r.settled) return 0;
        amount = repaid - r.settled;

        // Pull this desk's whole credit from the hook. Other pools' repayments wait here until settled.
        if (hook.claimable(address(this)) != 0) hook.claim();

        // Everything is derived from cumulative totals, so settling in pieces gives exactly the same result as
        // settling once. Principal rounds up and the protocol's cut rounds down: both favour lenders.
        uint256 principalCum = RevenueMath.principalPaid(repaid, r.principal, r.totalDue);
        uint256 principalPart = principalCum - r.principalSettled;
        uint256 feeCum = repaid - principalCum; // principalCum never exceeds repaid
        uint256 protocolCum = feeCum * PROTOCOL_CUT_BPS / RevenueMath.BPS;
        uint256 protocolFee = protocolCum - r.protocolSettled;
        uint256 lenderFee = amount - principalPart - protocolFee;

        r.settled = uint96(repaid);
        r.principalSettled = uint96(principalCum);
        r.protocolSettled = uint96(protocolCum);
        _records[id] = r;

        emit RepaymentSettled(id, amount, principalPart, lenderFee, protocolFee);

        IERC20 token = usdg;
        token.safeTransfer(address(vault), principalPart + lenderFee);
        vault.receiveRepayment(id, principalPart, lenderFee);
        if (protocolFee != 0) token.safeTransfer(treasury, protocolFee);
    }

    function _hasUnsettled(PoolId id) internal view returns (bool) {
        Record memory r = _records[id];
        return r.totalDue != 0 && !r.writtenOff && r.settled < r.totalDue;
    }

    /// @notice Writes off an advance that is still unpaid long after its schedule. This is a loss for lenders.
    /// @dev Anyone can call, only after `behindAt + 180 days`. Settles what is owed first, closes the advance on
    ///      the hook (which unlocks ownership) and writes the rest off in the vault. Emits {AdvanceWrittenOff}.
    function writeOff(PoolId id) external nonReentrant {
        Advance memory adv = hook.advanceOf(id);
        if (!hook.isAdvanceOpen(id)) revert NoAdvanceOpen();
        if (block.timestamp < uint256(adv.behindAt) + WRITE_OFF_DELAY) revert NotWrittenOffYet();

        _settle(id);
        Record memory r = _records[id];
        uint256 lost = r.principal - r.principalSettled;
        r.writtenOff = true;
        _records[id] = r;

        emit AdvanceWrittenOff(id, lost);
        hook.closeAdvance(id);
        vault.writeOff(id, lost);
    }

    // ---------------------------------------------------------------------
    // Admin (BUILD_SPEC §4.8)
    // ---------------------------------------------------------------------

    /// @notice Pauses or resumes new advances. Swaps, claims and repayments always keep working.
    /// @dev Only the admin multisig. Emits {AdvancesPausedSet}.
    function setPaused(bool paused_) external {
        if (msg.sender != admin) revert NotAdvanceAdmin();
        paused = paused_;
        emit AdvancesPausedSet(paused_);
    }

    /// @notice Changes the offer settings for future advances, within hard bounds. Live advances are untouched.
    /// @dev Only the admin multisig. Emits {OfferSettingsSet}.
    function setOfferSettings(uint256 poolCap_, uint16 maxVaultShareBps_, uint16 repayShareBps_) external {
        if (msg.sender != admin) revert NotAdvanceAdmin();
        _setOfferSettings(poolCap_, maxVaultShareBps_, repayShareBps_);
    }

    function _setOfferSettings(uint256 poolCap_, uint16 maxVaultShareBps_, uint16 repayShareBps_) internal {
        if (
            poolCap_ == 0 || poolCap_ > MAX_POOL_CAP || maxVaultShareBps_ == 0
                || maxVaultShareBps_ > MAX_VAULT_SHARE_BPS || repayShareBps_ < MIN_REPAY_SHARE_BPS
                || repayShareBps_ > MAX_REPAY_SHARE_BPS
        ) revert OutOfBounds();
        poolCap = poolCap_;
        maxVaultShareBps = maxVaultShareBps_;
        repayShareBps = repayShareBps_;
        emit OfferSettingsSet(poolCap_, maxVaultShareBps_, repayShareBps_);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice What the desk tracks for a pool's latest advance.
    function recordOf(PoolId id) external view returns (Record memory) {
        return _records[id];
    }
}
