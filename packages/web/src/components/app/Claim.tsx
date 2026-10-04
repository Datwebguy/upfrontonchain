"use client";

import { useWriteContract } from "wagmi";
import { upfrontHookAbi } from "@config/abis";
import { contracts, useClaimable } from "@/lib/contracts";
import { formatUsdg } from "@/lib/format";
import { useTx } from "@/lib/tx";
import type { Address } from "viem";
import { BigNumber } from "./common";
import { TxButton } from "./TxButton";

/** "Ready to claim": everything the person is owed across all pools, paid out in USDG. */
export function ClaimPanel({ account, label = "Ready to claim" }: { account: Address; label?: string }) {
  const claimable = useClaimable(account);
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();

  const amount = claimable.data;
  const none = amount === undefined || amount === 0n;

  return (
    <div>
      <p className="text-[14px] text-muted">{label}</p>
      <div className="mt-2">
        {amount === undefined ? <span className="skeleton inline-block h-10 w-48" aria-label="Loading" /> : <BigNumber value={amount} />}
      </div>
      <TxButton
        className="mt-4"
        label={none ? "Nothing to claim yet" : `Claim ${formatUsdg(amount)} USDG`}
        state={tx.state}
        disabled={none}
        onClick={async () => {
          if (!contracts) return;
          const receipt = await tx.run(() => writeContractAsync({ address: contracts!.hook, abi: upfrontHookAbi, functionName: "claim" }));
          if (receipt) void claimable.refetch();
        }}
      />
    </div>
  );
}
