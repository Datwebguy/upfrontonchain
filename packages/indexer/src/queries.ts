import type { Db } from "./db.ts";
import { getTotal } from "./db.ts";

/** Amounts are USDG in its smallest unit (6 decimals), as decimal text. The app formats them. */

export function totals(db: Db) {
  return {
    feesPaidToOwners: getTotal(db, "feesToOwners").toString(),
    paidUpfront: getTotal(db, "paidUpfront").toString(),
    repaid: getTotal(db, "repaid").toString(),
    trades: Number(getTotal(db, "trades")),
    volume: getTotal(db, "volume").toString(),
    advances: Number(getTotal(db, "advances")),
    pools: (db.prepare("SELECT COUNT(*) AS n FROM pools").get() as { n: number }).n,
  };
}

interface PoolRow {
  pool_id: string;
  owner: string;
  app: string;
  token: string | null;
  trading_fee: number | null;
  tick_spacing: number | null;
  fee_bps: number;
  max_fee_bps: number;
  owner_bps: number;
  app_bps: number;
  referrer_bps: number;
  protocol_bps: number;
  position_id: string | null;
  version: number | null;
  created_block: number;
  created_ts: number;
  created_tx: string;
  trades: number;
  volume: string;
  fees: string;
  owner_earned: string;
}

function poolOut(r: PoolRow) {
  return {
    id: r.pool_id,
    owner: r.owner,
    app: r.app,
    token: r.token,
    tradingFee: r.trading_fee,
    tickSpacing: r.tick_spacing,
    upfrontFeeBps: r.fee_bps,
    maxFeeBps: r.max_fee_bps,
    shares: { ownerBps: r.owner_bps, appBps: r.app_bps, referrerBps: r.referrer_bps, protocolBps: r.protocol_bps },
    version: r.version,
    createdAt: r.created_ts,
    createdTx: r.created_tx,
    trades: r.trades,
    volume: r.volume,
    fees: r.fees,
    ownerEarned: r.owner_earned,
  };
}

export function listPools(db: Db, opts: { owner?: string; limit: number; offset: number }) {
  const rows = opts.owner
    ? (db
        .prepare("SELECT * FROM pools WHERE owner = ? ORDER BY created_block DESC, pool_id LIMIT ? OFFSET ?")
        .all(opts.owner.toLowerCase(), opts.limit, opts.offset) as unknown as PoolRow[])
    : (db
        .prepare("SELECT * FROM pools ORDER BY created_block DESC, pool_id LIMIT ? OFFSET ?")
        .all(opts.limit, opts.offset) as unknown as PoolRow[]);
  return rows.map(poolOut);
}

export function getPool(db: Db, id: string) {
  const row = db.prepare("SELECT * FROM pools WHERE pool_id = ?").get(id.toLowerCase()) as PoolRow | undefined;
  if (!row) return undefined;
  const advances = advancesFor(db, row.pool_id);
  return { ...poolOut(row), advance: advances[advances.length - 1] ?? null };
}

/** Owner earnings per day from the Upfront fee events, oldest first. Days with no trades are left out. */
export function dailyEarnings(db: Db, id: string, days: number) {
  const rows = db
    .prepare("SELECT day, owner_gross, trades FROM daily WHERE pool_id = ? ORDER BY day DESC LIMIT ?")
    .all(id.toLowerCase(), days) as { day: number; owner_gross: string; trades: number }[];
  return rows.reverse().map((r) => ({ day: r.day, ownerEarned: r.owner_gross, trades: r.trades }));
}

interface FeeRow {
  block: number;
  log_index: number;
  tx: string;
  ts: number;
  pool_id: string;
  trader: string;
  referrer: string;
  usdg_amount: string;
  fee: string;
  quoted: string;
  fee_bps: number;
  owner_amount: string;
  app_amount: string;
  referrer_amount: string;
  protocol_amount: string;
  repay_amount: string;
}

function tradeOut(r: FeeRow) {
  return {
    block: r.block,
    time: r.ts,
    tx: r.tx,
    poolId: r.pool_id,
    trader: r.trader,
    referrer: r.referrer,
    usdgAmount: r.usdg_amount,
    fee: r.fee,
    /** The fee the app showed before the trade, from the pool's rate at that moment. */
    quotedFee: r.quoted,
    feeBps: r.fee_bps,
    split: {
      owner: r.owner_amount,
      app: r.app_amount,
      referrer: r.referrer_amount,
      protocol: r.protocol_amount,
      repay: r.repay_amount,
    },
  };
}

export function poolTrades(db: Db, id: string, limit: number) {
  const rows = db
    .prepare("SELECT * FROM fees WHERE pool_id = ? ORDER BY block DESC, log_index DESC LIMIT ?")
    .all(id.toLowerCase(), limit) as unknown as FeeRow[];
  return rows.map(tradeOut);
}

