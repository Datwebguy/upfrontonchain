// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Test} from "forge-std/Test.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {DeployConfig, DeployLogic, Deployment} from "../../script/DeployLogic.sol";
import {DeskParams, Offer} from "../../src/AdvanceDesk.sol";
import {LaunchParams} from "../../src/UpfrontLauncher.sol";

/// @dev Runs against the real Robinhood Chain testnet PoolManager, PositionManager, Permit2, USDG and a real stock
///      token. Skipped unless run on that fork (AGENTS.md §3):
///
///        eval "$(node ../config/print-env.ts robinhoodTestnet)"
///        forge test --match-path 'test/fork/*' --fork-url $RH_TESTNET_RPC
///
///      Addresses come from env vars filled from packages/config/networks.ts, never from this file.
///      Balances are set with `deal` because the faucet can't be called from a test.
contract ForkTest is Test, DeployLogic {
    uint256 internal constant ROBINHOOD_TESTNET = 46_630;

    Deployment internal d;
    IERC20 internal usdg;
    IERC20 internal tsla;
    PoolSwapTest internal router;
    PoolKey internal key;
    PoolId internal id;

    address internal treasury = makeAddr("treasury");
    address internal admin = makeAddr("admin");
    address internal owner = makeAddr("owner");
    address internal lender = makeAddr("lender");
    address internal referrer = makeAddr("referrer");

    function setUp() public {
        if (block.chainid != ROBINHOOD_TESTNET) vm.skip(true);

        usdg = IERC20(vm.envAddress("USDG"));
        tsla = IERC20(vm.envAddress("STOCK_TSLA"));
        IPoolManager pm = IPoolManager(vm.envAddress("POOL_MANAGER"));

        vm.warp(block.timestamp + 40 days); // a clean record on a fork that may already be busy
        d = _deploy(
            DeployConfig({
                poolManager: pm,
                positionManager: IPositionManager(vm.envAddress("POSITION_MANAGER")),
                permit2: IAllowanceTransfer(vm.envAddress("PERMIT2")),
                usdg: usdg,
                treasury: treasury,
                admin: admin,
                protocolShareBps: 1000,
                desk: DeskParams({
                    periodDays: 1,
                    minHistoryDays: 1,
                    minPeriodEarnings: 10e6,
                    behindAfter: 2 days,
                    poolCap: 100_000e6,
                    maxVaultShareBps: 5000,
                    repayShareBps: 2000
                })
            }),
            address(this),
            address(this)
        );

        _setUsdg(address(this), 1e18); // 1 trillion USDG
        deal(address(tsla), address(this), 1e30);
        usdg.approve(address(d.launcher), type(uint256).max);
        tsla.approve(address(d.launcher), type(uint256).max);

        router = new PoolSwapTest(pm);
        usdg.approve(address(router), type(uint256).max);
        tsla.approve(address(router), type(uint256).max);

        (id, key) = _launch();
    }

    /// @dev USDG (a Paxos token) packs `balance` (uint64) and `shares` (uint64) into one mapping slot, so `deal`
    ///      can't find it and amounts must fit in 64 bits (about 18 trillion USDG). This probes the first mapping
    ///      slots, writes the balance as both fields, and keeps the write only if `balanceOf` reads it back. It does
    ///      not assume the token's storage layout. Total supply is not updated, which these tests don't read.
    function _setUsdg(address who, uint256 amount) internal {
        require(amount <= type(uint64).max, "amount does not fit USDG's 64-bit balance");
        bytes32 packed = bytes32(amount | (amount << 64));
        for (uint256 slot; slot < 32; ++slot) {
            bytes32 at = keccak256(abi.encode(who, slot));
            bytes32 old = vm.load(address(usdg), at);
            vm.store(address(usdg), at, packed);
            if (usdg.balanceOf(who) == amount) return;
            vm.store(address(usdg), at, old);
        }
        revert("could not set USDG balance");
    }

    function _launch() internal returns (PoolId poolId, PoolKey memory k) {
        LaunchParams memory p = LaunchParams({
            token: address(tsla),
            tradingFee: 3000,
            tickSpacing: 60,
            upfrontFeeBps: 100,
            ownerBps: 6000,
            appBps: 2000,
            referrerBps: 1000,
            app: makeAddr("app"),
            owner: owner,
            sqrtPriceX96: uint160(TickMath.getSqrtPriceAtTick(0)),
            tickLower: -6000,
            tickUpper: 6000,
            liquidity: 1e15,
            amount0Max: 1e15,
            amount1Max: 1e15
        });
        (poolId,) = d.launcher.launch(p);
        (Currency c0, Currency c1) = address(usdg) < address(tsla)
            ? (Currency.wrap(address(usdg)), Currency.wrap(address(tsla)))
            : (Currency.wrap(address(tsla)), Currency.wrap(address(usdg)));
        k = PoolKey({currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(d.hook))});
    }

    function _swapUsdgIn(uint256 amount, bytes memory hookData) internal {
        bool zeroForOne = address(usdg) < address(tsla);
        router.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            hookData
        );
    }

    function test_realUsdgHasSixDecimals() public view {
        assertEq(IERC20Decimals(address(usdg)).decimals(), 6);
    }

    function test_launchAndTradeOnRealContracts() public {
        assertEq(d.hook.poolConfig(id).upfrontFeeBps, 100);

        uint256 amount = 1000e6;
        uint256 quoted = d.hook.quoteFee(id, amount);
        uint256 before = usdg.balanceOf(address(this));
        _swapUsdgIn(amount, abi.encode(referrer));

        // The trader paid exactly what they specified, and the fee taken is the quoted fee.
        assertEq(before - usdg.balanceOf(address(this)), amount);
        assertEq(quoted, 10e6);
        assertEq(d.hook.claimable(referrer), quoted * 1000 / 10_000);

        vm.prank(owner);
        uint256 paid = d.hook.claim();
        assertEq(usdg.balanceOf(owner), paid);
        assertGt(paid, 0);
    }

    function test_onlyLauncherCanCreatePoolsOnTheHook() public {
        PoolKey memory k = key;
        k.fee = 500;
        vm.expectRevert();
        IPoolManager(vm.envAddress("POOL_MANAGER")).initialize(k, uint160(TickMath.getSqrtPriceAtTick(0)));
    }

    function test_advanceEndToEndOnRealContracts() public {
        _setUsdg(lender, 1_000_000e6);
        vm.startPrank(lender);
        usdg.approve(address(d.vault), type(uint256).max);
        d.vault.deposit(1_000_000e6, lender);
        vm.stopPrank();

        for (uint256 i; i < 5; ++i) {
            _swapUsdgIn(100_000e6, "");
            skip(1 days);
        }
        Offer memory o = d.advanceDesk.getOffer(id);
        assertTrue(o.eligible);
        assertEq(o.amount, 2800e6);

        vm.prank(owner);
        d.advanceDesk.acceptOffer(id, o.amount, o.flatFeeBps);
        assertEq(usdg.balanceOf(owner), 2800e6);

        uint256 guard;
        while (d.hook.isAdvanceOpen(id) && guard++ < 100) {
            _swapUsdgIn(100_000e6, "");
        }
        assertFalse(d.hook.isAdvanceOpen(id));
        d.advanceDesk.settle(id);
        assertEq(d.vault.outstanding(), 0);
        assertGt(d.vault.totalAssets(), 1_000_000e6);
    }
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}
