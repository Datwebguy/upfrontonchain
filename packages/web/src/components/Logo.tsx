"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { MARK } from "@/lib/brand";

type Tone = "color" | "ink" | "bone";

const TONES: Record<Tone, { u: string; coin: string }> = {
  color: { u: "var(--fg)", coin: "var(--signal)" },
  ink: { u: "#111311", coin: "#111311" },
  bone: { u: "#f3efe6", coin: "#f3efe6" },
};

const SEEN_KEY = "upfront:logo-played";

/**
 * The mark. With `animated`, the coin drops into the U once, the U gives a tiny bounce, and the coin rises back to
 * rest. 600ms, once per visit. With reduced motion, or after the first play, it is simply the finished mark.
 */
export function Mark({ size = 32, tone = "color", animated = false }: { size?: number; tone?: Tone; animated?: boolean }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<SVGSVGElement>();

  useEffect(() => {
    if (!animated || reduce) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage can be blocked. Playing once more is harmless.
    }
    const { cy } = MARK.coin;
    const bounce = animate("path", { scaleY: [1, 1, 0.94, 1, 1] }, { duration: 0.6, times: [0, 0.35, 0.5, 0.65, 1], ease: "easeOut" });
    const drop = animate("circle", { cy: [cy, cy + MARK.coinDropY, cy + MARK.coinDropY, cy] }, { duration: 0.6, times: [0, 0.35, 0.5, 1], ease: "easeInOut" });
    return () => {
      bounce.stop();
      drop.stop();
    };
  }, [animated, reduce, animate]);

  const c = TONES[tone];
  const { cx, cy, r } = MARK.coin;

  return (
    <svg ref={scope} width={size} height={size} viewBox={MARK.viewBox} fill="none" aria-hidden="true" focusable="false">
      <path
        d={MARK.u}
        stroke={c.u}
        strokeWidth={MARK.uStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      />
      <circle cx={cx} cy={cy} r={r} fill={c.coin} />
    </svg>
  );
}

/** The mark with the wordmark: `upfront` in the display font, tight tracking, the mark on the left. */
export function Logo({ size = 32, tone = "color", animated = false }: { size?: number; tone?: Tone; animated?: boolean }) {
  const colour = tone === "ink" ? "#111311" : tone === "bone" ? "#f3efe6" : "var(--fg)";
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} tone={tone} animated={animated} />
      <span
        className="font-display font-bold leading-none"
        style={{ fontSize: size * 0.75, letterSpacing: "-0.04em", color: colour }}
      >
        upfront
      </span>
    </span>
  );
}
