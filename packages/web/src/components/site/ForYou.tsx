"use client";

import { useRef, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { Reveal } from "@/components/motion";

// The lines are from DESIGN.md §3. Each tab shows one line and one button.
const TABS = [
  { id: "creators", label: "Creators", line: "Your coin's trades pay you.", cta: "Launch a pool", href: "/app/launch" },
  { id: "apps", label: "Trading apps", line: "Earn from your users' trades, openly.", cta: "Launch a pool", href: "/app/launch" },
  { id: "communities", label: "Communities", line: "Bring the traders, earn the fees.", cta: "Launch a pool", href: "/app/launch" },
  { id: "traders", label: "Traders", line: "The fee you see is the fee you pay.", cta: "Trade", href: "/app/trade" },
  { id: "lenders", label: "Lenders", line: "Earn from advances that repay themselves.", cta: "Lend", href: "/app/lend" },
] as const;

export function ForYou() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[active]!;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <section id="for-you" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal>
        <h2 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[48px]">For you</h2>
        <div role="tablist" aria-label="Who Upfront is for" className="mt-8 flex flex-wrap gap-2">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={i === active}
              aria-controls={`panel-${t.id}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${i === active ? "border-ink bg-ink text-bone" : "border-line bg-transparent text-graphite hover:border-ink hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} className="mt-10 min-h-40">
          <p className="max-w-2xl font-display text-[28px] font-bold leading-tight tracking-tight md:text-[40px]">{tab.line}</p>
          <ButtonLink href={tab.href} variant={tab.cta === "Launch a pool" ? "signal" : "ink"} className="mt-8">
            {tab.cta}
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
