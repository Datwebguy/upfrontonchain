import Link from "next/link";
import { Logo } from "@/components/Logo";
import { addressUrl, deployment } from "@/lib/network";
import { links } from "@config/networks";

type Item = { label: string; href: string; external?: boolean } | { label: string; note: string };

/** Contracts link to the explorer once they exist. Before that the footer says so, and doesn't link to nothing. */
function contractsItem(): Item {
  const hook = deployment?.hook;
  return hook ? { label: "Contracts on the explorer", href: addressUrl(hook), external: true } : { label: "Contracts on the explorer", note: "Listed here after launch" };
}

const COLUMNS: { title: string; items: Item[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Launch a pool", href: "/app/launch" },
      { label: "Trade", href: "/app/trade" },
      { label: "Lend", href: "/app/lend" },
      { label: "My pools", href: "/app" },
    ],
  },
  {
    title: "Learn",
    items: [
      { label: "How it works", href: "/#how" },
      { label: "FAQ", href: "/#faq" },
      { label: "Fees", href: "/#fees" },
      { label: "Risks", href: "/risks" },
    ],
  },
  {
    title: "Build",
    items: [
      { label: "GitHub", href: links.github, external: true },
      contractsItem(),
      { label: "Robinhood Chain docs", href: links.robinhoodChainDocs, external: true },
    ],
  },
];

function ItemLink({ item }: { item: Item }) {
  if ("note" in item) {
    return (
      <span className="text-muted-dark">
        {item.label} <span className="text-[13px]">· {item.note}</span>
      </span>
    );
  }
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className="hover:underline">
      {item.label}
    </a>
  ) : (
    <Link href={item.href} className="hover:underline">
      {item.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-ink text-bone">
      {/* The Signal coin from the logo, large and faded, a single graphic at the bottom right. */}
      <svg aria-hidden="true" focusable="false" viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-24 -right-16 -z-10 h-[420px] w-[420px] opacity-[0.14]">
        <circle cx="100" cy="100" r="100" fill="var(--signal)" />
      </svg>

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 sm:px-6">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size={32} tone="bone" />
            <p className="mt-4 max-w-xs text-[16px] text-muted-dark">Every trade pays you. Get it upfront.</p>
            <a href={links.x} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[15px] hover:underline">
              @upfrontonchain
            </a>
          </div>

          {/* Desktop: plain columns. */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="hidden md:block">
              <h2 className="text-[14px] font-semibold uppercase tracking-wide text-muted-dark">{col.title}</h2>
              <ul className="mt-4 space-y-3 text-[16px]">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <ItemLink item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Mobile: the columns become an accordion. */}
          <div className="divide-y divide-line-dark border-y border-line-dark md:hidden">
            {COLUMNS.map((col) => (
              <details key={col.title} name="footer" className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  {col.title}
                  <span aria-hidden="true" className="num text-muted-dark transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <ul className="space-y-3 pb-4 text-[16px]">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <ItemLink item={item} />
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-line-dark pt-6 text-[14px] text-muted-dark sm:flex-row sm:justify-between">
          <p>Built on Robinhood Chain · Paid in USDG</p>
          <p>
            {new Date().getFullYear()} · Lending carries risk. Fees are shown before every trade.
          </p>
        </div>
      </div>
    </footer>
  );
}
