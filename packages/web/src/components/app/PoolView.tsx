"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { ButtonLink } from "@/components/ui";
import { contracts, useChainDay, usePoolOnchain } from "@/lib/contracts";
import { formatUsdg, percent, timeAgo } from "@/lib/format";
import { NotFound } from "@/lib/indexer";
import { receiptUrl } from "@/lib/network";
import { useEarnings, usePool, usePoolTrades } from "@/lib/queries";
import { BigNumber, Card, Empty, NotLive, PageTitle, TokenSymbol } from "./common";
import { ClaimPanel } from "./Claim";
import { EarningsChart } from "./EarningsChart";
import { Help } from "./Help";
import { LowerFee } from "./LowerFee";
import { UpfrontCard } from "./UpfrontCard";

export function PoolView({ id }: { id: string }) {
  const pool = usePool(id);
  const earnings = useEarnings(id);
  const trades = usePoolTrades(id);
  const onchain = usePoolOnchain(id as Hex);
  const today = useChainDay();
  const { address } = useAccount();

  if (!contracts) return <NotLive />;

  if (pool.isPending) {
    return (
      <>
        <div className="skeleton h-9 w-56" aria-label="Loading the pool" />
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-40 w-full" />
      </>
    );
  }
  if (pool.isError) {
    return pool.error instanceof NotFound ? (
      <Card>
        <Empty title="We can't find that pool." action={{ label: "Back to home", href: "/app" }} />
      </Card>
    ) : (
      <Card>
        <p className="text-muted">Can&apos;t load this pool right now. Try again in a moment.</p>
      </Card>
    );
  }

  const p = pool.data;
  const isOwner = address?.toLowerCase() === p.owner.toLowerCase();
  const rows = trades.data?.trades ?? [];
  const s = p.shares;

  return (
    <>
      <PageTitle
        aside={
          <ButtonLink href={`/app/trade/${p.id}`} variant="signal" className="!px-4 !py-2.5">
            Trade
          </ButtonLink>
        }
      >
        <TokenSymbol token={p.token} /> <span className="text-muted">/ USDG</span>
      </PageTitle>

      <Card>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[14px] text-muted">Earned by this pool</p>
            <div className="mt-2">
              <BigNumber value={p.ownerEarned} />
            </div>
            <p className="mt-3 text-[14px] text-muted">
              Fee {percent(p.upfrontFeeBps)} · {p.trades} {p.trades === 1 ? "trade" : "trades"}
            </p>
            <p className="mt-1 flex items-center gap-2 text-[14px] text-muted">
              You {percent(s.ownerBps)} · App {percent(s.appBps)} · Referrer {percent(s.referrerBps)} · Upfront {percent(s.protocolBps)}
              <Help>The split of every fee is fixed when the pool launches. With no referrer, their share goes to the owner.</Help>
            </p>
          </div>
          {address ? <ClaimPanel account={address} /> : null}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          {earnings.isPending || today === undefined ? (
            <div className="skeleton h-40 w-full" aria-label="Loading the chart" />
          ) : earnings.isError ? (
            <p className="text-muted">Can&apos;t load the chart right now.</p>
          ) : earnings.data.days.length === 0 ? (
            <Empty title="No trades yet. Earnings appear here as trades land." action={{ label: "Trade this pool", href: `/app/trade/${p.id}` }} />
          ) : (
            <EarningsChart days={earnings.data.days} today={today} />
          )}
        </div>
      </Card>

      <UpfrontCard poolId={p.id as Hex} owner={p.owner} />

      <Card>
        <h2 className="text-[17px] font-semibold">Recent trades</h2>
        {trades.isPending ? (
          <div className="skeleton mt-4 h-24 w-full" aria-label="Loading trades" />
        ) : rows.length === 0 ? (
          <Empty title="No trades yet." action={{ label: "Make the first trade", href: `/app/trade/${p.id}` }} />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[14px]">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-2 font-medium">When</th>
                  <th scope="col" className="py-2 text-right font-medium">Size</th>
                  <th scope="col" className="py-2 text-right font-medium">Fee</th>
                  <th scope="col" className="py-2 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={`${t.tx}-${t.block}-${t.usdgAmount}-${t.fee}`} className="border-t border-border">
                    <td className="py-2.5 text-muted">{timeAgo(t.time)}</td>
                    <td className="num py-2.5 text-right">{formatUsdg(t.usdgAmount)}</td>
                    <td className="num py-2.5 text-right">{formatUsdg(t.fee)}</td>
                    <td className="py-2.5 text-right">
                      <a href={receiptUrl(t.tx)} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                        Receipt
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isOwner && onchain.config ? (
        <Card>
          <h2 className="text-[17px] font-semibold">Pool settings</h2>
          <div className="mt-4">
            <LowerFee poolId={p.id as Hex} currentBps={onchain.config.upfrontFeeBps} onDone={() => void Promise.all([onchain.refetch(), pool.refetch()])} />
          </div>
        </Card>
      ) : null}

      <p className="text-[13px] text-muted">
        <Link href="/app" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </>
  );
}
