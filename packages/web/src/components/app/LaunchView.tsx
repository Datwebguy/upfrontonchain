"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { useMaxFee, useProtocolShare } from "@/lib/contracts";
import { Card, NeedsWallet, PageTitle } from "./common";
import { FeeStep } from "./launch/FeeStep";
import { FundsStep } from "./launch/FundsStep";
import { Success } from "./launch/Success";
import { TokenStep } from "./launch/TokenStep";
import { initialState, type LaunchState } from "./launch/state";

const STEPS = ["Token", "Fee and split", "Add funds"] as const;

/** Launch in three steps: token, then fee and split, then add funds (DESIGN.md §4). Progress dots at the top. */
export function LaunchView() {
  return (
    <>
      <PageTitle>Launch a pool</PageTitle>
      <NeedsWallet what="launch a pool">{() => <Steps />}</NeedsWallet>
    </>
  );
}

function Steps() {
  const { address } = useAccount();
  const protocol = useProtocolShare();
  const maxFee = useMaxFee();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [state, setState] = useState<LaunchState | undefined>();
  const [poolId, setPoolId] = useState<Hex | undefined>();

  if (protocol.data === undefined || maxFee.data === undefined || !address) {
    return <div className="skeleton h-72 w-full" aria-label="Loading" />;
  }
  const protocolBps = Number(protocol.data);
  const s = state ?? initialState(protocolBps);
  const patch = (p: Partial<LaunchState>) => setState({ ...s, ...p });

  if (poolId) return <Success poolId={poolId} state={s} />;

  return (
    <Card>
      <ol className="mb-6 flex items-center gap-3" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold ${i <= step ? "bg-signal text-ink" : "border border-border text-muted"}`}
            >
              {i + 1}
            </span>
            <span className={i === step ? "font-semibold" : "hidden text-muted sm:inline"}>{label}</span>
            {i < STEPS.length - 1 ? <span aria-hidden="true" className="mx-1 hidden h-px w-6 bg-border sm:block" /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? <TokenStep token={s.token} onPick={(token) => patch({ token })} onNext={() => setStep(1)} /> : null}
      {step === 1 ? (
        <FeeStep state={s} maxFeeBps={Number(maxFee.data)} protocolBps={protocolBps} onChange={patch} onBack={() => setStep(0)} onNext={() => setStep(2)} />
      ) : null}
      {step === 2 && s.token ? (
        <FundsStep state={s} account={address} onChange={patch} onBack={() => setStep(1)} onLaunched={setPoolId} />
      ) : null}
    </Card>
  );
}
