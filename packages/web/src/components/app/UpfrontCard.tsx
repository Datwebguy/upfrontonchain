"use client";

import { motion, useReducedMotion } from "motion/react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { toFunctionSelector, type Hex } from "viem";
import { advanceDeskAbi } from "@config/abis";
import { contracts, useChainDay, useDeskRules, useOffer, usePoolOnchain } from "@/lib/contracts";
import { formatUsdg, percent } from "@/lib/format";
import { useEarnings } from "@/lib/queries";
import { useTx } from "@/lib/tx";
import { Card } from "./common";
import { TxButton } from "./TxButton";

/** A ring that fills as a pool gets closer to its first offer. */
function Ring({ progress }: { progress: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${Math.round(progress * 100)}% of the way to an offer`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="47" textAnchor="middle" fontSize="16" className="num" fill="var(--fg)">
        {Math.round(progress * 100)}%
      </text>
    </svg>
  );
}

/** The repayment bar. It fills smoothly, and at 100% turns from Signal to Moss with one short pulse. */
function RepayBar({ repaid, due }: { repaid: bigint; due: bigint }) {
  const reduce = useReducedMotion();
  const pct = due === 0n ? 0 : Number((repaid * 10_000n) / due) / 100;
  const done = repaid >= due && due > 0n;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Repaid so far"
      className="h-3 w-full overflow-hidden rounded-full bg-border"
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: done ? "var(--positive)" : "var(--signal)" }}
        initial={false}
        animate={reduce ? { width: `${pct}%` } : { width: `${pct}%`, scale: done ? [1, 1.04, 1] : 1 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

/** Why the desk says no, in words. The desk returns the selector of one of its own errors. */
const NO_OFFER_REASON: Record<string, string> = {
  [toFunctionSelector("AdvancesPaused()")]: "New offers are paused for now. Your earnings and claims are not affected.",
  [toFunctionSelector("VaultLiquidityLow()")]: "The lender vault doesn't have enough free right now. Check back soon.",
  [toFunctionSelector("SettleFirst()")]: "The last repayment needs to be sent first.",
};

/** The weakest of the last four complete periods, worked out from the pool's daily earnings, as the contract does. */
function weakestPeriod(byDay: Map<number, bigint>, periodDays: number, today: number): bigint {
  let weakest: bigint | undefined;
  for (let p = 0; p < 4; p++) {
    let sum = 0n;
    for (let d = 1; d <= periodDays; d++) sum += byDay.get(today - (p * periodDays + d)) ?? 0n;
    if (weakest === undefined || sum < weakest) weakest = sum;
  }
  return weakest ?? 0n;
}

/**
 * The Upfront card (DESIGN.md §4 "Pool"): before eligibility a ring with what is still needed; when eligible the
 * offer and an Accept button; during repayment a progress bar with the amount left.
 */
export function UpfrontCard({ poolId, owner }: { poolId: Hex; owner: string }) {
  const today = useChainDay();
  const { address } = useAccount();
  const isOwner = address?.toLowerCase() === owner.toLowerCase();
  const offer = useOffer(poolId);
  const onchain = usePoolOnchain(poolId);
  const rules = useDeskRules();
  const earnings = useEarnings(poolId);
  const { writeContractAsync } = useWriteContract();
  const accept = useTx();
  const settle = useTx();

  const record = useReadContract({
    address: contracts?.desk,
    abi: advanceDeskAbi,
    functionName: "recordOf",
    args: [poolId],
    query: { enabled: !!contracts, refetchInterval: 8_000 },
  });

  const adv = onchain.advance;
  const o = offer.data;

  if (!adv || !o || today === undefined) {
    return (
      <Card>
        <div className="skeleton h-24 w-full" aria-label="Loading your Upfront offer" />
      </Card>
    );
  }

  // During repayment.
  if (adv.open) {
    const left = adv.totalDue - adv.repaid;
    const unsettled = record.data ? adv.repaid > record.data.settled : false;
    return (
      <Card>
        <h2 className="text-[17px] font-semibold">Your Upfront</h2>
        <p className="mt-1 text-muted">Repaid from {percent(adv.repayShareBps)} of your fees.</p>
        <div className="mt-5 space-y-3">
          <RepayBar repaid={adv.repaid} due={adv.totalDue} />
          <p className="num flex flex-wrap justify-between gap-2 text-[14px]">
            <span>{formatUsdg(adv.repaid)} repaid</span>
            <span className="text-muted">{formatUsdg(left)} USDG left</span>
          </p>
          {adv.repayShareBps === 10_000 ? <p className="text-[14px] text-accent">Behind schedule: all of your fees go to repayment until it&apos;s caught up.</p> : null}
        </div>
        {unsettled ? (
          <TxButton
            className="mt-4"
            variant="ink"
            label="Send repayment to lenders"
            state={settle.state}
            onClick={async () => {
              if (!contracts) return;
              const receipt = await settle.run(() => writeContractAsync({ address: contracts!.desk, abi: advanceDeskAbi, functionName: "settle", args: [poolId] }));
              if (receipt) void Promise.all([record.refetch(), onchain.refetch()]);
            }}
          />
        ) : null}
      </Card>
    );
  }

  // Eligible: show the offer.
  if (o.eligible) {
    return (
      <Card>
        <h2 className="text-[17px] font-semibold">Your Upfront offer</h2>
        <p className="num mt-3 text-[40px] font-medium leading-none">
          {formatUsdg(o.amount)} <span className="text-[16px] text-muted">USDG</span>
        </p>
        <p className="mt-3 text-muted">
          Repaid from {percent(o.repayShareBps)} of your fees. You pay back <span className="num text-fg">{formatUsdg(o.totalDue)} USDG</span>.
        </p>
        {isOwner ? (
          <TxButton
            className="mt-5"
            label={`Get ${formatUsdg(o.amount)} USDG now`}
            state={accept.state}
            onClick={async () => {
              if (!contracts) return;
              const receipt = await accept.run(() =>
                writeContractAsync({ address: contracts!.desk, abi: advanceDeskAbi, functionName: "acceptOffer", args: [poolId, o.amount, o.flatFeeBps] }),
              );
              if (receipt) void Promise.all([offer.refetch(), onchain.refetch(), record.refetch()]);
            }}
          />
        ) : (
          <p className="mt-4 text-[14px] text-muted">Only the pool&apos;s owner can accept this offer.</p>
        )}
      </Card>
    );
  }

  // Not eligible yet: a ring and what is still needed.
  const byDay = new Map((earnings.data?.days ?? []).map((d) => [d.day, BigInt(d.ownerEarned)]));
  const periodDays = Number(rules.periodDays ?? 1);
  const needDays = Number(rules.minHistoryDays ?? 0);
  const needEarned = rules.minPeriodEarnings ?? 0n;
  const registeredDay = onchain.state?.registeredDay ?? 0;
  const age = Math.max(0, today - registeredDay);
  const weakest = weakestPeriod(byDay, periodDays, today);

  const historyProgress = needDays === 0 ? 1 : Math.min(1, age / needDays);
  const earningsProgress = needEarned === 0n ? 1 : Math.min(1, Number((weakest * 10_000n) / needEarned) / 10_000);
  const progress = (historyProgress + earningsProgress) / 2;
  const moreDays = Math.max(0, needDays - age);
  const moreEarned = needEarned > weakest ? needEarned - weakest : 0n;
  const unit = periodDays === 1 ? "day" : "week";

  return (
    <Card>
      <h2 className="text-[17px] font-semibold">Your Upfront offer</h2>
      <div className="mt-4 flex items-center gap-5">
        <Ring progress={progress} />
        <div className="space-y-1 text-[14px]">
          {moreDays > 0 ? <p>{moreDays} more {moreDays === 1 ? "day" : "days"} of trading</p> : null}
          {moreEarned > 0n ? (
            <p className="num">
              {formatUsdg(moreEarned)} USDG more in your weakest {unit}
            </p>
          ) : null}
          {moreDays === 0 && moreEarned === 0n ? <p className="text-muted">{NO_OFFER_REASON[o.reason] ?? "No offer yet. Check back soon."}</p> : null}
        </div>
      </div>
    </Card>
  );
}
