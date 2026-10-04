"use client";

import { CountUp } from "@/components/motion";
import { formatUsdg } from "@/lib/format";
import { useTotals } from "@/lib/queries";

/**
 * Three live numbers from the contracts. If a number is zero, the word "Starting" shows instead of a big zero.
 * Nothing is typed in: until the indexer answers, the shape of the numbers shows as a skeleton.
 */
export function LiveStrip() {
  const { data, isError } = useTotals();

  const items = [
    { label: "Fees paid to owners", value: data ? BigInt(data.feesPaidToOwners) : undefined },
    { label: "Paid upfront", value: data ? BigInt(data.paidUpfront) : undefined },
    { label: "Repaid", value: data ? BigInt(data.repaid) : undefined },
  ];

  return (
    <section aria-label="Live numbers" className="border-y border-line bg-paper">
      <dl className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[15px] text-graphite">{item.label}</dt>
            <dd className="mt-1 font-display text-[40px] font-bold leading-none tracking-tight">
              {item.value === undefined ? (
                isError ? (
                  <span className="text-graphite" title="Can't load the latest numbers right now.">
                    Not available
                  </span>
                ) : (
                  <span className="skeleton inline-block h-10 w-40 align-middle" aria-label="Loading" />
                )
              ) : item.value === 0n ? (
                <span>Starting</span>
              ) : (
                <>
                  <CountUp value={item.value} format={formatUsdg} /> <span className="text-[18px] font-medium text-graphite">USDG</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
