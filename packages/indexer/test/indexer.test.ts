import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";
import { route } from "../src/api.ts";
import { loadConfig, type IndexerConfig } from "../src/config.ts";
import { getMeta, getTotal, openDb, transaction } from "../src/db.ts";
import { applyEvent, decodeLog } from "../src/events.ts";
import { syncOnce, type SyncState } from "../src/sync.ts";
import { accepted, encodeLog, ev, feeTaken, launched, POOL, registered, REFERRER, TRADER } from "./fixtures.ts";

const HOOK = "0x00000000000000000000000000000000000000b1";
const LAUNCHER = "0x00000000000000000000000000000000000000b2";
const DESK = "0x00000000000000000000000000000000000000b3";
const VAULT = "0x00000000000000000000000000000000000000b4";

const cfg: IndexerConfig = {
  networkKey: "robinhoodTestnet",
  chainId: 46630,
  rpcUrl: "http://unused",
  contracts: { hook: HOOK, launcher: LAUNCHER, advanceDesk: DESK, lenderVault: VAULT, startBlock: 100 },
  dbPath: ":memory:",
  port: 0,
  confirmations: 2,
  pollMs: 1,
  maxRange: 50,
};

const get = (db: ReturnType<typeof openDb>, path: string, c: IndexerConfig = cfg, s: SyncState = {}) =>
  route(db, c, s, new URL(path, "http://x"));

function seeded() {
  const db = openDb(":memory:");
  transaction(db, () => {
    applyEvent(db, registered(100), 1000);
    applyEvent(db, launched(100), 1000);
    // 1,000 USDG swap at 1%: fee 10 USDG, owner 7, app 2, protocol 1.
    applyEvent(db, feeTaken(101, 1_000_000_000n, { owner: 7_000_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 0n }), 1100);
    // Same swap with a referrer: owner 6, app 2, referrer 1, protocol 1.
    applyEvent(db, feeTaken(102, 1_000_000_000n, { owner: 6_000_000n, app: 2_000_000n, referrer: 1_000_000n, protocol: 1_000_000n, repay: 0n }), 1200);
  });
  return db;
}

test("a launched pool and its trades add up", () => {
  const db = seeded();
  const pool = get(db, `/pools/${POOL}`).body as any;
  assert.equal(pool.upfrontFeeBps, 100);
  assert.equal(pool.token, "0x00000000000000000000000000000000000000a5");
  assert.equal(pool.trades, 2);
  assert.equal(pool.fees, "20000000");
  assert.equal(pool.volume, "2000000000");
  assert.equal(pool.ownerEarned, "13000000");
  assert.deepEqual(pool.shares, { ownerBps: 6000, appBps: 2000, referrerBps: 1000, protocolBps: 1000 });
  assert.equal(pool.advance, null);
});

test("totals come from events only", () => {
  const db = seeded();
  const t = get(db, "/totals").body as any;
  assert.equal(t.feesPaidToOwners, "13000000");
  assert.equal(t.trades, 2);
  assert.equal(t.pools, 1);
  assert.equal(t.paidUpfront, "0");
  assert.equal(t.repaid, "0");
});

test("earnings are grouped by day, owner gross including repayment", () => {
  const db = seeded();
  transaction(db, () =>
    applyEvent(db, feeTaken(103, 1_000_000_000n, { owner: 5_000_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 2_000_000n }, 20001), 1300),
  );
  const days = (get(db, `/pools/${POOL}/earnings`).body as any).days;
  assert.deepEqual(days, [
    { day: 20000, ownerEarned: "13000000", trades: 2 },
    { day: 20001, ownerEarned: "7000000", trades: 1 },
  ]);
});

test("the fee shown matches the fee charged", () => {
  const db = seeded();
  const h = get(db, "/honest-fees").body as any;
  assert.equal(h.trades, 2);
  assert.equal(h.quoted, h.charged);
  assert.equal(h.mismatches, 0);
});

test("a lowered fee changes what later trades are quoted at", () => {
  const db = seeded();
  transaction(db, () => {
    applyEvent(db, ev("hook", "FeeLowered", { poolId: POOL, oldFeeBps: 100, newFeeBps: 50 }, 104), 1400);
    // 1,000 USDG at 0.5% is a 5 USDG fee.
    applyEvent(db, feeTaken(105, 1_000_000_000n, { owner: 3_500_000n, app: 1_000_000n, referrer: 0n, protocol: 500_000n, repay: 0n }), 1500);
  });
  const trades = (get(db, `/pools/${POOL}/trades`).body as any).trades;
  assert.equal(trades[0].feeBps, 50);
  assert.equal(trades[0].quotedFee, "5000000");
  assert.equal(trades[0].fee, "5000000");
  assert.equal(trades[1].feeBps, 100);
  assert.equal((get(db, "/honest-fees").body as any).mismatches, 0);
});

