/**
 * The maths behind "Add funds": from the two amounts a person enters to the starting price and the first liquidity.
 * Pure functions on BigInt. The launcher pulls what it needs and returns the rest.
 *
 * The pool is full range: the first liquidity covers every price, so nothing can be "out of range" at launch.
 */

export const Q96 = 2n ** 96n;

/** The pool's own trading fee (0.30%) and tick spacing. The Upfront fee is on top of this and is shown with it. */
export const TRADING_FEE = 3_000;
export const TICK_SPACING = 60;
const MAX_TICK = 887_272;

/** The widest ticks that are a multiple of the spacing. */
export function fullRangeTicks(spacing = TICK_SPACING): { lower: number; upper: number } {
  const t = Math.floor(MAX_TICK / spacing) * spacing;
  return { lower: -t, upper: t };
}

export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** sqrt(1.0001^tick) * 2^96. Floating point is enough: the liquidity below keeps a safety margin. */
export function sqrtRatioAtTick(tick: number): bigint {
  const ratio = Math.sqrt(1.0001 ** tick);
  // Split the 2^96 scaling so the intermediate stays exact enough for a 53-bit mantissa.
  return BigInt(Math.floor(ratio * 2 ** 48)) * 2n ** 48n;
}

/** The pool starts at the price the two amounts imply: raw amount1 per raw amount0. */
export function sqrtPriceFromAmounts(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) throw new Error("Both amounts must be above zero");
  return isqrt((amount1 << 192n) / amount0);
}

/** Liquidity that two amounts can fund between two prices, at the current price (all as sqrt prices in Q96). */
export function liquidityForAmounts(sqrtP: bigint, sqrtA: bigint, sqrtB: bigint, amount0: bigint, amount1: bigint): bigint {
  if (sqrtP <= sqrtA || sqrtP >= sqrtB) throw new Error("The starting price must be inside the range");
  const l0 = (amount0 * ((sqrtP * sqrtB) / Q96)) / (sqrtB - sqrtP);
  const l1 = (amount1 * Q96) / (sqrtP - sqrtA);
  return l0 < l1 ? l0 : l1;
}

/** The amounts liquidity `l` needs at that price, rounded up (as the pool does). */
export function amountsForLiquidity(sqrtP: bigint, sqrtA: bigint, sqrtB: bigint, l: bigint): { amount0: bigint; amount1: bigint } {
  const up = (a: bigint, b: bigint) => (a + b - 1n) / b;
  return {
    amount0: up(l * Q96 * (sqrtB - sqrtP), sqrtB * sqrtP),
    amount1: up(l * (sqrtP - sqrtA), Q96),
  };
}

export interface PoolSetup {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
}

const MAX_UINT128 = 2n ** 128n - 1n;

/**
 * Everything the launcher needs for the first liquidity, from the token, USDG and the two amounts. Currencies are
 * ordered the way the pool orders them (by address). `liquidity` keeps a 0.1% margin so rounding can never make the
 * position ask for more than the person approved.
 */
export function poolSetup(token: `0x${string}`, usdg: `0x${string}`, tokenAmount: bigint, usdgAmount: bigint): PoolSetup {
  const tokenIs0 = token.toLowerCase() < usdg.toLowerCase();
  const amount0 = tokenIs0 ? tokenAmount : usdgAmount;
  const amount1 = tokenIs0 ? usdgAmount : tokenAmount;
  const sqrtPriceX96 = sqrtPriceFromAmounts(amount0, amount1);
  const { lower, upper } = fullRangeTicks();
  const raw = liquidityForAmounts(sqrtPriceX96, sqrtRatioAtTick(lower), sqrtRatioAtTick(upper), amount0, amount1);
  const liquidity = (raw * 999n) / 1000n;
  if (liquidity <= 0n) throw new Error("Those amounts are too small to start a pool");
  if (liquidity > MAX_UINT128) throw new Error("Those amounts are too large");
  return {
    currency0: tokenIs0 ? token : usdg,
    currency1: tokenIs0 ? usdg : token,
    sqrtPriceX96,
    tickLower: lower,
    tickUpper: upper,
    liquidity,
    amount0Max: amount0,
    amount1Max: amount1,
  };
}
