// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// The external contracts the app talks to. Importing them here makes Foundry compile them, so the app's ABIs are
// generated (script/export-abis.mjs) instead of written by hand (AGENTS.md §7).
import {IV4Quoter} from "@uniswap/v4-periphery/src/interfaces/IV4Quoter.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

/// @notice The one Universal Router function the app calls to swap: `execute` with a deadline.
/// @dev Declared here because the router's own repository isn't a dependency. It is the router the app sends
///      V4_SWAP commands to, at the address in packages/config/networks.ts.
interface IUniversalRouter {
    /// @notice Runs `commands` with their `inputs`. Reverts if `deadline` has passed.
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}