test("an overcharge would show up as a mismatch", () => {
  const db = seeded();
  transaction(db, () =>
    applyEvent(db, feeTaken(106, 1_000_000_000n, { owner: 7_000_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 0n }, 20000, { fee: 11_000_000n }), 1600),
  );
  assert.equal((get(db, "/honest-fees").body as any).mismatches, 1);
});

test("an advance shows its progress from the fee events", () => {
  const db = seeded();
  transaction(db, () => {
    applyEvent(db, accepted(110, 2_800_000_000n, 2_968_000_000n), 2000);
    applyEvent(db, feeTaken(111, 1_000_000_000n, { owner: 5_600_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 1_400_000n }), 2100);
    applyEvent(db, ev("advanceDesk", "RepaymentSettled", { poolId: POOL, amount: 1_400_000n, principalPart: 1_320_000n, lenderFee: 70_000n, protocolFee: 10_000n }, 112), 2200);
  });
  const a = (get(db, "/lend/advances").body as any).advances;
  assert.equal(a.length, 1);
  assert.equal(a[0].status, "open");
  assert.equal(a[0].principal, "2800000000");
  assert.equal(a[0].repaid, "1400000");
  assert.equal(a[0].settled, "1400000");
  assert.equal((get(db, "/totals").body as any).paidUpfront, "2800000000");
  assert.equal((get(db, "/totals").body as any).repaid, "1400000");

  transaction(db, () => {
    applyEvent(db, ev("hook", "AdvanceBehindSchedule", { poolId: POOL, repaid: 1n, totalDue: 2n }, 113), 2300);
    applyEvent(db, ev("hook", "AdvanceRepaid", { poolId: POOL, totalDue: 2_968_000_000n }, 114), 2400);
  });
  const done = (get(db, `/pools/${POOL}`).body as any).advance;
  assert.equal(done.status, "repaid");
  assert.equal(done.behindSchedule, true);
});

test("a second advance on the same pool starts counting from zero", () => {
  const db = seeded();
  transaction(db, () => {
    applyEvent(db, accepted(110, 1_000_000_000n, 1_060_000_000n), 2000);
    applyEvent(db, feeTaken(111, 1_000_000_000n, { owner: 5_600_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 1_400_000n }), 2100);
    applyEvent(db, ev("hook", "AdvanceRepaid", { poolId: POOL, totalDue: 1_060_000_000n }, 112), 2200);
    applyEvent(db, accepted(120, 500_000_000n, 530_000_000n), 3000);
    applyEvent(db, feeTaken(121, 1_000_000_000n, { owner: 5_600_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 1_400_000n }), 3100);
  });
  const a = (get(db, "/lend/advances").body as any).advances;
  assert.equal(a.length, 2);
  assert.equal(a[0].status, "repaid");
  assert.equal(a[0].repaid, "1400000");
  assert.equal(a[1].status, "open");
  assert.equal(a[1].repaid, "1400000");
});

test("a lender's deposits and withdrawals add up per address", () => {
  const db = openDb(":memory:");
  const other = "0x00000000000000000000000000000000000000c2";
  const me = "0x00000000000000000000000000000000000000C1"; // checksummed or not, it matches
  transaction(db, () => {
    applyEvent(db, ev("lenderVault", "Deposit", { sender: me, owner: me, assets: 500_000_000n, shares: 1n }, 200), 1);
    applyEvent(db, ev("lenderVault", "Deposit", { sender: other, owner: other, assets: 9_000_000n, shares: 1n }, 201), 1);
    applyEvent(db, ev("lenderVault", "Withdraw", { sender: me, receiver: me, owner: me, assets: 100_000_000n, shares: 1n }, 202), 1);
  });
  const mine = get(db, `/lenders/${me}`).body as any;
  assert.deepEqual(mine, { address: me.toLowerCase(), deposited: "500000000", withdrawn: "100000000" });
  assert.equal((get(db, `/lenders/${other}`).body as any).deposited, "9000000");
  assert.equal((get(db, "/lenders/0x00000000000000000000000000000000000000d1").body as any).deposited, "0");
  assert.equal(get(db, "/lenders/nope").status, 400);
  assert.equal((get(db, "/totals").body as any).trades, 0);
});

