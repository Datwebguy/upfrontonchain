"use client";

import { erc20Abi } from "viem";
import { useBalance, useBlock, useReadContract } from "wagmi";
import type { Address, Hex } from "viem";
import { advanceDeskAbi, lenderVaultAbi, upfrontHookAbi, upfrontLauncherAbi } from "@config/abis";
import { deployment, network } from "./network";

/**
 * Typed reads of Upfront's contracts, from the generated ABIs. Every hook is switched off until Upfront is deployed
 * on this network, and the screens say so instead of showing made-up numbers.
 */

export const contracts = deployment
  ? { hook: deployment.hook, launcher: deployment.launcher, desk: deployment.advanceDesk, vault: deployment.lenderVault }
  : null;

const LIVE = { refetchInterval: 8_000 } as const;

export function useClaimable(account?: Address) {
  return useReadContract({
    address: contracts?.hook,
    abi: upfrontHookAbi,
    functionName: "claimable",
    args: account ? [account] : undefined,
    query: { enabled: !!contracts && !!account, ...LIVE },
  });
}

export function useOffer(poolId?: Hex) {
  return useReadContract({
    address: contracts?.desk,
    abi: advanceDeskAbi,
    functionName: "getOffer",
    args: poolId ? [poolId] : undefined,
    query: { enabled: !!contracts && !!poolId, ...LIVE },
  });
}

export function useDeskRules() {
  const base = { address: contracts?.desk, abi: advanceDeskAbi, query: { enabled: !!contracts } } as const;
  const minHistoryDays = useReadContract({ ...base, functionName: "minHistoryDays" });
  const minPeriodEarnings = useReadContract({ ...base, functionName: "minPeriodEarnings" });
  const periodDays = useReadContract({ ...base, functionName: "periodDays" });
  return { minHistoryDays: minHistoryDays.data, minPeriodEarnings: minPeriodEarnings.data, periodDays: periodDays.data };
}

export function usePoolOnchain(poolId?: Hex) {
  const base = { address: contracts?.hook, abi: upfrontHookAbi, query: { enabled: !!contracts && !!poolId, ...LIVE } } as const;
  const config = useReadContract({ ...base, functionName: "poolConfig", args: poolId ? [poolId] : undefined });
  const advance = useReadContract({ ...base, functionName: "advanceOf", args: poolId ? [poolId] : undefined });
  const state = useReadContract({ ...base, functionName: "poolState", args: poolId ? [poolId] : undefined });
  return { config: config.data, advance: advance.data, state: state.data, refetch: () => Promise.all([config.refetch(), advance.refetch(), state.refetch()]) };
}

export function useMaxFee() {
  return useReadContract({ address: contracts?.hook, abi: upfrontHookAbi, functionName: "MAX_UPFRONT_FEE_BPS", query: { enabled: !!contracts } });
}

export function useProtocolShare() {
  return useReadContract({ address: contracts?.launcher, abi: upfrontLauncherAbi, functionName: "protocolShareBps", query: { enabled: !!contracts } });
}

export function useVaultPosition(account?: Address) {
  const base = { address: contracts?.vault, abi: lenderVaultAbi, query: { enabled: !!contracts && !!account, ...LIVE } } as const;
  const shares = useReadContract({ ...base, functionName: "balanceOf", args: account ? [account] : undefined });
  const value = useReadContract({ ...base, functionName: "convertToAssets", args: shares.data !== undefined ? [shares.data] : undefined, query: { ...base.query, enabled: !!contracts && shares.data !== undefined } });
  const maxWithdraw = useReadContract({ ...base, functionName: "maxWithdraw", args: account ? [account] : undefined });
  return { shares: shares.data, value: value.data, maxWithdraw: maxWithdraw.data, refetch: () => Promise.all([shares.refetch(), value.refetch(), maxWithdraw.refetch()]) };
}

/** The person's USDG, read live. USDG has 6 decimals. */
export function useUsdgBalance(account?: Address) {
  return useReadContract({
    address: network.usdg,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, refetchInterval: 8_000 },
  });
}

export function useEthBalance(account?: Address) {
  return useBalance({ address: account, query: { enabled: !!account, refetchInterval: 8_000 } });
}

/** How much of a token the contract is allowed to move for the person. */
export function useAllowance(token: Address, owner?: Address, spender?: Address) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!owner && !!spender, refetchInterval: 4_000 },
  });
}

/**
 * Today, by the chain's clock: the day number the contracts use (block time / 1 day). Not the browser's clock, which
 * can be wrong and, on a test network or a fork, is not the time the contracts see.
 */
export function useChainDay(): number | undefined {
  const block = useBlock({ query: { refetchInterval: 15_000 } });
  return block.data ? Math.floor(Number(block.data.timestamp) / 86_400) : undefined;
}
