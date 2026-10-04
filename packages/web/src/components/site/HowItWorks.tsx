"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { MARK } from "@/lib/brand";
import { ButtonLink } from "@/components/ui";

const STEPS = [
  "Launch a pool. Your fee is shown to every trader.",
  "Every trade pays you in USDG.",
  "Get your future earnings upfront. They repay themselves.",
] as const;

const SHARES = [
  { label: "You", width: 56, colour: "var(--moss)" },
  { label: "App", width: 18, colour: "var(--ink)" },
  { label: "Referrer", width: 14, colour: "var(--sky)" },
  { label: "Upfront", width: 12, colour: "var(--graphite)" },
] as const;

/**
 * A picture of the step, not a screenshot of numbers: a pool appears, a coin drops in and splits into coloured
 * shares, and an Upfront offer slides in. Nothing here is a real figure.
 */
function Scene({ step, still }: { step: 0 | 1 | 2; still?: boolean }) {
  const t = still ? { duration: 0 } : { duration: 0.5, ease: "easeOut" as const };
  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-3xl border border-line bg-paper" role="img" aria-label={STEPS[step]}>
      <svg viewBox="0 0 320 340" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <motion.path
          d="M 90 130 V 190 a 70 70 0 0 0 140 0 V 130"
          fill="none"
          stroke="var(--ink)"
          strokeWidth={14}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={t}
        />
        <motion.circle
          cx={170}
          r={16}
          fill="var(--signal)"
          initial={false}
          animate={step === 0 ? { cy: 70, opacity: 1 } : step === 1 ? { cy: 200, opacity: 1 } : { cy: 70, opacity: 1 }}
          transition={t}
        />
      </svg>

      <motion.div
        className="absolute inset-x-6 bottom-6 space-y-2"
        initial={false}
        animate={{ opacity: step === 1 ? 1 : 0, y: step === 1 ? 0 : 12 }}
        transition={t}
        aria-hidden={step !== 1}
      >
        <div className="flex h-5 overflow-hidden rounded-full">
          {SHARES.map((s) => (
            <div key={s.label} style={{ width: `${s.width}%`, background: s.colour }} />
          ))}
        </div>
        <div className="flex justify-between text-[13px] text-graphite">
          {SHARES.map((s) => (
            <span key={s.label}>{s.label}</span>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-x-6 bottom-6 rounded-2xl bg-ink p-5 text-bone"
        initial={false}
        animate={{ opacity: step === 2 ? 1 : 0, x: step === 2 ? 0 : 48 }}
        transition={t}
        aria-hidden={step !== 2}
      >
        <p className="text-[13px] text-muted-dark">Your Upfront offer</p>
        <p className="mt-1 font-display text-[24px] font-bold leading-tight">Get paid upfront</p>
        <p className="mt-1 text-[14px] text-muted-dark">Repaid from a share of your fees</p>
      </motion.div>
      {/* The mark's own coin proportions keep the drawing on-brand. */}
      <span className="sr-only">{MARK.viewBox}</span>
    </div>
  );
}

/** Sticky three-step sequence driven by scroll. With reduced motion the three steps simply stack. */
export function HowItWorks() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(v < 0.34 ? 0 : v < 0.67 ? 1 : 2));

  const heading = <h2 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] md:text-[48px]">How it works</h2>;

  if (reduce) {
    return (
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        {heading}
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {STEPS.map((text, i) => (
            <div key={text}>
              <Scene step={i as 0 | 1 | 2} still />
              <p className="mt-4 text-[18px]">
                <span className="num text-graphite">{i + 1}. </span>
                {text}
              </p>
            </div>
          ))}
        </div>
        <ButtonLink href="/app/launch" variant="signal" className="mt-10">
          Launch a pool
        </ButtonLink>
      </section>
    );
  }

  return (
    <section id="how" className="scroll-mt-20">
      <div ref={ref} className="relative h-[280vh]">
        <div className="sticky top-16 mx-auto flex h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 sm:px-6">
          {heading}
          <div className="mt-10 grid items-center gap-10 md:grid-cols-2">
            <ol className="space-y-6">
              {STEPS.map((text, i) => (
                <li
                  key={text}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex gap-4 text-[22px] leading-snug transition-opacity duration-300 md:text-[28px] ${i === step ? "opacity-100" : "opacity-35"}`}
                >
                  <span className="num pt-1 text-[16px] text-graphite">{i + 1}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <Scene step={step} />
          </div>
          <ButtonLink href="/app/launch" variant="signal" className="mt-10 self-start">
            Launch a pool
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
