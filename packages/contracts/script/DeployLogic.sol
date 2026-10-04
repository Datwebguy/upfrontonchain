// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {AdvanceDesk, DeskParams} from "../src/AdvanceDesk.sol";
import {LenderVault} from "../src/LenderVault.sol";
import {UpfrontHook} from "../src/UpfrontHook.sol";
import {UpfrontLauncher} from "../src/UpfrontLauncher.sol";

/// @notice Everything a deployment needs. Addresses come from `packages/config/networks.ts` through env vars.
struct DeployConfig {
    IPoolManager poolManager;
    IPositionManager positionManager;
    IAllowanceTransfer permit2;
    IERC20 usdg;
    /// @notice Receives the protocol share of fees and of flat fees. The protocol multisig.
    address treasury;
    /// @notice Can pause new advances and set future-offer settings and the protocol share. The protocol multisig.
    address admin;
    uint16 protocolShareBps;
    DeskParams desk;
}

struct Deployment {
    UpfrontHook hook;
    UpfrontLauncher launcher;
    LenderVault vault;
    AdvanceDesk advanceDesk;
    bytes32 salt;
}

/// @title DeployLogic
/// @notice Mines the hook salt, deploys the four contracts, wires them and asserts the result. Shared by the deploy
///         script and the tests, so what is tested is what ships.
abstract contract DeployLogic {
    /// @notice A post-deployment check failed. Nothing should be used from this deployment.
    error DeployCheckFailed(string what);

    /// @notice The exact permission flags the hook's address must encode (BUILD_SPEC §6).
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    /// @param wirer The account that calls `wire` on the hook and the vault. It is the deployer.
    /// @param create2Deployer Who CREATE2 deploys the hook: the CREATE2 factory in a broadcast script, the test
    ///        contract itself in a test.
    function _deploy(DeployConfig memory cfg, address wirer, address create2Deployer)
        internal
        returns (Deployment memory d)
    {
        bytes memory args = abi.encode(cfg.poolManager, Currency.wrap(address(cfg.usdg)), cfg.treasury, wirer);
        (address expected, bytes32 salt) =
            HookMiner.find(create2Deployer, HOOK_FLAGS, type(UpfrontHook).creationCode, args);

        d.salt = salt;
        d.hook = new UpfrontHook{salt: salt}(cfg.poolManager, Currency.wrap(address(cfg.usdg)), cfg.treasury, wirer);
        if (address(d.hook) != expected) revert DeployCheckFailed("hook address differs from the mined address");

        d.launcher = new UpfrontLauncher(
            cfg.poolManager, cfg.positionManager, cfg.permit2, d.hook, cfg.admin, cfg.protocolShareBps
        );
        d.vault = new LenderVault(cfg.usdg, wirer);
        d.advanceDesk = new AdvanceDesk(d.hook, d.vault, cfg.admin, cfg.desk);

        // After these two calls nobody can change who the hook or the vault talk to (rule 7).
        d.vault.wire(address(d.advanceDesk));
        d.hook.wire(address(d.launcher), address(d.advanceDesk));

        _assertDeployment(d, cfg);
    }

    /// @notice Asserts the hook address encodes exactly the flags it needs and that everything is wired as intended.
    /// @dev Reverts with {DeployCheckFailed} naming what is wrong (SECURITY.md: "Hook address flag mismatch").
    function _assertDeployment(Deployment memory d, DeployConfig memory cfg) internal view {
        // Flags: the address must carry exactly the permissions the hook declares, and nothing else.
        if (uint160(address(d.hook)) & Hooks.ALL_HOOK_MASK != HOOK_FLAGS) {
            revert DeployCheckFailed("hook address flags are not the required flags");
        }
        Hooks.validateHookPermissions(IHooks(address(d.hook)), d.hook.getHookPermissions());

        // The world it talks to.
        _require(address(cfg.poolManager).code.length != 0, "no PoolManager at the configured address");
        _require(address(cfg.positionManager).code.length != 0, "no PositionManager at the configured address");
        _require(cfg.positionManager.poolManager() == cfg.poolManager, "PositionManager uses another PoolManager");
        _require(address(cfg.usdg).code.length != 0, "no USDG at the configured address");
        _require(IERC20Metadata(address(cfg.usdg)).decimals() == 6, "USDG does not have 6 decimals");

        // The four contracts point at each other and at the right things.
        _require(address(d.hook.poolManager()) == address(cfg.poolManager), "hook PoolManager");
        _require(Currency.unwrap(d.hook.usdg()) == address(cfg.usdg), "hook USDG");
        _require(d.hook.treasury() == cfg.treasury, "hook treasury");
        _require(d.hook.launcher() == address(d.launcher), "hook launcher");
        _require(d.hook.advanceDesk() == address(d.advanceDesk), "hook advance desk");
        _require(address(d.launcher.hook()) == address(d.hook), "launcher hook");
        _require(d.launcher.admin() == cfg.admin, "launcher admin");
        _require(d.vault.desk() == address(d.advanceDesk), "vault desk");
        _require(d.vault.asset() == address(cfg.usdg), "vault asset");
        _require(address(d.advanceDesk.hook()) == address(d.hook), "desk hook");
        _require(address(d.advanceDesk.vault()) == address(d.vault), "desk vault");
        _require(d.advanceDesk.admin() == cfg.admin, "desk admin");
    }

    function _require(bool ok, string memory what) private pure {
        if (!ok) revert DeployCheckFailed(what);
    }
}
