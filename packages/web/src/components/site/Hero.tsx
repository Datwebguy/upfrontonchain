import { ButtonLink } from "@/components/ui";
import { Headline } from "@/components/motion";
import { FeeStream } from "./FeeStream";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <FeeStream />
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 py-20 sm:px-6">
        <Headline
          text="Every trade in your pool *pays you*."
          className="max-w-4xl font-display text-[48px] font-extrabold leading-[1.0] tracking-[-0.04em] md:text-[88px] md:leading-[96px]"
        />
        <p className="mt-6 max-w-xl text-[20px] leading-snug text-graphite md:text-[24px]">
          And you can get those earnings upfront.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <ButtonLink href="/app/launch" variant="signal">
            Launch a pool
          </ButtonLink>
          <ButtonLink href="/app/lend" variant="outline" className="text-ink">
            Earn as a lender
          </ButtonLink>
        </div>
        <p className="mt-6 text-[15px] text-graphite">Built on Robinhood Chain · Paid in USDG</p>
      </div>
    </section>
  );
}
