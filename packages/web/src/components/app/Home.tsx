"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { formatUsdg, percent } from "@/lib/format";
import { usePools } from "@/lib/queries";
import { Card, Empty, NeedsWallet, PageTitle, TokenSymbol } from "./common";
import { ClaimPanel } from "./Claim";

/** Your pools, your earnings, quick actions (DESIGN.md §4). */
export function Home() {
  return (
    <>
      <PageTitle>Home</PageTitle>
      <NeedsWallet>{(account) => <Connected account={account} />}</NeedsWallet>
    </>
  );
}

function Connected({ account }: { account: `0x${string}` }) {
  const pools = usePools(account);
  const rows = pools.data?.pools ?? [];

  return (
    <>
      <Card>
        <ClaimPanel account={account} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">Your pools</h2>
          <ButtonLink href="/app/launch" variant="signal" className="!px-4 !py-2.5">
            Launch pool
          </ButtonLink>
        </div>
        {pools.isPending ? (
          <div className="mt-4 space-y-3" aria-label="Loading your pools">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : pools.isError ? (
          <p className="mt-4 text-muted">Can&apos;t load your pools right now. Try again in a moment.</p>
        ) : rows.length === 0 ? (
          <Empty title="You haven't launched a pool yet." action={{ label: "Launch a pool", href: "/app/launch" }} />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/app/pool/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg py-4 hover:bg-fg/5">
                  <span className="font-medium">
                    <TokenSymbol token={p.token} /> <span className="text-muted">/ USDG</span>
                  </span>
                  <span className="flex items-center gap-6 text-[14px]">
                    <span className="text-muted">Fee {percent(p.upfrontFeeBps)}</span>
                    <span className="num">{formatUsdg(p.ownerEarned)} USDG earned</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <ButtonLink href="/app/trade" variant="outline">
          Trade
        </ButtonLink>
        <ButtonLink href="/app/lend" variant="outline">
          Lend
        </ButtonLink>
      </div>
    </>
  );
}
