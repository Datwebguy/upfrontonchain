import type { Address } from "viem";

/** A token someone can launch a pool for, read live from Robinhood's assets API or the explorer. */
export interface TokenOption {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** A real logo from the source, or null. The app draws a plain monogram when there is none. */
  logo: string | null;
  /** The ERC-8056 multiplier as decimal text ("1" when the token has none). Stock-token amounts are shown with it. */
  multiplier: string;
  /** On the faucet list (testnet) or Robinhood's own list (mainnet). */
  verified: boolean;
}

const SCALE = 10n ** 18n;

/** "1.001148322800714293" as a number scaled by 10^18. */
export function multiplierScaled(text: string): bigint {
  const [whole = "0", frac = ""] = text.split(".");
  return BigInt(whole || "0") * SCALE + BigInt(frac.padEnd(18, "0").slice(0, 18));
}

/** What the holder sees: the raw token amount times the multiplier (ERC-8056). */
export function displayRaw(raw: bigint, multiplier: bigint): bigint {
  return (raw * multiplier) / SCALE;
}

/** The raw token amount for something the person typed as a displayed amount. Rounds down. */
export function rawFromDisplay(display: bigint, multiplier: bigint): bigint {
  return (display * SCALE) / multiplier;
}

/** Parses "1,234.5" into the smallest unit for `decimals`, or undefined if it isn't a valid amount. */
export function parseAmount(text: string, decimals: number): bigint | undefined {
  const clean = text.trim().replace(/,/g, "");
  const pattern = new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`);
  if (clean === "" || clean === "." || !pattern.test(clean)) return undefined;
  const [whole = "0", frac = ""] = clean.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** An amount for the screen: the user's locale, at most `maxDecimals` places, rounded down. */
export function formatAmount(raw: bigint, decimals: number, maxDecimals = 4): string {
  const places = Math.min(maxDecimals, decimals);
  const scaled = raw / 10n ** BigInt(decimals - places); // drop the digits we won't show
  const whole = scaled / 10n ** BigInt(places);
  const fraction = (scaled % 10n ** BigInt(places)).toString().padStart(places, "0");
  const locale = typeof navigator === "undefined" ? undefined : navigator.language;
  const wholeText = new Intl.NumberFormat(locale).format(whole);
  const point = (0.1).toLocaleString(locale).charAt(1);
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${wholeText}${point}${trimmed}` : wholeText;
}

/** Plain digits for an input box: no separators, no trailing zeros. */
export function toInputText(raw: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const frac = (raw % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${raw / unit}.${frac}` : `${raw / unit}`;
}
