// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {DeskParams} from "../src/AdvanceDesk.sol";
import {DeployConfig, DeployLogic, Deployment} from "./DeployLogic.sol";

/// @notice Deploys Upfront to one network.
///
///   eval "$(node ../config/print-env.ts robinhoodTestnet)"     # addresses from networks.ts
///   export TREASURY=<multisig> ADMIN=<multisig>
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --account <keystore> --broadcast
///
/// Addresses are never written here: they come from env vars filled from `packages/config/networks.ts`.
/// The numbers below default to the testnet values in BUILD_SPEC §7 (days where mainnet uses weeks). For mainnet,
/// set every desk variable explicitly.
contract Deploy is Script, DeployLogic {
    function run() external returns (Deployment memory d) {
        DeployConfig memory cfg = _configFromEnv();

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        d = _deploy(cfg, deployer, CREATE2_FACTORY);
        vm.stopBroadcast();

        console.log("UpfrontHook     ", address(d.hook));
        console.log("UpfrontLauncher ", address(d.launcher));
        console.log("AdvanceDesk     ", address(d.advanceDesk));
        console.log("LenderVault     ", address(d.vault));
        console.log("Hook salt        ", vm.toString(d.salt));

        // Only a real broadcast leaves a record. A dry run must never write addresses that don't exist.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _record(d);
    }

    function _configFromEnv() internal view returns (DeployConfig memory cfg) {
        cfg.poolManager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        cfg.positionManager = IPositionManager(vm.envAddress("POSITION_MANAGER"));
        cfg.permit2 = IAllowanceTransfer(vm.envAddress("PERMIT2"));
        cfg.usdg = IERC20(vm.envAddress("USDG"));
        cfg.treasury = vm.envAddress("TREASURY");
        cfg.admin = vm.envAddress("ADMIN");
        cfg.protocolShareBps = uint16(vm.envOr("PROTOCOL_SHARE_BPS", uint256(1000)));
        cfg.desk = DeskParams({
            periodDays: uint8(vm.envOr("PERIOD_DAYS", uint256(1))),
            minHistoryDays: uint16(vm.envOr("MIN_HISTORY_DAYS", uint256(1))),
            minPeriodEarnings: vm.envOr("MIN_PERIOD_EARNINGS", uint256(10e6)),
            behindAfter: uint40(vm.envOr("BEHIND_AFTER_DAYS", uint256(2)) * 1 days),
            poolCap: vm.envOr("POOL_CAP", uint256(10_000e6)),
            maxVaultShareBps: uint16(vm.envOr("MAX_VAULT_SHARE_BPS", uint256(5000))),
            repayShareBps: uint16(vm.envOr("REPAY_SHARE_BPS", uint256(2000)))
        });
    }

    /// @dev Writes `deployments/<chainId>.json`. Copy the addresses into `packages/config/networks.ts`.
    function _record(Deployment memory d) internal {
        string memory k = "deployment";
        vm.serializeAddress(k, "hook", address(d.hook));
        vm.serializeAddress(k, "launcher", address(d.launcher));
        vm.serializeAddress(k, "advanceDesk", address(d.advanceDesk));
        vm.serializeAddress(k, "lenderVault", address(d.vault));
        vm.serializeBytes32(k, "hookSalt", d.salt);
        string memory json = vm.serializeUint(k, "startBlock", block.number);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
