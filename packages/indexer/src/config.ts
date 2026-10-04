import { networks, type Address, type NetworkKey } from "../../config/networks.ts";

export interface IndexerConfig {
  networkKey: NetworkKey;
  chainId: number;
  rpcUrl: string;
  /** Null until Upfront is deployed on this network. The indexer then reports "not deployed" and stays idle. */
  contracts: { hook: Address; launcher: Address; advanceDesk: Address; lenderVault: Address; startBlock: number } | null;
  dbPath: string;
  port: number;
  /** Blocks to wait before reading, so a shallow reorg never reaches the database. */
  confirmations: number;
  pollMs: number;
  maxRange: number;
}

function asAddress(value: string | undefined, name: string): Address | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} is not an address`);
  return value as Address;
}

/**
 * Reads the indexer's settings. Addresses come from packages/config/networks.ts. The UPFRONT_* variables exist only
 * to point the indexer at a local test deployment (anvil) and are never used for a real network.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const networkKey = (env.INDEXER_NETWORK ?? "robinhoodTestnet") as NetworkKey;
  const network = networks[networkKey];
  if (!network) throw new Error(`Unknown INDEXER_NETWORK: ${networkKey}`);

  const hook = asAddress(env.UPFRONT_HOOK, "UPFRONT_HOOK");
  const launcher = asAddress(env.UPFRONT_LAUNCHER, "UPFRONT_LAUNCHER");
  const advanceDesk = asAddress(env.UPFRONT_DESK, "UPFRONT_DESK");
  const lenderVault = asAddress(env.UPFRONT_VAULT, "UPFRONT_VAULT");
  const overridden = hook && launcher && advanceDesk && lenderVault;
  if ((hook || launcher || advanceDesk || lenderVault) && !overridden) {
    throw new Error("Set all of UPFRONT_HOOK, UPFRONT_LAUNCHER, UPFRONT_DESK and UPFRONT_VAULT, or none");
  }

  const contracts = overridden
    ? { hook, launcher, advanceDesk, lenderVault, startBlock: Number(env.START_BLOCK ?? 0) }
    : network.upfront;

  return {
    networkKey,
    chainId: network.chainId,
    rpcUrl: env.RPC_URL ?? network.rpcUrl,
    contracts,
    dbPath: env.DB_PATH ?? `./data/${networkKey}.sqlite`,
    port: Number(env.PORT ?? 8787),
    confirmations: Number(env.CONFIRMATIONS ?? 5),
    pollMs: Number(env.POLL_MS ?? 2000),
    maxRange: Number(env.MAX_RANGE ?? 2000),
  };
}
