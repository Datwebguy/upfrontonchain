import type { TokenOption } from "@/lib/tokens";

/** Everything the three launch steps collect. Shares are in basis points of the Upfront fee and always add up. */
export interface LaunchState {
  token?: TokenOption;
  feeBps: number;
  ownerBps: number;
  appBps: number;
  referrerBps: number;
  app: string;
  tokenText: string;
  usdgText: string;
}

export const BPS = 10_000;

/** A sensible start: 1% fee, most of it to the owner, the rest to whoever sends the trade. */
export function initialState(protocolBps: number): LaunchState {
  const available = BPS - protocolBps;
  const owner = Math.round((available * 2) / 3 / 100) * 100;
  return { feeBps: 100, ownerBps: owner, appBps: 0, referrerBps: available - owner, app: "", tokenText: "", usdgText: "" };
}
