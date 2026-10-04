"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useRecentTrades } from "@/lib/queries";
import type { Trade } from "@/lib/indexer";

/**
 * The hero background: thin lines flow left to right into rounded pools (DESIGN.md §2).
 * A Signal coin travels along a line and drops in only when a real swap happens on an Upfront pool, read live from
 * the chain through the indexer. With no events the lines flow calmly with no coins. Nothing is invented.
 */

const W = 1200;
const H = 640;

// Seven lines that start off the left edge and converge on three pools at the right.
const POOLS = [
  { x: 930, y: 250 },
  { x: 1040, y: 380 },
  { x: 990, y: 520 },
];
const LANES = [60, 150, 240, 330, 420, 510, 600].map((y0, i) => {
  const pool = POOLS[i % POOLS.length]!;
  const mid = (y0 + pool.y) / 2;
  return { y0, d: `M -40 ${y0} C 300 ${y0}, 520 ${mid}, ${pool.x} ${pool.y - 16}` };
});

const TRAVEL_SECONDS = 2.6;

const keyOf = (t: Trade) => `${t.tx}:${t.block}:${t.poolId}:${t.usdgAmount}`;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Draws one coin travelling along a lane, then removes it. The DOM is the external system here, so no React state. */
function dropCoin(layer: SVGGElement, laneIndex: number) {
  const lane = LANES[laneIndex]!;
  const coin = document.createElementNS(SVG_NS, "circle");
  coin.setAttribute("r", "7");
  coin.setAttribute("fill", "var(--signal)");

  const move = document.createElementNS(SVG_NS, "animateMotion");
  move.setAttribute("dur", `${TRAVEL_SECONDS}s`);
  move.setAttribute("path", lane.d);
  move.setAttribute("fill", "freeze");
  move.setAttribute("calcMode", "spline");
  move.setAttribute("keyTimes", "0;1");
  move.setAttribute("keySplines", "0.4 0 0.2 1");

  const fade = document.createElementNS(SVG_NS, "animate");
  fade.setAttribute("attributeName", "opacity");
  fade.setAttribute("values", "1;1;0");
  fade.setAttribute("keyTimes", "0;0.85;1");
  fade.setAttribute("dur", `${TRAVEL_SECONDS}s`);
  fade.setAttribute("fill", "freeze");

  coin.append(move, fade);
  layer.append(coin);
  window.setTimeout(() => coin.remove(), (TRAVEL_SECONDS + 0.4) * 1000);
}

export function FeeStream() {
  const reduce = useReducedMotion();
  const { data } = useRecentTrades(10, 6_000);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const coins = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!data || reduce || !coins.current) return;
    const now = Date.now() / 1000;
    for (const t of data.trades) {
      const key = keyOf(t);
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      // On first load only trades from the last half minute drop a coin, so the page doesn't replay history.
      if (first.current && now - t.time > 30) continue;
      dropCoin(coins.current, parseInt(t.tx.slice(2, 6), 16) % LANES.length);
    }
    first.current = false;
  }, [data, reduce]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-50 md:opacity-100"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--graphite)" strokeLinecap="round">
        {LANES.map((lane, i) => (
          <path
            key={i}
            d={lane.d}
            strokeOpacity={0.28}
            strokeWidth={1.25}
            strokeDasharray="6 10"
            style={reduce ? undefined : { animation: `stream ${6 + (i % 3)}s linear infinite` }}
          />
        ))}
        {POOLS.map((p, i) => (
          <path key={i} d={`M ${p.x - 34} ${p.y - 18} v 14 a 34 34 0 0 0 68 0 v -14`} strokeOpacity={0.42} strokeWidth={5} />
        ))}
      </g>
      <g ref={coins} />
    </svg>
  );
}