test("a fee for a pool the indexer never saw stops the run loudly", () => {
  const db = openDb(":memory:");
  assert.throws(() => applyEvent(db, feeTaken(5, 1n, { owner: 1n, app: 0n, referrer: 0n, protocol: 0n, repay: 0n }), 1), /has not seen/);
});

test("the same event applied twice is counted once", () => {
  const db = seeded();
  const again = feeTaken(130, 1_000_000_000n, { owner: 7_000_000n, app: 2_000_000n, referrer: 0n, protocol: 1_000_000n, repay: 0n });
  transaction(db, () => applyEvent(db, again, 1));
  assert.equal(Number(getTotal(db, "trades")), 3);
  // Same block and log index would be a replay of one log; the unique key keeps a single row.
  const rows = db.prepare("SELECT COUNT(*) AS n FROM fees WHERE block = 130").get() as { n: number };
  assert.equal(rows.n, 1);
});

test("a real encoded FeeTaken log decodes through the generated ABI", () => {
  const log = encodeLog(
    "FeeTaken",
    {
      poolId: POOL,
      trader: TRADER,
      referrer: REFERRER,
      usdgAmount: 1_000_000_000n,
      fee: 10_000_000n,
      day: 20000,
      ownerAmount: 6_000_000n,
      appAmount: 2_000_000n,
      referrerAmount: 1_000_000n,
      protocolAmount: 1_000_000n,
      repayAmount: 0n,
    },
    HOOK,
    5,
  );
  const d = decodeLog(log, "hook");
  assert.ok(d);
  assert.equal(d.eventName, "FeeTaken");
  assert.equal(d.args.fee, 10_000_000n);
  assert.equal((d.args.referrer as string).toLowerCase(), REFERRER);
});

test("logs Upfront doesn't use are ignored", () => {
  const log = encodeLog("Claimed", { account: TRADER, recipient: TRADER, amount: 1n }, HOOK, 5);
  log.topics = [`0x${"dd".repeat(32)}`];
  assert.equal(decodeLog(log, "hook"), undefined);
});

test("the API checks its input and clamps limits", () => {
  const db = seeded();
  assert.equal(get(db, "/pools/nope").status, 400);
  assert.equal(get(db, `/pools/0x${"00".repeat(32)}`).status, 404);
  assert.equal(get(db, "/pools?owner=zzz").status, 400);
  assert.equal(get(db, "/missing").status, 404);
  assert.equal(((get(db, "/pools?limit=100000").body as any).pools as unknown[]).length, 1);
  // A missing limit means the default, never zero.
  assert.equal(((get(db, "/pools").body as any).pools as unknown[]).length, 1);
  assert.equal(((get(db, "/pools?limit=0").body as any).pools as unknown[]).length, 0);
  const mine = (get(db, "/pools?owner=0x00000000000000000000000000000000000000A1").body as any).pools;
  assert.equal(mine.length, 1);
  assert.equal((get(db, "/pools?owner=0x00000000000000000000000000000000000000ff").body as any).pools.length, 0);
});

test("with no deployment every answer is empty and says so", () => {
  const db = openDb(":memory:");
  const none = { ...cfg, contracts: null };
  for (const path of ["/totals", "/pools", "/trades/recent", "/lend/advances", "/lend/summary", "/honest-fees"]) {
    const body = get(db, path, none).body as any;
    assert.equal(body.deployed, false, path);
  }
  assert.equal((get(db, "/totals", none).body as any).trades, 0);
  assert.equal((get(db, "/health", none).body as any).deployed, false);
});

// --- sync, with a fake node ---

function fakeNode(opts: { head: number; logs: (from: number, to: number) => unknown[]; hashOf?: (n: number) => string; maxSpan?: number }) {
  const calls: { from: number; to: number }[] = [];
  const client = {
    getChainId: async () => 46630,
    getBlockNumber: async () => BigInt(opts.head),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      number: blockNumber,
      hash: opts.hashOf ? opts.hashOf(Number(blockNumber)) : `0x${Number(blockNumber).toString(16).padStart(64, "0")}`,
      timestamp: 1_700_000_000n + blockNumber,
    }),
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      const from = Number(fromBlock);
      const to = Number(toBlock);
      calls.push({ from, to });
      if (opts.maxSpan && to - from + 1 > opts.maxSpan) throw new Error("block range too large");
      return opts.logs(from, to);
    },
  } as unknown as PublicClient;
  return { client, calls };
}

