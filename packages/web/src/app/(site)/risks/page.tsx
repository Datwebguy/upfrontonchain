import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Risks" };

// The risks are from the README: owners, lenders, and everyone. Said plainly, with no promises.
const RISKS = [
  {
    who: "If you own a pool",
    text: "Repayment comes from your fees automatically. If your pool falls far behind schedule, a larger share of fees goes to repayment until it catches up. While an advance is open, the pool can't be handed to someone else.",
  },
  {
    who: "If you lend",
    text: "A pool's trading can slow or stop, so an advance can be repaid late or not in full. Offers are sized on a pool's weakest recent period to limit this, but lending always carries risk. You can lose money.",
  },
  {
    who: "For everyone",
    text: "An owner can launch a new pool and move traders. Liquidity providers can withdraw. Earnings can fall. The contracts are not upgradeable, so fixes ship as a new version and you choose whether to move.",
  },
];

export default function Risks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <h1 className="font-display text-[48px] font-extrabold leading-[1.02] tracking-[-0.04em]">Risks</h1>
      <p className="mt-4 text-[20px] text-graphite">What can go wrong, said plainly.</p>
      <div className="mt-12 space-y-10">
        {RISKS.map((r) => (
          <section key={r.who}>
            <h2 className="text-[22px] font-semibold">{r.who}</h2>
            <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-graphite">{r.text}</p>
          </section>
        ))}
      </div>
      <ButtonLink href="/#faq" variant="ink" className="mt-12">
        Read the FAQ
      </ButtonLink>
    </div>
  );
}
