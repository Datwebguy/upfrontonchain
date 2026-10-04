"use client";

import { useId } from "react";

/** A small "?" with one sentence. Explanations live here, not on the page (DESIGN.md §4 "Text rules"). */
export function Help({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="grid h-5 w-5 place-items-center rounded-full border border-border text-[12px] font-semibold text-muted hover:text-fg"
      >
        ?
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-xl border border-border bg-card p-3 text-left text-[13px] font-normal leading-snug text-fg opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
