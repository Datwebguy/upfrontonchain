import { createServer, type Server } from "node:http";
import type { IndexerConfig } from "./config.ts";
import type { Db } from "./db.ts";
import {
  advancesFor,
  dailyEarnings,
  getPool,
  honestFees,
  lendSummary,
  listPools,
  poolTrades,
  recentTrades,
  totals,
} from "./queries.ts";
import type { SyncState } from "./sync.ts";

export interface ApiResponse {
  status: number;
  body: unknown;
}

const POOL_ID = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function clamp(raw: string | null, fallback: number, max: number): number {
  if (raw === null || raw === "") return fallback; // Number(null) is 0, which would silently mean "no results"
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Routes a read-only request. Pure: no network, so it can be tested with a database and nothing else.
 * Before Upfront is deployed every list is empty and `deployed` is false: nothing is made up.
 */
export function route(db: Db, cfg: IndexerConfig, state: SyncState, url: URL): ApiResponse {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const ok = (body: unknown): ApiResponse => ({ status: 200, body });
  const bad = (message: string): ApiResponse => ({ status: 400, body: { error: message } });
  const missing = (message: string): ApiResponse => ({ status: 404, body: { error: message } });

  if (p === "/health") {
    return ok({
      network: cfg.networkKey,
      chainId: cfg.chainId,
      deployed: cfg.contracts !== null,
      head: state.head ?? null,
      indexed: state.indexed ?? null,
      behind: state.head !== undefined && state.indexed !== undefined ? state.head - state.indexed : null,
      lastSyncAt: state.lastSyncAt ?? null,
      lastError: state.lastError ?? null,
    });
  }

  const deployed = cfg.contracts !== null;

  if (p === "/totals") return ok({ deployed, ...totals(db) });
  if (p === "/honest-fees") return ok({ deployed, ...honestFees(db) });
  if (p === "/trades/recent") return ok({ deployed, trades: recentTrades(db, clamp(q.get("limit"), 20, 100)) });
  if (p === "/lend/summary") return ok({ deployed, ...lendSummary(db) });
  if (p === "/lend/advances") return ok({ deployed, advances: advancesFor(db) });

  if (p === "/pools") {
    const owner = q.get("owner");
    if (owner && !ADDRESS.test(owner)) return bad("owner must be an address");
    return ok({
      deployed,
      pools: listPools(db, {
        ...(owner ? { owner } : {}),
        limit: clamp(q.get("limit"), 50, 200),
        offset: clamp(q.get("offset"), 0, 1_000_000),
      }),
    });
  }

  const pool = /^\/pools\/([^/]+)(?:\/(earnings|trades))?$/.exec(p);
  if (pool) {
    const id = pool[1] as string;
    if (!POOL_ID.test(id)) return bad("pool id must be 32 bytes of hex");
    const detail = getPool(db, id);
    if (!detail) return missing("No such pool");
    if (pool[2] === "earnings") return ok({ days: dailyEarnings(db, id, clamp(q.get("days"), 35, 365)) });
    if (pool[2] === "trades") return ok({ trades: poolTrades(db, id, clamp(q.get("limit"), 50, 200)) });
    return ok(detail);
  }

  return missing("Not found");
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export function startServer(db: Db, cfg: IndexerConfig, state: SyncState): Server {
  const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, CORS).end();
      return;
    }
    try {
      const { status, body } = route(db, cfg, state, new URL(req.url ?? "/", "http://localhost"));
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...CORS });
      res.end(JSON.stringify(body));
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ error: "Something went wrong" }));
    }
  });
  server.listen(cfg.port);
  return server;
}
