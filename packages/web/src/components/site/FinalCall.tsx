import { Headline } from "@/components/motion";
import { ButtonLink } from "@/components/ui";

export function FinalCall() {
  return (
    <section className="bg-ink text-bone">
      <div className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
        <Headline
          as="h2"
          text="Your pool. Your fees. *Upfront.*"
          className="max-w-4xl font-display text-[48px] font-extrabold leading-[1.02] tracking-[-0.04em] md:text-[80px]"
        />
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/app/launch" variant="signal">
            Launch a pool
          </ButtonLink>
          <ButtonLink href="/app/lend" variant="outline" className="text-bone">
            Earn as a lender
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
