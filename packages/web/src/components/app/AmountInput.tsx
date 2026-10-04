"use client";

import { useId } from "react";

/** One labelled amount field. Numbers are Geist Mono with tabular figures. */
export function AmountInput({
  label,
  value,
  onChange,
  unit = "USDG",
  max,
  onMax,
  hint,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  unit?: string;
  max?: string;
  onMax?: () => void;
  hint?: string;
  readOnly?: boolean;
}) {
  const id = useId();
  return (
    <div className="rounded-2xl border border-border bg-bg p-4 focus-within:border-fg">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <label htmlFor={id}>{label}</label>
        {max !== undefined ? (
          <button type="button" onClick={onMax} className="num hover:text-fg">
            Balance {max}
            {onMax ? <span className="ml-2 font-sans font-semibold text-accent">Max</span> : null}
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          className="num w-full bg-transparent text-[28px] font-medium outline-none placeholder:text-muted/60"
        />
        <span className="text-[15px] font-medium text-muted">{unit}</span>
      </div>
      {hint ? <p className="mt-1 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}
