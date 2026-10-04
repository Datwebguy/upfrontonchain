"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { Button } from "@/components/ui";
import { network } from "@/lib/network";
import type { TokenOption } from "@/lib/tokens";
import { TokenMark, useTokenInfo } from "../common";

async function fetchTokens(q: string): Promise<TokenOption[]> {
  const res = await fetch(`/api/tokens?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("tokens");
  return ((await res.json()) as { tokens: TokenOption[] }).tokens;
}

/** Step 1: pick the token. The list is read live. The pair is always USDG, shown as a fixed chip. */
export function TokenStep({ token, onPick, onNext }: { token?: TokenOption | undefined; onPick: (t: TokenOption) => void; onNext: () => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const list = useQuery({ queryKey: ["tokens", q], queryFn: () => fetchTokens(q), staleTime: 60_000 });
  const pasted = isAddress(text.trim()) ? (text.trim() as Address) : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-border px-3 py-1.5 text-[13px] font-medium">Paired with USDG</span>
      </div>

      <div>
        <label htmlFor="token-search" className="text-[14px] font-medium">
          Token
        </label>
        <input
          id="token-search"
          type="search"
          placeholder="Search by name or symbol, or paste an address"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          className="mt-2 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-[15px] outline-none focus:border-fg"
        />
      </div>

      {pasted ? <PastedToken address={pasted} selected={token?.address.toLowerCase() === pasted.toLowerCase()} onPick={onPick} /> : null}

      <div role="radiogroup" aria-label="Tokens" className="max-h-80 divide-y divide-border overflow-y-auto rounded-2xl border border-border">
        {list.isPending ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="skeleton m-3 h-10" aria-label="Loading tokens" />)
        ) : list.isError ? (
          <p className="p-4 text-muted">Can&apos;t load the token list right now. You can paste a token address instead.</p>
        ) : list.data.length === 0 ? (
          <p className="p-4 text-muted">{network.explorerApiUrl === null && q === "" ? "Paste a token address to get started." : "No tokens match. Try another name, or paste an address."}</p>
        ) : (
          list.data.map((t) => {
            const selected = token?.address.toLowerCase() === t.address.toLowerCase();
            return (
              <button
                key={t.address}
                role="radio"
                aria-checked={selected}
                onClick={() => onPick(t)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fg/5 ${selected ? "bg-fg/5" : ""}`}
              >
                <TokenMark symbol={t.symbol} logo={t.logo} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.symbol}</span>
                  <span className="block truncate text-[13px] text-muted">{t.name}</span>
                </span>
                {t.verified ? <span className="rounded-full bg-sky px-2 py-0.5 text-[12px] font-medium text-ink">Listed</span> : null}
                <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-fg bg-fg text-bg" : "border-border"}`}>
                  {selected ? "✓" : ""}
                </span>
              </button>
            );
          })
        )}
      </div>

      <Button variant="signal" disabled={!token} onClick={onNext}>
        Continue
      </Button>
    </div>
  );
}

/** A token pasted by address, described by the token itself. */
function PastedToken({ address, selected, onPick }: { address: Address; selected: boolean; onPick: (t: TokenOption) => void }) {
  const info = useTokenInfo(address);
  if (address.toLowerCase() === network.usdg.toLowerCase()) return <p className="text-[14px] text-muted">USDG is always the other side of the pool.</p>;
  if (info.symbol === undefined || info.decimals === undefined) return <p className="text-[14px] text-muted">Looking up that address…</p>;
  const option: TokenOption = { address, symbol: info.symbol, name: info.name ?? info.symbol, decimals: info.decimals, logo: null, multiplier: "1", verified: false };
  return (
    <button
      onClick={() => onPick(option)}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left hover:bg-fg/5 ${selected ? "border-fg" : "border-border"}`}
    >
      <TokenMark symbol={option.symbol} />
      <span className="flex-1">
        <span className="block font-semibold">{option.symbol}</span>
        <span className="block text-[13px] text-muted">{option.name}</span>
      </span>
      <span className="text-[13px] font-medium text-accent">{selected ? "Selected" : "Use this token"}</span>
    </button>
  );
}
