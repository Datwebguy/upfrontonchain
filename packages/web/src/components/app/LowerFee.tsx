"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { upfrontLauncherAbi } from "@config/abis";
import { contracts } from "@/lib/contracts";
import { percent } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { Help } from "./Help";
import { TxButton } from "./TxButton";

/** A pool's fee can only go down, and only its owner can lower it. */
export function LowerFee({ poolId, currentBps, onDone }: { poolId: Hex; currentBps: number; onDone: () => void }) {
  const [bps, setBps] = useState(Math.max(0, currentBps - 1));
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();

  if (currentBps === 0) return <p className="text-muted">Your fee is already 0%.</p>;

  return (
    <div>
      <label htmlFor="lower-fee" className="flex items-center gap-2 text-[14px] font-medium">
        Lower your fee <Help>You can lower it any time. You can never raise it, so traders always know the most they&apos;ll pay.</Help>
      </label>
      <div className="mt-3 flex items-center gap-4">
        <input
          id="lower-fee"
          type="range"
          min={0}
          max={currentBps - 1}
          step={1}
          value={bps}
          onChange={(e) => setBps(Number(e.target.value))}
          className="w-full accent-[var(--signal)]"
        />
        <span className="num w-16 text-right text-[15px]">{percent(bps)}</span>
      </div>
      <TxButton
        className="mt-3"
        variant="ink"
        label={`Lower fee to ${percent(bps)}`}
        state={tx.state}
        onClick={async () => {
          if (!contracts) return;
          const receipt = await tx.run(() =>
            writeContractAsync({ address: contracts!.launcher, abi: upfrontLauncherAbi, functionName: "lowerFee", args: [poolId, bps] }),
          );
          if (receipt) onDone();
        }}
      />
    </div>
  );
}
