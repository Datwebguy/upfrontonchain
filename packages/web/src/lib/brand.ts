/**
 * The logo geometry, in one place. The React component and scripts/make-icons.mjs both build from these numbers,
 * so the website, the favicon and the exports are always the same drawing (DESIGN.md §1 "Logo").
 *
 * A soft, rounded U (the pool), with a small solid coin just above and slightly ahead of it, as if dropping in.
 */
export const MARK = {
  viewBox: "0 0 64 64",
  /** The U: two walls and a round bottom. Drawn as a thick stroke with round ends. */
  u: "M16 25 V38 a16 16 0 0 0 32 0 V25",
  uStroke: 9,
  coin: { cx: 35, cy: 11, r: 7.5 },
  /** Where the coin sits when it has dropped into the U. */
  coinDropY: 24,
} as const;
