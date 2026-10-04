"use client";

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Fade and rise 16px as a section scrolls into view. With reduced motion it is simply there. */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Headline words rise in one by one (40ms stagger) on first view only. `accent` words are set in the serif italic.
 * Pass the words as plain strings; wrap a word with `*` on both sides to accent it: "Every trade in your pool *pays you*."
 */
export function Headline({ text, className = "", as: Tag = "h1" }: { text: string; className?: string; as?: "h1" | "h2" }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  let index = 0;

  return (
    <Tag ref={ref} className={className}>
      {parts.map((part, p) => {
        const accent = part.startsWith("*");
        const words = (accent ? part.slice(1, -1) : part).split(/(\s+)/).filter(Boolean);
        return words.map((word, w) => {
          if (/^\s+$/.test(word)) return " ";
          const i = index++;
          const span = (
            <motion.span
              key={`${p}-${w}`}
              className={`inline-block ${accent ? "accent" : ""}`}
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={reduce || seen ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.45, delay: i * 0.04, ease: "easeOut" }}
            >
              {word}
            </motion.span>
          );
          return span;
        });
      })}
    </Tag>
  );
}

/**
 * A number that counts from its previous value to the new one, never from zero on every refresh.
 * With reduced motion it shows the final value.
 */
export function CountUp({ value, format }: { value: bigint; format: (v: bigint) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const controls = animate(0, 1, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (t) => setShown(start + BigInt(Math.round(Number(value - start) * t))),
      onComplete: () => setShown(value),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return <span className="num">{format(shown)}</span>;
}
