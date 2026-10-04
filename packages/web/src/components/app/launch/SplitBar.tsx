"use client";

import { useRef } from "react";
import { percent } from "@/lib/format";
import { BPS } from "./state";

const SEGMENTS = [
  { key: "owner", label: "You", colour: "var(--moss)", text: "#f3efe6" },
  { key: "app", label: "App", colour: "var(--fg)", text: "var(--bg)" },
  { key: "referrer", label: "Referrer", colour: "var(--sky)", text: "#111311" },
  { key: "protocol", label: "Upfront", colour: "var(--muted)", text: "var(--bg)" },
] as const;

const STEP = 50; // 0.5%

/**
 * The split as one horizontal bar with draggable sections: You, App, Referrer. Upfront's share is fixed at launch
 * and labelled. Two handles move the boundaries; the arrow keys work too.
 */
export function SplitBar({
  ownerBps,
  appBps,
  referrerBps,
  protocolBps,
  onChange,
}: {
  ownerBps: number;
  appBps: number;
  referrerBps: number;
  protocolBps: number;
  onChange: (next: { ownerBps: number; appBps: number; referrerBps: number }) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const available = BPS - protocolBps;
  const first = ownerBps; // boundary between You and App
  const second = ownerBps + appBps; // boundary between App and Referrer

  const set = (a: number, b: number) => {
    const ownerEnd = Math.min(Math.max(0, a), b);
    const appEnd = Math.min(Math.max(ownerEnd, b), available);
    onChange({ ownerBps: ownerEnd, appBps: appEnd - ownerEnd, referrerBps: available - appEnd });
  };

  const snap = (clientX: number): number => {
    const rect = bar.current!.getBoundingClientRect();
    const bps = ((clientX - rect.left) / rect.width) * BPS;
    return Math.round(bps / STEP) * STEP;
  };

  const drag = (which: 1 | 2) => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const at = snap(ev.clientX);
      if (which === 1) set(at, second);
      else set(first, at);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const key = (which: 1 | 2) => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 100 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -100 : 0;
    if (!d) return;
    e.preventDefault();
    if (which === 1) set(first + d, second);
    else set(first, second + d);
  };

  const widths = [ownerBps, appBps, referrerBps, protocolBps];

  return (
    <div>
      <div ref={bar} className="relative flex h-12 select-none overflow-visible rounded-xl">
        {SEGMENTS.map((s, i) => (
          <div
            key={s.key}
            className={`flex min-w-0 items-center justify-center overflow-hidden text-[12px] font-semibold ${i === 0 ? "rounded-l-xl" : ""} ${i === 3 ? "rounded-r-xl" : ""}`}
            style={{ width: `${widths[i]! / 100}%`, background: s.colour, color: s.text }}
          >
            {widths[i]! >= 900 ? <span className="num">{percent(widths[i]!)}</span> : null}
          </div>
        ))}
        {([1, 2] as const).map((which) => {
          const at = which === 1 ? first : second;
          return (
            <button
              key={which}
              role="slider"
              aria-label={which === 1 ? "Your share ends here" : "App share ends here"}
              aria-valuemin={which === 1 ? 0 : first}
              aria-valuemax={which === 1 ? second : available}
              aria-valuenow={at}
              aria-valuetext={which === 1 ? `You get ${percent(ownerBps)}` : `App gets ${percent(appBps)}`}
              onPointerDown={drag(which)}
              onKeyDown={key(which)}
              style={{ left: `${at / 100}%`, touchAction: "none" }}
              className="absolute top-1/2 h-14 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-bg bg-signal"
            />
          );
        })}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
        {SEGMENTS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: s.colour }} />
            <span className="text-muted">{s.label}</span>
            <span className="num ml-auto sm:ml-1">{percent(widths[i]!)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