export function recentTrades(db: Db, limit: number) {
  const rows = db
    .prepare("SELECT * FROM fees ORDER BY block DESC, log_index DESC LIMIT ?")
    .all(limit) as unknown as FeeRow[];
  return rows.map(tradeOut);
}

/** Total fee shown against total fee charged across all trades. They always match: that is the point. */
export function honestFees(db: Db) {
  const rows = db.prepare("SELECT quoted, fee FROM fees").all() as { quoted: string; fee: string }[];
  let quoted = 0n;
  let charged = 0n;
  let mismatches = 0;
  for (const r of rows) {
    quoted += BigInt(r.quoted);
    charged += BigInt(r.fee);
    if (r.quoted !== r.fee) mismatches++;
  }
  return { trades: rows.length, quoted: quoted.toString(), charged: charged.toString(), mismatches };
}

export type AdvanceStatus = "open" | "repaid" | "written_off" | "closed";

interface EventRow {
  id: number;
  block: number;
  log_index: number;
  ts: number;
  pool_id: string | null;
  name: string;
  args: string;
}

/** The advances taken on one pool, or on all pools, oldest first, with progress read from the fee events. */
export function advancesFor(db: Db, poolId?: string) {
  const accepted = (
    poolId
      ? db.prepare("SELECT * FROM events WHERE name = 'AdvanceAccepted' AND pool_id = ? ORDER BY id").all(poolId.toLowerCase())
      : db.prepare("SELECT * FROM events WHERE name = 'AdvanceAccepted' ORDER BY id").all()
  ) as unknown as EventRow[];

  return accepted.map((ev, i) => {
    const next = accepted.find((o, j) => j > i && o.pool_id === ev.pool_id);
    const upper = next?.id ?? Number.MAX_SAFE_INTEGER;
    const args = JSON.parse(ev.args) as Record<string, string>;

    const inWindow = db
      .prepare("SELECT name, args FROM events WHERE pool_id = ? AND id > ? AND id < ? ORDER BY id")
      .all(ev.pool_id, ev.id, upper) as { name: string; args: string }[];

    let status: AdvanceStatus = "open";
    let behindSchedule = false;
    let settled = 0n;
    for (const w of inWindow) {
      if (w.name === "AdvanceRepaid") status = "repaid";
      else if (w.name === "AdvanceWrittenOff") status = "written_off";
      else if (w.name === "AdvanceClosed" && status === "open") status = "closed";
      else if (w.name === "AdvanceBehindSchedule") behindSchedule = true;
      else if (w.name === "RepaymentSettled") settled += BigInt((JSON.parse(w.args) as { amount: string }).amount);
    }

    // What the pool has paid so far: the repay part of every fee since this advance was accepted.
    const nextBlock = next?.block ?? Number.MAX_SAFE_INTEGER;
    const nextLog = next?.log_index ?? 0;
    const fees = db
      .prepare(
        `SELECT repay_amount FROM fees WHERE pool_id = ?
           AND (block > ? OR (block = ? AND log_index > ?))
           AND (block < ? OR (block = ? AND log_index < ?))`,
      )
      .all(ev.pool_id, ev.block, ev.block, ev.log_index, nextBlock, nextBlock, nextLog) as { repay_amount: string }[];
    let repaid = 0n;
    for (const f of fees) repaid += BigInt(f.repay_amount);

    return {
      poolId: ev.pool_id as string,
      owner: args.owner as string,
      acceptedAt: ev.ts,
      principal: args.principal as string,
      totalDue: args.totalDue as string,
      flatFeeBps: Number(args.flatFeeBps),
      repayShareBps: Number(args.repayShareBps),
      behindAt: Number(args.behindAt),
      repaid: repaid.toString(),
      settled: settled.toString(),
      behindSchedule,
      status,
    };
  });
}

export function lendSummary(db: Db) {
  const advances = advancesFor(db);
  return {
    deposited: getTotal(db, "deposited").toString(),
    withdrawn: getTotal(db, "withdrawn").toString(),
    paidUpfront: getTotal(db, "paidUpfront").toString(),
    repaid: getTotal(db, "repaid").toString(),
    writtenOff: getTotal(db, "writtenOff").toString(),
    openAdvances: advances.filter((a) => a.status === "open").length,
    advances: advances.length,
  };
}

/** What one address has put into the vault and taken out, from the vault's own Deposit and Withdraw events. */
export function lenderFlows(db: Db, address: string) {
  const rows = db
    .prepare(
      "SELECT name, args FROM events WHERE name IN ('Deposit', 'Withdraw') AND lower(json_extract(args, '$.owner')) = ? ORDER BY id",
    )
    .all(address.toLowerCase()) as { name: string; args: string }[];
  let deposited = 0n;
  let withdrawn = 0n;
  for (const r of rows) {
    const assets = BigInt((JSON.parse(r.args) as { assets: string }).assets);
    if (r.name === "Deposit") deposited += assets;
    else withdrawn += assets;
  }
  return { address: address.toLowerCase(), deposited: deposited.toString(), withdrawn: withdrawn.toString() };
}
