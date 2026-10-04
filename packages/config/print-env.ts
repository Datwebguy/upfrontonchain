/**
 * Prints the environment variables the Foundry deploy script and fork tests read, from networks.ts, so addresses
 * are never typed anywhere else.
 *
 *   eval "$(node packages/config/print-env.ts robinhoodTestnet)"
 *
 * Needs Node 22.18 or newer (it runs TypeScript directly).
 */
import { networks, robinhoodTestnetStockTokens, type NetworkKey } from "./networks.ts";

const key = process.argv[2] as NetworkKey | undefined;
if (!key || !(key in networks)) {
  console.error(`Usage: node print-env.ts <${Object.keys(networks).join("|")}>`);
  process.exit(1);
}

const n = networks[key];
const lines: Record<string, string> = {
  CHAIN_ID: String(n.chainId),
  RPC_URL: n.rpcUrl,
  POOL_MANAGER: n.uniswap.poolManager,
  POSITION_MANAGER: n.uniswap.positionManager,
  PERMIT2: n.uniswap.permit2,
  USDG: n.usdg,
};
if (key === "robinhoodTestnet") {
  // AGENTS.md §3 runs fork tests with --fork-url $RH_TESTNET_RPC.
  lines.RH_TESTNET_RPC = n.rpcUrl;
  for (const t of robinhoodTestnetStockTokens) lines[`STOCK_${t.symbol}`] = t.address;
}
for (const [name, value] of Object.entries(lines)) console.log(`export ${name}=${value}`);
