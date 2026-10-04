"use client";

import { isAddress } from "viem";
import { Button } from "@/components/ui";
import { formatUsdg, percent } from "@/lib/format";
import { Help } from "../Help";
import { SplitBar } from "./SplitBar";
import { BPS, type LaunchState } from "./state";

const PRESETS = [25, 50, 100] as const;

/** The most a trader could pay on a $1,000 trade, to show the owner what a share means. */
const EXAMPLE_TRADE = 1_000n * 1_000_000n; // 1,000 USDG

/** Step 2: the fee and the split, with a live preview of what the owner earns. */
export function FeeStep({
  state,
  maxFeeBps,
  protocolBps,
  onChange,
  onBack,
  onNext,
}: {
  state: LaunchState;
  maxFeeBps: number;
  protocolBps: number;
  onChange: (patch: Partial<LaunchState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fee = (EXAMPLE_TRADE * BigInt(state.feeBps)) / BigInt(BPS);
  // Rounds down, like the contract: the owner's share of the fee on a 1,000 USDG trade.
  const youEarn = (fee * BigInt(state.ownerBps)) / BigInt(BPS);

  const appNeedsAddress = state.appBps > 0;
  const appOk = !appNeedsAddress || isAddress(state.app.trim());

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="fee" className="flex items-center gap-2 text-[14px] font-medium">
            Fee on every trade
            <Help>Traders pay this on top of the pool&apos;s own 0.30% fee, and see the total before they confirm. You can lower it later, never raise it.</Help>
          </label>
          <span className="num text-[22px] font-medium">{percent(state.feeBps)}</span>
        </div>
        <input
          id="fee"
          type="range"
          min={0}
          max={maxFeeBps}
          step={5}
          value={state.feeBps}
          onChange={(e) => onChange({ feeBps: Number(e.target.value) })}
          className="mt-3 w-full accent-[var(--signal)]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.filter((p) => p <= maxFeeBps).map((p) => (
            <button
              key={p}
              aria-pressed={state.feeBps === p}
              onClick={() => onChange({ feeBps: p })}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${state.feeBps === p ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"}`}
            >
              {percent(p)}
            </button>
          ))}
          <button
            aria-pressed={state.feeBps === maxFeeBps}
            onClick={() => onChange({ feeBps: maxFeeBps })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${state.feeBps === maxFeeBps ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"}`}
          >
            Max {percent(maxFeeBps)}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-2 text-[14px] font-medium">
          Split
          <Help>Referrer = whoever sends the trade. No referrer? That share is yours.</Help>
        </p>
        <SplitBar
          ownerBps={state.ownerBps}
          appBps={state.appBps}
          referrerBps={state.referrerBps}
          protocolBps={protocolBps}
          onChange={(next) => onChange(next)}
        />
      </div>

      {appNeedsAddress ? (
        <div>
          <label htmlFor="app" className="text-[14px] font-medium">
            App address
          </label>
          <input
            id="app"
            placeholder="0x…"
            value={state.app}
            onChange={(e) => onChange({ app: e.target.value })}
            autoComplete="off"
            aria-invalid={!appOk}
            className="num mt-2 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-[15px] outline-none focus:border-fg"
          />
          {!appOk ? <p className="mt-1 text-[13px]">Add the app&apos;s address, or give the app a 0% share.</p> : null}
        </div>
      ) : null}

      <p className="rounded-2xl bg-fg/5 px-4 py-3 text-[15px]">
        On a $1,000 trade, you earn <span className="num font-semibold text-accent">${formatUsdg(youEarn)}</span>
        {state.referrerBps > 0 ? <span className="text-muted"> (more when there is no referrer)</span> : null}.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button variant="signal" disabled={!appOk || state.feeBps <= 0} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
