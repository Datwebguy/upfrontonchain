"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { contracts } from "@/lib/contracts";
import { percent } from "@/lib/format";
import { usePool, usePools } from "@/lib/queries";
import { Card, Empty, NotLive, PageTitle, TokenSymbol } from "./common";

/** Every pool you can trade, newest first. */
export function TradeList() {
  const pools = usePools();
  if (!contracts) return (<><PageTitle>Trade</PageTitle><NotLive /></>);
  const rows = pools.data?.pools ?? [];
  return (
    <>
      <PageTitle>Trade</PageTitle>
      <Card>
        {pools.isPending ? (
          <div className="skeleton h-20 w-full" aria-label="Loading pools" />
        ) : pools.isError ? (
          <p className="text-muted">Can&apos;t load pools right now. Try again in a moment.</p>
        ) : rows.length === 0 ? (
          <Empty title="No pools yet. Be the first to launch one." action={{ label: "Launch a pool", href: "/app/launch" }} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/app/trade/${p.id}`} className="flex items-center justify-between gap-3 rounded-lg py-4 hover:bg-fg/5">
                  <span className="font-medium">
                    <TokenSymbol token={p.token} /> <span className="text-muted">/ USDG</span>
                  </span>
                  <span className="text-[14px] text-muted">Fee {percent(p.upfrontFeeBps)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** One pool's trade page. Swapping from here isn't built yet, and the screen says so. */
export function TradeView({ id }: { id: string }) {
  const pool = usePool(id);
  if (!contracts) return (<><PageTitle>Trade</PageTitle><NotLive /></>);
  return (
    <>
      <PageTitle>{pool.data ? <><TokenSymbol token={pool.data.token} /> <span className="text-muted">/ USDG</span></> : "Trade"}</PageTitle>
      <Card>
        {pool.data ? <p>Fee {percent(pool.data.upfrontFeeBps)} on every trade, shown before you confirm.</p> : null}
        <p className="mt-2 text-muted">Swapping from this screen isn&apos;t ready yet.</p>
        <ButtonLink href={`/app/pool/${id}`} variant="ink" className="mt-4">
          View the pool
        </ButtonLink>
      </Card>
    </>
  );
}
