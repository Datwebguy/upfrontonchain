"use client";

import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Hex, TransactionReceipt } from "viem";
import { plainError, type PlainError } from "./errors";

/** Every action has four designed states: idle, pending (wallet, then processing), success, and error. */
export type TxState =
  | { status: "idle" }
  | { status: "wallet" }
  | { status: "processing"; hash: Hex }
  | { status: "success"; hash: Hex }
  | { status: "error"; error: PlainError };

/**
 * Runs one transaction through its states. Pass a function that sends it, so the call site keeps its own types:
 *
 *   tx.run(() => writeContractAsync({ address, abi, functionName: "claim" }))
 */
export function useTx() {
  const client = usePublicClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (send: () => Promise<Hex>): Promise<TransactionReceipt | undefined> => {
      setState({ status: "wallet" });
      try {
        const hash = await send();
        setState({ status: "processing", hash });
        const receipt = await client?.waitForTransactionReceipt({ hash });
        if (!receipt || receipt.status !== "success") throw new Error("not confirmed");
        setState({ status: "success", hash });
        return receipt;
      } catch (error) {
        setState({ status: "error", error: plainError(error) });
        return undefined;
      }
    },
    [client],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset, busy: state.status === "wallet" || state.status === "processing" };
}
