// Checks every text/background pair the design uses against WCAG AA (DESIGN.md §1 "Rules").
// Run: node scripts/contrast.mjs. Exits 1 if any pair fails. The tokens here must match src/app/globals.css.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/app/globals.css"), "utf8");
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
};

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text, background, minimum ratio, what it is]. 4.5 for body text, 3 for large text and graphics.
const pairs = [
  // Light: the website and the light app.
  ["ink", "bone", 4.5, "main text on the website"],
  ["ink", "paper", 4.5, "text on cards"],
  ["graphite", "bone", 4.5, "secondary text on the website"],
  ["graphite", "paper", 4.5, "secondary text on cards"],
  ["moss", "bone", 4.5, "earnings and success text"],
  ["moss", "paper", 4.5, "earnings and success text on cards"],
  ["signal-text", "bone", 4.5, "live fee text and focus ring on the website"],
  ["signal-text", "paper", 4.5, "live fee text and focus ring on cards"],
  ["ink", "signal", 4.5, "text on Signal buttons"],
  ["bone", "moss", 4.5, "text on Moss"],
  ["ink", "sky", 4.5, "text on Sky (lender side)"],
  ["graphite", "sky", 4.5, "secondary text on Sky"],
  // Dark: the app's dark theme and the dark sections of the website.
  ["bone", "ink", 4.5, "text on dark sections and the dark theme"],
  ["bone", "card-dark", 4.5, "text on dark cards"],
  ["muted-dark", "ink", 4.5, "secondary text in the dark theme"],
  ["muted-dark", "card-dark", 4.5, "secondary text on dark cards"],
  ["signal", "ink", 4.5, "Signal text and focus ring in the dark theme"],
  ["signal", "card-dark", 4.5, "Signal text on dark cards"],
  ["moss-light", "ink", 4.5, "earnings and success text in the dark theme"],
  ["moss-light", "card-dark", 4.5, "earnings and success text on dark cards"],
  // Not checked: the Signal coin on Bone (2.7:1). It is the logo and a decorative graphic, never text or the only
  // way to tell something apart. Hairlines (--line) are decoration.
];

let failed = 0;
for (const [fg, bg, min, what] of pairs) {
  const r = ratio(token(fg), token(bg));
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${min})  ${fg} on ${bg}: ${what}`);
}
if (failed) {
  console.error(`${failed} pair(s) fail`);
  process.exit(1);
}
