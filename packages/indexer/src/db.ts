import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

/**
 * Everything here is derived from chain events and can be thrown away and rebuilt. Amounts are stored as decimal
 * text so a uint256 never loses precision, and are added up in JavaScript with BigInt.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  tx TEXT NOT NULL,
  ts INTEGER NOT NULL,
  contract TEXT NOT NULL,
  name TEXT NOT NULL,
  pool_id TEXT,
  args TEXT NOT NULL,
  UNIQUE (block, log_index)
);
CREATE INDEX IF NOT EXISTS events_pool_name ON events (pool_id, name);
CREATE INDEX IF NOT EXISTS events_name ON events (name);

CREATE TABLE IF NOT EXISTS pools (
  pool_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  app TEXT NOT NULL,
  token TEXT,
  trading_fee INTEGER,
  tick_spacing INTEGER,
  fee_bps INTEGER NOT NULL,
  max_fee_bps INTEGER NOT NULL,
  owner_bps INTEGER NOT NULL,
  app_bps INTEGER NOT NULL,
  referrer_bps INTEGER NOT NULL,
  protocol_bps INTEGER NOT NULL,
  position_id TEXT,
  version INTEGER,
  created_block INTEGER NOT NULL,
  created_ts INTEGER NOT NULL,
  created_tx TEXT NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  volume TEXT NOT NULL DEFAULT '0',
  fees TEXT NOT NULL DEFAULT '0',
  owner_earned TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS pools_owner ON pools (owner);

CREATE TABLE IF NOT EXISTS fees (
  block INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  tx TEXT NOT NULL,
  ts INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  trader TEXT NOT NULL,
  referrer TEXT NOT NULL,
  usdg_amount TEXT NOT NULL,
  fee TEXT NOT NULL,
  quoted TEXT NOT NULL,
  fee_bps INTEGER NOT NULL,
  day INTEGER NOT NULL,
  owner_amount TEXT NOT NULL,
  app_amount TEXT NOT NULL,
  referrer_amount TEXT NOT NULL,
  protocol_amount TEXT NOT NULL,
  repay_amount TEXT NOT NULL,
  PRIMARY KEY (block, log_index)
);
CREATE INDEX IF NOT EXISTS fees_pool ON fees (pool_id, block, log_index);
CREATE INDEX IF NOT EXISTS fees_time ON fees (ts);

CREATE TABLE IF NOT EXISTS daily (
  pool_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  owner_gross TEXT NOT NULL,
  trades INTEGER NOT NULL,
  PRIMARY KEY (pool_id, day)
);

CREATE TABLE IF NOT EXISTS totals (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

/** Throws away everything derived. Used when a reorg is detected: the chain is the only source of truth. */
export function resetDb(db: Db): void {
  db.exec(
    "DELETE FROM events; DELETE FROM pools; DELETE FROM fees; DELETE FROM daily; DELETE FROM totals; DELETE FROM meta; DELETE FROM sqlite_sequence;",
  );
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getMeta(db: Db, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

export function getTotal(db: Db, key: string): bigint {
  const row = db.prepare("SELECT value FROM totals WHERE key = ?").get(key) as { value: string } | undefined;
  return BigInt(row?.value ?? "0");
}

export function addTotal(db: Db, key: string, amount: bigint): void {
  const next = getTotal(db, key) + amount;
  db.prepare("INSERT INTO totals (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    next.toString(),
  );
}
