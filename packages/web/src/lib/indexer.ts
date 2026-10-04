import { indexerUrl } from "./network";

/** Amounts are USDG in its smallest unit (6 decimals), as decimal text. See packages/indexer/src/queries.ts. */

export interface Totals {
  deployed: boolean;
  feesPaidToOwners: string;
  paidUpfront: string;
  repaid: string;
  trades: number;
  volume: string;
  advances: number;
  pools: number;
}

export interface Split {
  owner: string;
  app: string;
  referrer: string;
  protocol: string;
  repay: string;
}

export interface Trade {
  block: number;
  time: number;
  tx: string;
  poolId: string;
  trader: string;
  referrer: string;
  usdgAmount: string;
  fee: string;
  quotedFee: string;
  feeBps: number;
  split: Split;
}

export type AdvanceStatus = "open" | "repaid" | "written_off" | "closed";

export interface Advance {
  poolId: string;
  owner: string;
  acceptedAt: number;
  principal: string;
  totalDue: string;
  flatFeeBps: number;
  repayShareBps: number;
  behindAt: number;
  repaid: string;
  settled: string;
  behindSchedule: boolean;
  status: AdvanceStatus;
}

export interface Pool {
  id: string;
  owner: string;
  app: string;
  token: string | null;
  tradingFee: number | null;
  tickSpacing: number | null;
  upfrontFeeBps: number;
  maxFeeBps: number;
  shares: { ownerBps: number; appBps: number; referrerBps: number; protocolBps: number };
  version: number | null;
  createdAt: number;
  createdTx: string;
  trades: number;
  volume: string;
  fees: string;
  ownerEarned: string;
}

export interface PoolDetail extends Pool {
  advance: Advance | null;
}

export interface DayEarnings {
  day: number;
  ownerEarned: string;
  trades: number;
}

export interface LendSummary {
  deployed: boolean;
  deposited: string;
  withdrawn: string;
  paidUpfront: string;
  repaid: string;
  writtenOff: string;
  openAdvances: number;
  advances: number;
}

export interface HonestFees {
  deployed: boolean;
  trades: number;
  quoted: string;
  charged: string;
  mismatches: number;
}

export interface Health {
  network: string;
  chainId: number;
  deployed: boolean;
  head: number | null;
  indexed: number | null;
  behind: number | null;
}

/** The indexer can't be reached, or it answered with an error. The app shows a plain message and a retry. */
export class IndexerError extends Error {}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${indexerUrl}${path}`, { cache: "no-store" });
  } catch {
    throw new IndexerError("Can't load the latest numbers right now.");
  }
  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new IndexerError("Can't load the latest numbers right now.");
  return (await res.json()) as T;
}

export class NotFound extends Error {}

export const indexer = {
  health: () => get<Health>("/health"),
  totals: () => get<Totals>("/totals"),
  honestFees: () => get<HonestFees>("/honest-fees"),
  recentTrades: (limit = 20) => get<{ deployed: boolean; trades: Trade[] }>(`/trades/recent?limit=${limit}`),
  pools: (owner?: string) =>
    get<{ deployed: boolean; pools: Pool[] }>(`/pools${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`),
  pool: (id: string) => get<PoolDetail>(`/pools/${id}`),
  earnings: (id: string, days = 35) => get<{ days: DayEarnings[] }>(`/pools/${id}/earnings?days=${days}`),
  trades: (id: string, limit = 20) => get<{ trades: Trade[] }>(`/pools/${id}/trades?limit=${limit}`),
  lendSummary: () => get<LendSummary>("/lend/summary"),
  lendAdvances: () => get<{ deployed: boolean; advances: Advance[] }>("/lend/advances"),
};
