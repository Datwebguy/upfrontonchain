import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Q96,
  amountsForLiquidity,
  fullRangeTicks,
  isqrt,
  liquidityForAmounts,
  poolSetup,
  sqrtPriceFromAmounts,
  sqrtRatioAtTick,
} from "../../src/lib/launch.ts";

const USDG = "0x7e955252e15c84f5768b83c41a71f9eba181802f";
const LOW = "0x0000000000000000000000000000000000000001"; // sorts before USDG
const HIGH = "0xffffffffffffffffffffffffffffffffffffffff"; // sorts after USDG

test("integer square root is exact", () => {
  for (const n of [0n, 1n, 2n, 15n, 16n, 17n, 10n ** 36n, 10n ** 36n + 1n, 2n ** 192n - 1n]) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n, `isqrt(${n})`);
  }
});

test("full range ticks are multiples of the spacing and inside the allowed range", () => {
  const { lower, upper } = fullRangeTicks(60);
  assert.equal(Math.abs(lower % 60), 0); // -887220 % 60 is -0 in JavaScript
  assert.equal(upper, -lower);
  assert.ok(upper <= 887_272 && upper > 887_272 - 60);
});

test("tick 0 is a price of one, and the ratio rises with the tick", () => {
  assert.equal(sqrtRatioAtTick(0), Q96);
  assert.ok(sqrtRatioAtTick(60) > sqrtRatioAtTick(0));
  assert.ok(sqrtRatioAtTick(-60) < sqrtRatioAtTick(0));
});

test("the starting price matches the ratio of the amounts", () => {
  // 1 token (18 decimals) against 250 USDG (6 decimals), with the token as currency0.
  const p = sqrtPriceFromAmounts(10n ** 18n, 250_000_000n);
  const priceX192 = p * p;
  const expected = (250_000_000n << 192n) / 10n ** 18n;
  // Within one part in 10^12 of the exact ratio.
  const diff = priceX192 > expected ? priceX192 - expected : expected - priceX192;
  assert.ok(diff * 10n ** 12n < expected, "price within 1e-12");
});

test("zero amounts are refused", () => {
  assert.throws(() => sqrtPriceFromAmounts(0n, 1n));
  assert.throws(() => poolSetup(LOW, USDG, 0n, 1n));
});

test("currencies are ordered by address, whichever side the token is on", () => {
  const a = poolSetup(LOW, USDG, 10n ** 18n, 100_000_000n);
  assert.equal(a.currency0, LOW);
  assert.equal(a.currency1, USDG);
  assert.equal(a.amount0Max, 10n ** 18n);
  const b = poolSetup(HIGH, USDG, 10n ** 18n, 100_000_000n);
  assert.equal(b.currency0, USDG);
  assert.equal(b.currency1, HIGH);
  assert.equal(b.amount0Max, 100_000_000n);
  assert.equal(b.amount1Max, 10n ** 18n);
});

test("the liquidity never needs more than the amounts the person offered", () => {
  const cases: [bigint, bigint][] = [
    [10n ** 18n, 100_000_000n],
    [5n * 10n ** 18n, 1_000_000n],
    [123_456_789_012_345_678n, 987_654_321n],
    [10n ** 24n, 10n ** 12n],
    [10n ** 12n, 5_000_000n],
  ];
  for (const token of [LOW, HIGH] as const) {
    for (const [tokenAmount, usdgAmount] of cases) {
      const s = poolSetup(token, USDG, tokenAmount, usdgAmount);
      const need = amountsForLiquidity(
        s.sqrtPriceX96,
        sqrtRatioAtTick(s.tickLower),
        sqrtRatioAtTick(s.tickUpper),
        s.liquidity,
      );
      assert.ok(need.amount0 <= s.amount0Max, `amount0 within max (${token}, ${tokenAmount})`);
      assert.ok(need.amount1 <= s.amount1Max, `amount1 within max (${token}, ${tokenAmount})`);
      // And it uses most of what was offered, so little is left idle.
      assert.ok(need.amount0 * 100n >= s.amount0Max * 98n || need.amount1 * 100n >= s.amount1Max * 98n);
    }
  }
});

test("a price outside the range is refused", () => {
  assert.throws(() => liquidityForAmounts(Q96, Q96, Q96 * 2n, 1n, 1n));
});
