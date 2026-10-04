// Test fixtures live here only and never ship (AGENTS.md rule 9).
import { encodeAbiParameters, encodeEventTopics, type Hex, type Log } from "viem";
import type { AbiEvent } from "viem";
import { eventsAbi, type ContractName, type DecodedLog } from "../src/events.ts";

export const POOL: Hex = `0x${"ab".repeat(32)}`;
export const OWNER = "0x00000000000000000000000000000000000000a1";
export const APP = "0x00000000000000000000000000000000000000a2";
export const TRADER = "0x00000000000000000000000000000000000000a3";
export const REFERRER = "0x00000000000000000000000000000000000000a4";
export const NONE = "0x0000000000000000000000000000000000000000";
export const TOKEN = "0x00000000000000000000000000000000000000a5";

let nextLog = 0;

export function ev(
  contract: ContractName,
  eventName: string,
  args: Record<string, unknown>,
  blockNumber: number,
): DecodedLog {
  return { contract, eventName, args, blockNumber, logIndex: nextLog++, txHash: `0x${"11".repeat(32)}` };
}

export const registered = (block: number) =>
  ev(
    "hook",
    "PoolRegistered",
    {
      poolId: POOL,
      owner: OWNER,
      app: APP,
      upfrontFeeBps: 100,
      ownerBps: 6000,
      appBps: 2000,
      referrerBps: 1000,
      protocolBps: 1000,
    },
    block,
  );

export const launched = (block: number) =>
  ev(
    "launcher",
    "PoolLaunched",
    {
      poolId: POOL,
      token: TOKEN,
      owner: OWNER,
      launcher: NONE,
      tradingFee: 3000,
      tickSpacing: 60,
      positionId: 1n,
      version: 1n,
    },
    block,
  );

/** A fee on a swap of `usdg`, at the pool's 1% rate, with the given split. */
export function feeTaken(
  block: number,
  usdg: bigint,
  split: { owner: bigint; app: bigint; referrer: bigint; protocol: bigint; repay: bigint },
  day = 20000,
  overrides: Partial<{ fee: bigint }> = {},
) {
  const fee = overrides.fee ?? split.owner + split.app + split.referrer + split.protocol + split.repay;
  return ev(
    "hook",
    "FeeTaken",
    {
      poolId: POOL,
      trader: TRADER,
      referrer: split.referrer > 0n ? REFERRER : NONE,
      usdgAmount: usdg,
      fee,
      day,
      ownerAmount: split.owner,
      appAmount: split.app,
      referrerAmount: split.referrer,
      protocolAmount: split.protocol,
      repayAmount: split.repay,
    },
    block,
  );
}

export const accepted = (block: number, principal: bigint, totalDue: bigint) =>
  ev(
    "advanceDesk",
    "AdvanceAccepted",
    { poolId: POOL, owner: OWNER, principal, totalDue, flatFeeBps: 600, repayShareBps: 2000, behindAt: 2_000_000_000n },
    block,
  );

/** Encodes a real log the way the chain would, so decoding is tested against the generated ABI. */
export function encodeLog(eventName: string, args: Record<string, unknown>, address: Hex, block: number): Log {
  const abiEvent = eventsAbi.find((e) => e.name === eventName) as AbiEvent;
  const topics = encodeEventTopics({ abi: [abiEvent], eventName, args } as never) as Hex[];
  const nonIndexed = abiEvent.inputs.filter((i) => !("indexed" in i && i.indexed));
  const data = encodeAbiParameters(
    nonIndexed,
    nonIndexed.map((i) => args[i.name as string]),
  );
  return {
    address,
    topics: topics as [Hex, ...Hex[]],
    data,
    blockNumber: BigInt(block),
    logIndex: nextLog++,
    transactionHash: `0x${"22".repeat(32)}`,
    blockHash: `0x${"33".repeat(32)}`,
    transactionIndex: 0,
    removed: false,
  } as Log;
}
