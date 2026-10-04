"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui";
import type { TxState } from "@/lib/tx";
import { receiptUrl } from "@/lib/network";

/**
 * A button for one on-chain action, with its four designed states:
 * idle (what will happen), pending ("Confirm in your wallet", then "Processing"), success (with a Receipt link),
 * and error (a plain reason and what to do next).
 */
export function TxButton({
  label,
  state,
  onClick,
  disabled,
  variant = "signal",
  className = "",
}: {
  label: string;
  state: TxState;
  onClick: () => void;
  disabled?: boolean;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const busy = state.status === "wallet" || state.status === "processing";
  const text = state.status === "wallet" ? "Confirm in your wallet" : state.status === "processing" ? "Processing" : label;

  return (
    <div className={className}>
      <Button variant={variant} onClick={onClick} disabled={disabled || busy} aria-busy={busy}>
        {text}
      </Button>
      <div aria-live="polite" className="mt-2 min-h-5 text-[14px]">
        {state.status === "success" ? (
          <p className="text-positive">
            Done.{" "}
            <a href={receiptUrl(state.hash)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Receipt
            </a>
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className="text-fg">
            {state.error.message}
            {state.error.next ? <span className="text-muted"> {state.error.next}</span> : null}
            {state.error.link ? (
              <>
                {" "}
                <a href={state.error.link.href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                  {state.error.link.label} ↗
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
