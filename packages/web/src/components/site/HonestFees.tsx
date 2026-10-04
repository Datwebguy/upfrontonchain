"use client";

import { Reveal } from "@/components/motion";
import { ButtonLink } from "@/components/ui";
import { formatUsdg, percent, timeAgo } from "@/lib/format";
import { useHonestFees, useRecentTrades } from "@/lib/queries";
import { receiptUrl } from "@/lib/network";

/**
 * The core promise, and the proof: the fee shown against the fee charged on recent Upfront swaps, read from chain
 * events. They always match. If there are no trades yet, it says so.
 */
export function HonestFees() {
  const trades = useRecentTrades(5);
  const totals = useHonestFees();
  const rows = trades.data?.trades ?? [];
  const loading = trades.isPending && !trades.isError;

  return (
    <section id="fees" className="scroll-mt-20 border-y border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <h2 className="max-w-3xl font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[48px]">
            No hidden cut. The fee is on screen before you trade.
          </h2>

          <div className="mt-10 rounded-3xl border border-line bg-bone p-5 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[18px] font-semibold">Recent trades: fee shown, fee charged</h3>
              {totals.data && totals.data.trades > 0 ? (
                <p className="num text-[15px] text-moss">
                  {totals.data.mismatches === 0 ? "All match" : `${totals.data.mismatches} differ`} · {totals.data.trades} trades
                </p>
              ) : null}
            </div>

            {loading ? (
              <div className="mt-6 space-y-3" aria-label="Loading recent trades">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-10 w-full" />
                ))}
              </div>
            ) : trades.isError ? (
              <p className="mt-6 text-graphite">Can&apos;t load the latest trades right now. Try again in a moment.</p>
            ) : rows.length === 0 ? (
              <div className="mt-6">
                <p className="text-graphite">No trades yet. When the first one lands, you&apos;ll see the fee shown next to the fee charged.</p>
                <ButtonLink href="/app/launch" variant="signal" className="mt-5">
                  Launch a pool
                </ButtonLink>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[15px]">
                  <thead className="text-graphite">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-medium">When</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Trade</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Fee shown</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Fee charged</th>
                      <th scope="col" className="py-2 text-right font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={`${t.tx}-${t.block}-${t.poolId}-${t.usdgAmount}`} className="border-t border-line">
                        <td className="py-3 pr-4 text-graphite">{timeAgo(t.time)}</td>
                        <td className="num py-3 pr-4 text-right">{formatUsdg(t.usdgAmount)}</td>
                        <td className="num py-3 pr-4 text-right">
                          {formatUsdg(t.quotedFee)} <span className="text-graphite">({percent(t.feeBps)})</span>
                        </td>
                        <td className="num py-3 pr-4 text-right font-medium">{formatUsdg(t.fee)}</td>
                        <td className="py-3 text-right">
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
          </div>
        </Reveal>
      </div>
    </section>
  );
}
