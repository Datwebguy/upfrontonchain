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
import {Script} from "forge-std/Script.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {AdvanceDesk, Offer} from "../../src/AdvanceDesk.sol";
import {LenderVault} from "../../src/LenderVault.sol";
import {UpfrontHook} from "../../src/UpfrontHook.sol";
import {LaunchParams, UpfrontLauncher} from "../../src/UpfrontLauncher.sol";

/// @dev Test-only. Drives real activity through a real deployment on a local anvil fork so the indexer can be
///      checked against it. Never run against a live network: it deploys a mock token. Phases, set with PHASE:
///      setup, swap (N swaps), repay (swap until the advance is repaid), accept, settle.
contract Activity is Script {
    UpfrontHook internal hook;
    UpfrontLauncher internal launcher;
    AdvanceDesk internal desk;
    LenderVault internal vault;
    IERC20 internal usdg;
    address internal me;

    function run() external {
        hook = UpfrontHook(vm.envAddress("HOOK"));
        launcher = UpfrontLauncher(vm.envAddress("LAUNCHER"));
        desk = AdvanceDesk(vm.envAddress("DESK"));
        vault = LenderVault(vm.envAddress("VAULT"));
        usdg = IERC20(vm.envAddress("USDG"));

        string memory phase = vm.envString("PHASE");
        vm.startBroadcast();
        (, me,) = vm.readCallers();
        bytes32 h = keccak256(bytes(phase));
        if (h == keccak256("setup")) _setup();
        else if (h == keccak256("swap")) _swap(vm.envUint("N"), false);
        else if (h == keccak256("repay")) _swap(150, true);
        else if (h == keccak256("accept")) _accept();
        else if (h == keccak256("settle")) _settle();
        else revert("unknown PHASE");
        vm.stopBroadcast();
    }

    function _key() internal view returns (PoolKey memory) {
        address token = vm.envAddress("TOKEN");
        (Currency c0, Currency c1) = address(usdg) < token
            ? (Currency.wrap(address(usdg)), Currency.wrap(token))
            : (Currency.wrap(token), Currency.wrap(address(usdg)));
        return PoolKey({currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(hook))});
    }

    function _setup() internal {
        IPoolManager pm = IPoolManager(vm.envAddress("POOL_MANAGER"));
        MockERC20 token = new MockERC20("TestStock", "TST", 18);
        token.mint(me, 1e30);
        PoolSwapTest router = new PoolSwapTest(pm);

        usdg.approve(address(launcher), type(uint256).max);
        token.approve(address(launcher), type(uint256).max);
        usdg.approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);

        (PoolId id,) = launcher.launch(
            LaunchParams({
                token: address(token),
                tradingFee: 3000,
                tickSpacing: 60,
                upfrontFeeBps: 100,
                ownerBps: 6000,
                appBps: 2000,
                referrerBps: 1000,
                app: vm.envAddress("APP"),
                owner: me,
                sqrtPriceX96: uint160(TickMath.getSqrtPriceAtTick(0)),
                tickLower: -6000,
                tickUpper: 6000,
                liquidity: 1e15,
                amount0Max: 1e15,
                amount1Max: 1e15
            })
        );

        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(500_000e6, me);

        string memory k = "activity";
        vm.serializeAddress(k, "token", address(token));
        vm.serializeAddress(k, "router", address(router));
        string memory json = vm.serializeBytes32(k, "poolId", PoolId.unwrap(id));
        vm.writeJson(json, vm.envString("ACTIVITY_FILE"));
    }

    function _swap(uint256 n, bool untilRepaid) internal {
        PoolKey memory key = _key();
        PoolSwapTest router = PoolSwapTest(vm.envAddress("ROUTER"));
        PoolId id = PoolId.wrap(vm.envBytes32("POOL_ID"));
        address referrer = vm.envAddress("REFERRER");
        bool zeroForOne = address(usdg) < vm.envAddress("TOKEN");

        for (uint256 i; i < n; ++i) {
            if (untilRepaid && !hook.isAdvanceOpen(id)) break;
            router.swap(
                key,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(100_000e6),
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
                i % 2 == 0 ? abi.encode(referrer) : bytes("")
            );
        }
    }

    function _accept() internal {
        PoolId id = PoolId.wrap(vm.envBytes32("POOL_ID"));
        Offer memory o = desk.getOffer(id);
        require(o.eligible, "not eligible");
        desk.acceptOffer(id, o.amount, o.flatFeeBps);
    }

    function _settle() internal {
        PoolId id = PoolId.wrap(vm.envBytes32("POOL_ID"));
        desk.settle(id);
        hook.claim();
        vault.withdraw(1000e6, me, me);
    }
}
