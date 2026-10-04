"use client";

import { useQuery } from "@tanstack/react-query";
import { indexer } from "./indexer";

/** How often live numbers refresh. Slow enough to be kind to the indexer, fast enough to feel alive. */
const LIVE = 8_000;

export const useTotals = () => useQuery({ queryKey: ["totals"], queryFn: indexer.totals, refetchInterval: LIVE });
export const useHonestFees = () => useQuery({ queryKey: ["honest-fees"], queryFn: indexer.honestFees, refetchInterval: LIVE });
export const useRecentTrades = (limit = 20, interval: number | false = LIVE) =>
  useQuery({ queryKey: ["recent-trades", limit], queryFn: () => indexer.recentTrades(limit), refetchInterval: interval });
export const usePools = (owner?: string) =>
  useQuery({ queryKey: ["pools", owner ?? "all"], queryFn: () => indexer.pools(owner), refetchInterval: LIVE });
export const usePool = (id: string) => useQuery({ queryKey: ["pool", id], queryFn: () => indexer.pool(id), refetchInterval: LIVE, retry: false });
export const useEarnings = (id: string) => useQuery({ queryKey: ["earnings", id], queryFn: () => indexer.earnings(id), refetchInterval: LIVE });
export const usePoolTrades = (id: string) => useQuery({ queryKey: ["pool-trades", id], queryFn: () => indexer.trades(id), refetchInterval: LIVE });
export const useLendSummary = () => useQuery({ queryKey: ["lend-summary"], queryFn: indexer.lendSummary, refetchInterval: LIVE });
export const useLendAdvances = () => useQuery({ queryKey: ["lend-advances"], queryFn: indexer.lendAdvances, refetchInterval: LIVE });
export const useLender = (address?: string) =>
  useQuery({ queryKey: ["lender", address], queryFn: () => indexer.lender(address!), enabled: !!address, refetchInterval: LIVE });
