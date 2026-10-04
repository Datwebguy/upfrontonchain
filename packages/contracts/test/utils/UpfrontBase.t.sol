// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
// Imported so Foundry compiles them: the shared setup loads their artifacts with vm.getCode.
import {PositionDescriptor} from "@uniswap/v4-periphery/src/PositionDescriptor.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {PosmTestSetup} from "@uniswap/v4-periphery/test/shared/PosmTestSetup.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {DeployLogic} from "../../script/DeployLogic.sol";
import {UpfrontHook} from "../../src/UpfrontHook.sol";
import {LaunchParams, UpfrontLauncher} from "../../src/UpfrontLauncher.sol";

/// @dev Test fixtures live here only and never ship (AGENTS.md rule 9).
/// @dev Inherits DeployLogic so the tests use the very flags the deploy script asserts.
abstract contract UpfrontBase is PosmTestSetup, DeployLogic {
    MockERC20 internal usdgToken;
    MockERC20 internal stock;
    Currency internal usdgC;
    Currency internal stockC;

    UpfrontHook internal upfront;
    UpfrontLauncher internal launcher;

    address internal treasury = makeAddr("treasury");
    address internal admin = makeAddr("admin");
    address internal desk = makeAddr("desk");
    address internal poolOwner = makeAddr("poolOwner");
    address internal app = makeAddr("app");
    address internal referrer = makeAddr("referrer");
    address internal trader = makeAddr("trader");

    uint16 internal constant PROTOCOL_BPS = 1000;
    uint16 internal constant FEE_BPS = 100; // 1% Upfront fee
    uint24 internal constant TRADING_FEE = 3000;
    int24 internal constant TICK_SPACING = 60;

    PoolKey internal poolKey;
    PoolId internal poolId;
    bool internal usdgIs0;

    function setUp() public virtual {
        deployFreshManagerAndRouters();
        deployPosm(manager);

        usdgToken = new MockERC20("USDG", "USDG", 6);
        stock = new MockERC20("Stock", "STK", 18);
        usdgC = Currency.wrap(address(usdgToken));
        stockC = Currency.wrap(address(stock));
        usdgIs0 = address(usdgToken) < address(stock);

        address hookAddr = address(HOOK_FLAGS);
        deployCodeTo("UpfrontHook.sol:UpfrontHook", abi.encode(manager, usdgC, treasury, address(this)), hookAddr);
        upfront = UpfrontHook(hookAddr);
        launcher = new UpfrontLauncher(
            manager, IPositionManager(address(lpm)), IAllowanceTransfer(address(permit2)), upfront, admin, PROTOCOL_BPS
        );
        _wireDesk();

        usdgToken.mint(address(this), 1e30);
        stock.mint(address(this), 1e40);
        usdgToken.approve(address(launcher), type(uint256).max);
        stock.approve(address(launcher), type(uint256).max);
        usdgToken.approve(address(swapRouter), type(uint256).max);
        stock.approve(address(swapRouter), type(uint256).max);

        (poolKey, poolId) = _launch(FEE_BPS, 6000, 2000, 1000);
    }

    /// @dev Wires the hook to its advance desk. Tests that need the real desk override this.
    function _wireDesk() internal virtual {
        upfront.wire(address(launcher), desk);
    }

    function _params(uint16 feeBps, uint16 ownerBps, uint16 appBps, uint16 referrerBps)
        internal
        view
        returns (LaunchParams memory p)
    {
        p = LaunchParams({
            token: address(stock),
            tradingFee: TRADING_FEE,
            tickSpacing: TICK_SPACING,
            upfrontFeeBps: feeBps,
            ownerBps: ownerBps,
            appBps: appBps,
            referrerBps: referrerBps,
            app: app,
            owner: poolOwner,
            sqrtPriceX96: uint160(TickMath.getSqrtPriceAtTick(0)),
            tickLower: -6000,
            tickUpper: 6000,
            liquidity: 1e15,
            // Pull more than needed so the refund path is exercised.
            amount0Max: 1e18,
            amount1Max: 1e18
        });
    }

    function _launch(uint16 feeBps, uint16 ownerBps, uint16 appBps, uint16 referrerBps)
        internal
        returns (PoolKey memory key, PoolId id)
    {
        (id,) = launcher.launch(_params(feeBps, ownerBps, appBps, referrerBps));
        (Currency c0, Currency c1) = usdgIs0 ? (usdgC, stockC) : (stockC, usdgC);
        key = PoolKey({
            currency0: c0, currency1: c1, fee: TRADING_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(address(upfront))
        });
    }

    /// @dev Swap with USDG as the input (`usdgIn`) or output, exact input (`exactIn`) or exact output.
    ///      USDG is the specified currency when (usdgIn == exactIn).
    function _swap(bool usdgIn, bool exactIn, uint256 amount, bytes memory hookData) internal returns (BalanceDelta) {
        bool zeroForOne = usdgIn == usdgIs0;
        return swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: exactIn ? -int256(amount) : int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            hookData
        );
    }
}
