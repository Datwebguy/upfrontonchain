import { faq } from "@/content/faq";
import { Reveal } from "@/components/motion";

/** The FAQ from FAQ.md. One question open at a time: `name` groups the details elements. */
export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal>
        <h2 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[48px]">FAQ</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {faq.map((item) => (
            <details key={item.q} name="faq" className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[18px] font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden="true" className="num text-[22px] text-graphite transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 pr-8 text-[17px] leading-relaxed text-graphite">{item.a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
