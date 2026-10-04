/**
 * Amounts use the user's locale and never show more than 2 decimals for USDG (AGENTS.md §7). USDG has 6 decimals.
 * No developer wording reaches the screen: fees are percentages, never "bps" (DESIGN.md §6).
 */

const USDG_DECIMALS = 6n;
const UNIT = 10n ** USDG_DECIMALS;

function locale(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

/** "1,234.50". Rounds down, so the screen never shows more than the person really has. */
export function formatUsdg(raw: bigint | string, { sign = false }: { sign?: boolean } = {}): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const cents = value / (UNIT / 100n);
  const whole = Number(cents / 100n);
  const fraction = Number(cents % 100n);
  const text = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    whole + fraction / 100,
  );
  if (value > 0n && cents === 0n) return "<0.01";
  return sign && value > 0n ? `+${text}` : text;
}

/** "1,234.50 USDG". */
export function usdg(raw: bigint | string): string {
  return `${formatUsdg(raw)} USDG`;
}

/** Fee in basis points as a percentage: 100 -> "1%", 55 -> "0.55%". */
export function percent(bps: number): string {
  const pct = bps / 100;
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(pct)}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Parses what a person typed ("1,234.5") into USDG's smallest unit, or undefined if it isn't a valid amount. */
export function parseUsdg(text: string): bigint | undefined {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d*\.?\d{0,6}$/.test(clean) || clean === "" || clean === ".") return undefined;
  const [whole = "0", frac = ""] = clean.split(".");
  return BigInt(whole || "0") * UNIT + BigInt(frac.padEnd(6, "0"));
}

export function timeAgo(unixSeconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(now - unixSeconds));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
