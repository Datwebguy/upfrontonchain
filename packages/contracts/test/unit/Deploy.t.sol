// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {DeployConfig, Deployment} from "../../script/DeployLogic.sol";
import {DeskParams} from "../../src/AdvanceDesk.sol";
import {UpfrontHook} from "../../src/UpfrontHook.sol";
import {LaunchParams} from "../../src/UpfrontLauncher.sol";
import {UpfrontBase} from "../utils/UpfrontBase.t.sol";

/// @dev Runs the same logic the deploy script runs, against a local PoolManager and PositionManager.
contract DeployTest is UpfrontBase {
    function _cfg() internal view returns (DeployConfig memory cfg) {
        cfg = DeployConfig({
            poolManager: manager,
            positionManager: IPositionManager(address(lpm)),
            permit2: IAllowanceTransfer(address(permit2)),
            usdg: IERC20(address(usdgToken)),
            treasury: treasury,
            admin: admin,
            protocolShareBps: 1000,
            desk: DeskParams({
                periodDays: 1,
                minHistoryDays: 1,
                minPeriodEarnings: 10e6,
                behindAfter: 2 days,
                poolCap: 10_000e6,
                maxVaultShareBps: 5000,
                repayShareBps: 2000
            })
        });
    }

    function test_deployMinesTheExactFlags() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        assertEq(uint160(address(d.hook)) & Hooks.ALL_HOOK_MASK, HOOK_FLAGS);
        // The salt is real: the same inputs give the same address.
        assertEq(address(d.hook), vm.computeCreate2Address(d.salt, keccak256(_initCode()), address(this)));
    }

    function test_deployWiresEverythingOnce() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        assertEq(d.hook.launcher(), address(d.launcher));
        assertEq(d.hook.advanceDesk(), address(d.advanceDesk));
        assertEq(d.vault.desk(), address(d.advanceDesk));
        vm.expectRevert();
        d.hook.wire(address(1), address(2));
        vm.expectRevert();
        d.vault.wire(address(1));
    }

    function test_deployedSystemLaunchesAPool() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        usdgToken.approve(address(d.launcher), type(uint256).max);
        stock.approve(address(d.launcher), type(uint256).max);

        LaunchParams memory p = _params(FEE_BPS, 6000, 2000, 1000);
        (PoolId id,) = d.launcher.launch(p);
        assertEq(d.hook.poolConfig(id).upfrontFeeBps, FEE_BPS);
        assertEq(d.hook.poolConfig(id).protocolBps, 1000);
    }

    // --- the assertions catch mistakes ---

    function test_assertCatchesWrongFlags() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        // The hook the base test deployed sits at a different flag pattern only if we point at a plain contract.
        d.hook = UpfrontHook(address(new Other()));
        vm.expectRevert(
            abi.encodeWithSelector(DeployCheckFailed.selector, "hook address flags are not the required flags")
        );
        this.exposedAssert(d, _cfg());
    }

    function test_assertCatchesWrongUsdg() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        DeployConfig memory cfg = _cfg();
        cfg.usdg = IERC20(address(stock)); // 18 decimals, and not the hook's USDG
        vm.expectRevert(abi.encodeWithSelector(DeployCheckFailed.selector, "USDG does not have 6 decimals"));
        this.exposedAssert(d, cfg);
    }

    function test_assertCatchesWrongTreasury() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        DeployConfig memory cfg = _cfg();
        cfg.treasury = address(0xBAD);
        vm.expectRevert(abi.encodeWithSelector(DeployCheckFailed.selector, "hook treasury"));
        this.exposedAssert(d, cfg);
    }

    function test_assertCatchesMissingPoolManager() public {
        Deployment memory d = _deploy(_cfg(), address(this), address(this));
        DeployConfig memory cfg = _cfg();
        cfg.poolManager = IPoolManager(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(DeployCheckFailed.selector, "no PoolManager at the configured address"));
        this.exposedAssert(d, cfg);
    }

    function exposedAssert(Deployment memory d, DeployConfig memory cfg) external view {
        _assertDeployment(d, cfg);
    }

    function _initCode() internal view returns (bytes memory) {
        return abi.encodePacked(type(UpfrontHook).creationCode, abi.encode(manager, usdgC, treasury, address(this)));
    }
}

contract Other {}
