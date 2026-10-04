import { decodeEventLog, type AbiEvent, type Hex, type Log } from "viem";
import {
  advanceDeskAbi,
  lenderVaultAbi,
  upfrontHookAbi,
  upfrontLauncherAbi,
} from "../../config/abis.ts";
import { addTotal, type Db } from "./db.ts";

export type ContractName = "hook" | "launcher" | "advanceDesk" | "lenderVault";

/** One entry per distinct event, taken from the generated ABIs. */
const seen = new Set<string>();
export const eventsAbi: AbiEvent[] = [];
for (const abi of [upfrontHookAbi, upfrontLauncherAbi, advanceDeskAbi, lenderVaultAbi]) {
  for (const item of abi) {
    if (item.type !== "event") continue;
    const key = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
    if (seen.has(key)) continue;
    seen.add(key);
    eventsAbi.push(item as AbiEvent);
  }
}

export interface DecodedLog {
  contract: ContractName;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex: number;
  txHash: Hex;
}

/** Decodes a raw log. Returns undefined for events Upfront doesn't use (for example ERC-20 transfers). */
export function decodeLog(log: Log, contract: ContractName): DecodedLog | undefined {
  if (log.blockNumber === null || log.logIndex === null || log.transactionHash === null) return undefined;
  try {
    const decoded = decodeEventLog({ abi: eventsAbi, data: log.data, topics: log.topics });
    return {
      contract,
      eventName: decoded.eventName as string,
      args: (decoded.args ?? {}) as Record<string, unknown>,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      txHash: log.transactionHash,
    };
  } catch {
    return undefined;
  }
}

const big = (value: unknown): bigint => BigInt(value as bigint | number | string);
const str = (value: unknown): string => (value as string).toLowerCase();

function json(args: Record<string, unknown>): string {
  return JSON.stringify(args, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

/** Events that belong to one pool carry it as `poolId`. */
function poolIdOf(args: Record<string, unknown>): string | null {
  return typeof args.poolId === "string" ? str(args.poolId) : null;
}

/**
 * Applies one decoded event to the database. Call inside a transaction, in chain order.
 * Every number written comes from the event itself.
 */
export function applyEvent(db: Db, e: DecodedLog, ts: number): void {
  const poolId = poolIdOf(e.args);

  db.prepare(
    "INSERT OR IGNORE INTO events (block, log_index, tx, ts, contract, name, pool_id, args) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(e.blockNumber, e.logIndex, e.txHash, ts, e.contract, e.eventName, poolId, json(e.args));

  const a = e.args;
  switch (e.eventName) {
    case "PoolRegistered": {
      db.prepare(
        `INSERT OR IGNORE INTO pools (pool_id, owner, app, fee_bps, max_fee_bps, owner_bps, app_bps, referrer_bps,
           protocol_bps, created_block, created_ts, created_tx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        str(a.poolId),
        str(a.owner),
        str(a.app),
        Number(a.upfrontFeeBps),
        Number(a.upfrontFeeBps), // the fee at launch is the most a trader will ever pay (rule 2)
        Number(a.ownerBps),
        Number(a.appBps),
        Number(a.referrerBps),
        Number(a.protocolBps),
        e.blockNumber,
        ts,
        e.txHash,
      );
      break;
    }
    case "PoolLaunched": {
      db.prepare(
        "UPDATE pools SET token = ?, trading_fee = ?, tick_spacing = ?, position_id = ?, version = ? WHERE pool_id = ?",
      ).run(
        str(a.token),
        Number(a.tradingFee),
        Number(a.tickSpacing),
        big(a.positionId).toString(),
        Number(a.version),
        str(a.poolId),
      );
      break;
    }
    case "FeeLowered": {
      db.prepare("UPDATE pools SET fee_bps = ? WHERE pool_id = ?").run(Number(a.newFeeBps), str(a.poolId));
      break;
    }
    case "PoolOwnerChanged": {
      db.prepare("UPDATE pools SET owner = ? WHERE pool_id = ?").run(str(a.newOwner), str(a.poolId));
      break;
    }
    case "FeeTaken": {
      const id = str(a.poolId);
      const pool = db.prepare("SELECT fee_bps FROM pools WHERE pool_id = ?").get(id) as { fee_bps: number } | undefined;
      if (!pool) throw new Error(`FeeTaken for a pool the indexer has not seen: ${id}. Check START_BLOCK.`);

      const usdg = big(a.usdgAmount);
      const fee = big(a.fee);
      const ownerAmount = big(a.ownerAmount);
      const repayAmount = big(a.repayAmount);
      // What the app showed: the pool's fee rate at that moment, rounded down like the contract does.
      const quoted = (usdg * BigInt(pool.fee_bps)) / 10_000n;

      db.prepare(
        `INSERT OR IGNORE INTO fees (block, log_index, tx, ts, pool_id, trader, referrer, usdg_amount, fee, quoted,
           fee_bps, day, owner_amount, app_amount, referrer_amount, protocol_amount, repay_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        e.blockNumber,
        e.logIndex,
        e.txHash,
        ts,
        id,
        str(a.trader),
        str(a.referrer),
        usdg.toString(),
        fee.toString(),
        quoted.toString(),
        pool.fee_bps,
        Number(a.day),
        ownerAmount.toString(),
        big(a.appAmount).toString(),
        big(a.referrerAmount).toString(),
        big(a.protocolAmount).toString(),
        repayAmount.toString(),
      );

      // The owner's gross earnings are what they received plus what went to repay their advance.
      const gross = ownerAmount + repayAmount;
      const row = db.prepare("SELECT volume, fees, owner_earned FROM pools WHERE pool_id = ?").get(id) as {
        volume: string;
        fees: string;
        owner_earned: string;
      };
      db.prepare("UPDATE pools SET trades = trades + 1, volume = ?, fees = ?, owner_earned = ? WHERE pool_id = ?").run(
        (BigInt(row.volume) + usdg).toString(),
        (BigInt(row.fees) + fee).toString(),
        (BigInt(row.owner_earned) + gross).toString(),
        id,
      );
      const day = db.prepare("SELECT owner_gross FROM daily WHERE pool_id = ? AND day = ?").get(id, Number(a.day)) as
        | { owner_gross: string }
        | undefined;
      db.prepare(
        `INSERT INTO daily (pool_id, day, owner_gross, trades) VALUES (?, ?, ?, 1)
         ON CONFLICT(pool_id, day) DO UPDATE SET owner_gross = excluded.owner_gross, trades = trades + 1`,
      ).run(id, Number(a.day), (BigInt(day?.owner_gross ?? "0") + gross).toString());

      addTotal(db, "trades", 1n);
      addTotal(db, "volume", usdg);
      addTotal(db, "fees", fee);
      addTotal(db, "feesToOwners", gross);
      break;
    }
    case "Claimed":
      addTotal(db, "claimed", big(a.amount));
      break;
    case "AdvanceAccepted":
      addTotal(db, "paidUpfront", big(a.principal));
      addTotal(db, "advances", 1n);
      break;
    case "RepaymentSettled":
      addTotal(db, "repaid", big(a.amount));
      break;
    case "Deposit":
      addTotal(db, "deposited", big(a.assets));
      break;
    case "Withdraw":
      addTotal(db, "withdrawn", big(a.assets));
      break;
    case "WrittenOff":
      addTotal(db, "writtenOff", big(a.amount));
      break;
    default:
      // Recorded in `events` above. Nothing else to derive.
      break;
  }
}