const chainLogs = (from: number, to: number) => {
  const out: unknown[] = [];
  if (from <= 100 && to >= 100) {
    out.push(
      encodeLog("PoolRegistered", { poolId: POOL, owner: "0x00000000000000000000000000000000000000a1", app: "0x00000000000000000000000000000000000000a2", upfrontFeeBps: 100, ownerBps: 6000, appBps: 2000, referrerBps: 1000, protocolBps: 1000 }, HOOK, 100),
      encodeLog("PoolLaunched", { poolId: POOL, token: "0x00000000000000000000000000000000000000a5", owner: "0x00000000000000000000000000000000000000a1", launcher: LAUNCHER, tradingFee: 3000, tickSpacing: 60, positionId: 1n, version: 1n }, LAUNCHER, 100),
    );
  }
  return out;
};

test("sync reads from the start block, up to the confirmed head only", async () => {
  const db = openDb(":memory:");
  const node = fakeNode({ head: 120, logs: chainLogs });
  const state: SyncState = {};
  await syncOnce(node.client, db, cfg, state);
  assert.equal(getMeta(db, "block"), "118"); // head 120 minus 2 confirmations
  assert.equal(state.indexed, 118);
  assert.equal(node.calls[0]?.from, 100);
  assert.equal((get(db, "/totals").body as any).pools, 1);
});

test("sync only reads new blocks the second time", async () => {
  const db = openDb(":memory:");
  const first = fakeNode({ head: 120, logs: chainLogs });
  await syncOnce(first.client, db, cfg);
  const second = fakeNode({ head: 130, logs: chainLogs });
  await syncOnce(second.client, db, cfg);
  assert.equal(second.calls[0]?.from, 119);
  assert.equal(getMeta(db, "block"), "128");
  assert.equal((get(db, "/totals").body as any).pools, 1);
});

test("sync asks for a smaller range when the node refuses a big one", async () => {
  const db = openDb(":memory:");
  const node = fakeNode({ head: 120, logs: chainLogs, maxSpan: 7 });
  await syncOnce(node.client, db, cfg);
  assert.equal(getMeta(db, "block"), "118");
  assert.ok(node.calls.some((c) => c.to - c.from + 1 <= 7));
  assert.equal((get(db, "/totals").body as any).pools, 1);
});

test("a changed block hash throws the database away and reads again", async () => {
  const db = openDb(":memory:");
  await syncOnce(fakeNode({ head: 120, logs: chainLogs }).client, db, cfg);
  assert.equal((get(db, "/totals").body as any).pools, 1);

  // The chain reorganised: block 118 has a different hash, and the pool is gone from the new history.
  const node = fakeNode({ head: 125, logs: () => [], hashOf: (n) => `0x${"ee".repeat(31)}${n.toString(16).padStart(2, "0")}` });
  const { reset } = await syncOnce(node.client, db, cfg);
  assert.equal(reset, true);
  assert.equal((get(db, "/totals").body as any).pools, 0);
  assert.equal(node.calls[0]?.from, 100);
});

test("sync refuses a node on the wrong chain", async () => {
  const db = openDb(":memory:");
  const wrong = { ...fakeNode({ head: 120, logs: chainLogs }).client, getChainId: async () => 1 } as unknown as PublicClient;
  await assert.rejects(() => syncOnce(wrong, db, cfg), /chain 1/);
});

test("sync does nothing before deployment", async () => {
  const db = openDb(":memory:");
  const node = fakeNode({ head: 120, logs: chainLogs });
  const r = await syncOnce(node.client, db, { ...cfg, contracts: null });
  assert.equal(r.blocks, 0);
  assert.equal(node.calls.length, 0);
});

// --- config ---

test("config takes addresses from networks.ts, and local overrides only as a full set", () => {
  assert.equal(loadConfig({}).contracts, null);
  assert.throws(() => loadConfig({ UPFRONT_HOOK: HOOK }), /all of/);
  const local = loadConfig({ UPFRONT_HOOK: HOOK, UPFRONT_LAUNCHER: LAUNCHER, UPFRONT_DESK: DESK, UPFRONT_VAULT: VAULT, START_BLOCK: "7" });
  assert.equal(local.contracts?.startBlock, 7);
  assert.throws(() => loadConfig({ INDEXER_NETWORK: "nowhere" }), /Unknown/);
  assert.throws(() => loadConfig({ UPFRONT_HOOK: "0x12" }), /not an address/);
});
