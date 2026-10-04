import { createPublicClient, http, type Address, type Log, type PublicClient } from "viem";
import { getMeta, resetDb, setMeta, transaction, type Db } from "./db.ts";
import type { IndexerConfig } from "./config.ts";
import { applyEvent, decodeLog, type ContractName, type DecodedLog } from "./events.ts";

export interface SyncState {
  /** Latest block the node reports, or undefined before the first sync. */
  head?: number;
  /** Last block the database has read up to. */
  indexed?: number;
  lastSyncAt?: number;
  lastError?: string;
}

type Contracts = NonNullable<IndexerConfig["contracts"]>;

export function makeClient(cfg: IndexerConfig): PublicClient {
  return createPublicClient({ transport: http(cfg.rpcUrl) });
}

function contractNames(contracts: Contracts): Map<string, ContractName> {
  return new Map<string, ContractName>([
    [contracts.hook.toLowerCase(), "hook"],
    [contracts.launcher.toLowerCase(), "launcher"],
    [contracts.advanceDesk.toLowerCase(), "advanceDesk"],
    [contracts.lenderVault.toLowerCase(), "lenderVault"],
  ]);
}

/**
 * Reads new blocks and applies Upfront's events. Returns how many blocks were read.
 *
 * - Only blocks at least `confirmations` deep are read.
 * - If the last block read has a different hash on chain now, everything derived is thrown away and read again from
 *   the start block. The chain is the only source of truth.
 */
export async function syncOnce(
  client: PublicClient,
  db: Db,
  cfg: IndexerConfig,
  state: SyncState = {},
): Promise<{ blocks: number; reset: boolean }> {
  const contracts = cfg.contracts;
  if (!contracts) return { blocks: 0, reset: false };

  const chainId = await client.getChainId();
  if (chainId !== cfg.chainId) throw new Error(`RPC is on chain ${chainId}, expected ${cfg.chainId}`);

  let reset = false;
  const savedHash = getMeta(db, "hash");
  const savedBlock = getMeta(db, "block");
  if (savedHash && savedBlock) {
    const onChain = await client.getBlock({ blockNumber: BigInt(savedBlock) }).catch(() => undefined);
    if (!onChain || onChain.hash !== savedHash) {
      resetDb(db);
      reset = true;
    }
  }

  const head = Number(await client.getBlockNumber());
  state.head = head;
  const target = head - cfg.confirmations;
  let next = Number(getMeta(db, "block") ?? contracts.startBlock - 1) + 1;
  const names = contractNames(contracts);
  const addresses = [...names.keys()] as Address[];
  let range = cfg.maxRange;
  let blocks = 0;

  while (next <= target) {
    const to = Math.min(next + range - 1, target);
    let logs: Log[];
    try {
      logs = await client.getLogs({ address: addresses, fromBlock: BigInt(next), toBlock: BigInt(to) });
    } catch (error) {
      // Nodes cap the block range or the result size. Ask for less and try again.
      if (range > 1) {
        range = Math.max(1, Math.floor(range / 2));
        continue;
      }
      throw error;
    }

    const decoded: DecodedLog[] = [];
    for (const log of logs) {
      const contract = names.get(log.address.toLowerCase());
      const d = contract ? decodeLog(log, contract) : undefined;
      if (d) decoded.push(d);
    }
    decoded.sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex);

    const times = new Map<number, number>();
    for (const n of new Set(decoded.map((d) => d.blockNumber))) {
      times.set(n, Number((await client.getBlock({ blockNumber: BigInt(n) })).timestamp));
    }
    const last = await client.getBlock({ blockNumber: BigInt(to) });

    transaction(db, () => {
      for (const d of decoded) applyEvent(db, d, times.get(d.blockNumber) ?? 0);
      setMeta(db, "block", String(to));
      setMeta(db, "hash", last.hash);
    });

    blocks += to - next + 1;
    next = to + 1;
    state.indexed = to;
  }

  state.indexed = Number(getMeta(db, "block") ?? contracts.startBlock - 1);
  state.lastSyncAt = Math.floor(Date.now() / 1000);
  delete state.lastError;
  return { blocks, reset };
}
