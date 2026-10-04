"use client";

import { formatUsdg } from "@/lib/format";
import type { DayEarnings } from "@/lib/indexer";

const DAYS = 35;

/**
 * Owner earnings by day for the last 35 days, from on-chain events. Days with no trades are empty bars.
 * Every bar is also in a table below, for screen readers and for anyone who wants the exact figures.
 */
export function EarningsChart({ days, today }: { days: DayEarnings[]; today: number }) {
  const byDay = new Map(days.map((d) => [d.day, BigInt(d.ownerEarned)]));
  const series = Array.from({ length: DAYS }, (_, i) => {
    const day = today - (DAYS - 1 - i);
    return { day, value: byDay.get(day) ?? 0n };
  });
  const max = series.reduce((m, s) => (s.value > m ? s.value : m), 0n);
  const total = series.reduce((sum, s) => sum + s.value, 0n);

  const W = 700;
  const H = 160;
  const gap = 4;
  const bar = (W - gap * (DAYS - 1)) / DAYS;

  const label = (day: number) => new Date(day * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H + 24}`}
        className="w-full"
        role="img"
        aria-label={`Earnings per day for the last ${DAYS} days: ${formatUsdg(total)} USDG in total`}
      >
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" />
        {series.map((s, i) => {
          const h = max === 0n ? 0 : Math.max(s.value === 0n ? 0 : 3, Number((s.value * BigInt(H - 8)) / max));
          return (
            <rect key={s.day} x={i * (bar + gap)} y={H - h} width={bar} height={h} rx={2} fill="var(--positive)">
              <title>{`${label(s.day)}: ${formatUsdg(s.value)} USDG`}</title>
            </rect>
          );
        })}
        <text x="0" y={H + 18} fontSize="11" fill="var(--muted)">
          {label(series[0]!.day)}
        </text>
        <text x={W} y={H + 18} fontSize="11" fill="var(--muted)" textAnchor="end">
          {label(series[DAYS - 1]!.day)}
        </text>
      </svg>
      <details className="mt-2">
        <summary className="cursor-pointer text-[13px] text-muted">View as a table</summary>
        <table className="mt-2 w-full text-[13px]">
          <thead className="text-left text-muted">
            <tr>
              <th scope="col" className="py-1 font-medium">Day</th>
              <th scope="col" className="py-1 text-right font-medium">Earned</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().filter((s) => s.value > 0n).map((s) => (
              <tr key={s.day} className="border-t border-border">
                <td className="py-1">{label(s.day)}</td>
                <td className="num py-1 text-right">{formatUsdg(s.value)} USDG</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
