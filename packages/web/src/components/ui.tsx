"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "signal" | "ink" | "outline" | "bone";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-sans text-[15px] font-semibold leading-none " +
  "transition duration-150 hover:-translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  // Signal is the one accent: key buttons. Ink text on Signal is 6:1.
  signal: "bg-signal text-ink hover:brightness-90",
  ink: "bg-ink text-bone hover:bg-[#2a2e2a]",
  outline: "border border-current bg-transparent hover:bg-fg/5",
  bone: "bg-bone text-ink hover:brightness-95",
};

export function ButtonLink({ variant = "ink", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Button({ variant = "ink", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}
