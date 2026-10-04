"use client";

import { useState } from "react";
import { links } from "@config/networks";
import { ButtonLink, Button } from "@/components/ui";
import { percent } from "@/lib/format";
import { Card } from "../common";
import type { LaunchState } from "./state";

/** The pool link, Copy link, Share on X with @upfrontonchain, and Go to my pool (DESIGN.md §4). */
export function Success({ poolId, state }: { poolId: string; state: LaunchState }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/app/trade/${poolId}`;
  const symbol = state.token?.symbol ?? "my token";
  const text = `I just launched a ${symbol} pool on @upfrontonchain. Every trade pays me. The fee is ${percent(state.feeBps)} and it's shown before every trade.`;
  const share = `${links.xShare}?${new URLSearchParams({ text, url }).toString()}`;

  return (
    <Card>
      <h2 className="font-display text-[28px] font-bold leading-tight">Your {symbol} pool is live</h2>
      <p className="mt-2 text-muted">Share this link so people can trade it.</p>
      <p className="num mt-4 break-all rounded-xl bg-fg/5 px-4 py-3 text-[14px]">{url}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={share} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-current px-5 py-3 text-[15px] font-semibold leading-none hover:bg-fg/5">
          Share on X
        </a>
        <ButtonLink href={`/app/pool/${poolId}`} variant="signal">
          Go to my pool
        </ButtonLink>
      </div>
    </Card>
  );
}
