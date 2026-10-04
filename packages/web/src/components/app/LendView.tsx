"use client";

import Link from "next/link";
import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useWriteContract } from "wagmi";
import { lenderVaultAbi } from "@config/abis";
import { contracts, useAllowance, useUsdgBalance, useVaultPosition } from "@/lib/contracts";
import { formatUsdg, parseUsdg } from "@/lib/format";
import { useLendAdvances, useLender } from "@/lib/queries";
import { network } from "@/lib/network";
import { useTx } from "@/lib/tx";
import { AmountInput } from "./AmountInput";
import { BigNumber, Card, Empty, NeedsWallet, PageTitle, TokenSymbol } from "./common";
import { Help } from "./Help";
import { TxButton } from "./TxButton";

export function LendView() {
  return (
    <>
      <PageTitle>Lend</PageTitle>
      <NeedsWallet what="lend">{(account) => <Connected account={account} />}</NeedsWallet>
      <Advances />
    </>
  );
}

function Connected({ account }: { account: Address }) {
  const position = useVaultPosition(account);
  const flows = useLender(account);
  const balance = useUsdgBalance(account);
  const allowance = useAllowance(network.usdg, account, contracts?.vault);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [text, setText] = useState("");
  const { writeContractAsync } = useWriteContract();
  const approve = useTx();
  const action = useTx();

  const value = position.value ?? 0n;
  const earned = flows.data ? value + BigInt(flows.data.withdrawn) - BigInt(flows.data.deposited) : undefined;
  const amount = parseUsdg(text);
  const free = position.maxWithdraw ?? 0n;
  const limit = mode === "deposit" ? balance.data : free;

  const tooMuch = amount !== undefined && limit !== undefined && amount > limit;
  const needsApproval = mode === "deposit" && amount !== undefined && (allowance.data ?? 0n) < amount;
  const valid = amount !== undefined && amount > 0n && !tooMuch;

  const done = () => {
    setText("");
    void Promise.all([position.refetch(), balance.refetch(), allowance.refetch(), flows.refetch()]);
  };

  return (
    <>
      <Card>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[14px] text-muted">Your deposit</p>
            <div className="mt-2">{position.value === undefined ? <span className="skeleton inline-block h-10 w-44" aria-label="Loading" /> : <BigNumber value={value} />}</div>
          </div>
          <div>
            <p className="text-[14px] text-muted">Earned so far</p>
            <div className="mt-2">
              {earned === undefined ? (
                <span className="skeleton inline-block h-10 w-44" aria-label="Loading" />
              ) : (
                <p className={`num text-[40px] font-medium leading-none ${earned < 0n ? "text-fg" : "text-positive"}`}>
                  {earned < 0n ? "-" : ""}
                  {formatUsdg(earned < 0n ? -earned : earned)} <span className="text-[16px] text-muted">USDG</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div role="group" aria-label="Deposit or withdraw" className="inline-flex rounded-full border border-border p-1">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setText("");
                action.reset();
              }}
              className={`rounded-full px-5 py-2 text-[14px] font-medium ${mode === m ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
            >
              {m === "deposit" ? "Deposit" : "Withdraw"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <AmountInput
            label={mode === "deposit" ? "Amount to deposit" : "Amount to withdraw"}
            value={text}
            onChange={setText}
            {...(limit !== undefined ? { max: formatUsdg(limit), onMax: () => setText(formatUsdgPlain(limit)) } : {})}
            {...(mode === "withdraw" && position.value !== undefined && free < value ? { hint: "Some of your deposit is out on advances. That part is free to withdraw as it's repaid." } : {})}
          />
        </div>
        {tooMuch ? <p className="mt-2 text-[14px] text-fg">{mode === "deposit" ? "Not enough USDG." : "That's more than is free to withdraw right now."}</p> : null}

        <div className="mt-4">
          {needsApproval && valid ? (
            <TxButton
              label="Approve USDG"
              state={approve.state}
              onClick={async () => {
                if (!contracts || amount === undefined) return;
                const receipt = await approve.run(() =>
                  writeContractAsync({ address: network.usdg, abi: erc20Abi, functionName: "approve", args: [contracts!.vault, amount] }),
                );
                if (receipt) void allowance.refetch();
              }}
            />
          ) : (
            <TxButton
              label={mode === "deposit" ? "Deposit" : "Withdraw"}
              state={action.state}
              disabled={!valid}
              onClick={async () => {
                if (!contracts || amount === undefined) return;
                const receipt = await action.run(() =>
                  mode === "deposit"
                    ? writeContractAsync({ address: contracts!.vault, abi: lenderVaultAbi, functionName: "deposit", args: [amount, account] })
                    : writeContractAsync({ address: contracts!.vault, abi: lenderVaultAbi, functionName: "withdraw", args: [amount, account, account] }),
                );
                if (receipt) done();
              }}
            />
          )}
        </div>

        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          Lending carries risk.
          <Help label="About the risk">
            Your USDG funds advances to pools. A pool&apos;s trading can slow or stop, so an advance can be repaid late or not in full. You can lose money.
          </Help>
        </p>
      </Card>
    </>
  );
}

/** "1234.5" for the input box: plain digits, no thousands separators. */
function formatUsdgPlain(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function Advances() {
  const advances = useLendAdvances();
  const rows = (advances.data?.advances ?? []).filter((a) => a.status === "open");

  return (
    <Card>
      <h2 className="text-[17px] font-semibold">Active advances</h2>
      {advances.isPending ? (
        <div className="skeleton mt-4 h-20 w-full" aria-label="Loading advances" />
      ) : advances.isError ? (
        <p className="mt-4 text-muted">Can&apos;t load advances right now. Try again in a moment.</p>
      ) : rows.length === 0 ? (
        <Empty title="No advances are out right now. Lenders' money earns as pools take offers." />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((a) => {
            const due = BigInt(a.totalDue);
            const pct = due === 0n ? 0 : Number((BigInt(a.repaid) * 10_000n) / due) / 100;
            return (
              <li key={`${a.poolId}-${a.acceptedAt}`} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/app/pool/${a.poolId}`} className="font-medium underline underline-offset-2">
                    <PoolToken poolId={a.poolId} />
                  </Link>
                  <span className="num text-[14px]">{formatUsdg(a.principal)} USDG</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label="Repaid so far"
                  className="mt-2 h-2 overflow-hidden rounded-full bg-border"
                >
                  <div className="h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                </div>
                <p className="num mt-1 text-[13px] text-muted">
                  {formatUsdg(a.repaid)} of {formatUsdg(a.totalDue)} repaid{a.behindSchedule ? " · behind schedule" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

import { usePool } from "@/lib/queries";
function PoolToken({ poolId }: { poolId: string }) {
  const pool = usePool(poolId);
  return <TokenSymbol token={pool.data?.token ?? null} />;
}
