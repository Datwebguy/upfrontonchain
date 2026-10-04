"use client";

import { erc20Abi, parseEventLogs, type Address, type Hex } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { upfrontLauncherAbi } from "@config/abis";
import { Button } from "@/components/ui";
import { contracts, useAllowance, useUsdgBalance } from "@/lib/contracts";
import { formatUsdg, parseUsdg } from "@/lib/format";
import { TICK_SPACING, TRADING_FEE, poolSetup } from "@/lib/launch";
import { indexer } from "@/lib/indexer";
import { network } from "@/lib/network";
import { displayRaw, formatAmount, multiplierScaled, parseAmount, rawFromDisplay, toInputText } from "@/lib/tokens";
import { useTx } from "@/lib/tx";
import { useQuery } from "@tanstack/react-query";
import { AmountInput } from "../AmountInput";
import { PoolLink } from "../common";
import { TxButton } from "../TxButton";
import type { LaunchState } from "./state";

/** Step 3: add the first funds, approve what's needed, and launch. */
export function FundsStep({
  state,
  account,
  onChange,
  onBack,
  onLaunched,
}: {
  state: LaunchState;
  account: Address;
  onChange: (patch: Partial<LaunchState>) => void;
  onBack: () => void;
  onLaunched: (poolId: Hex) => void;
}) {
  const token = state.token!;
  const mult = multiplierScaled(token.multiplier);
  const { writeContractAsync } = useWriteContract();
  const approveToken = useTx();
  const approveUsdg = useTx();
  const launch = useTx();

  const tokenBalance = useReadContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [account], query: { refetchInterval: 8_000 } });
  const usdgBalance = useUsdgBalance(account);
  const tokenAllowance = useAllowance(token.address, account, contracts?.launcher);
  const usdgAllowance = useAllowance(network.usdg, account, contracts?.launcher);

  // What the person typed is what they see: for a stock token that is the amount with its multiplier applied.
  const tokenDisplay = parseAmount(state.tokenText, token.decimals);
  const tokenRaw = tokenDisplay === undefined ? undefined : rawFromDisplay(tokenDisplay, mult);
  const usdgRaw = parseUsdg(state.usdgText);

  let setup: ReturnType<typeof poolSetup> | undefined;
  if (tokenRaw !== undefined && usdgRaw !== undefined && tokenRaw > 0n && usdgRaw > 0n) {
    try {
      setup = poolSetup(token.address, network.usdg, tokenRaw, usdgRaw);
    } catch {
      setup = undefined;
    }
  }

  // Is there already a pool for this token with these settings?
  const existingId = useReadContract({
    address: contracts?.launcher,
    abi: upfrontLauncherAbi,
    functionName: "poolIdFor",
    args: [token.address, TRADING_FEE, TICK_SPACING],
    query: { enabled: !!contracts },
  });
  const existing = useQuery({
    queryKey: ["existing-pool", existingId.data],
    queryFn: () => indexer.pool(existingId.data!),
    enabled: !!existingId.data,
    retry: false,
  });
  const poolExists = existing.isSuccess;

  const tooMuchToken = tokenRaw !== undefined && tokenBalance.data !== undefined && tokenRaw > tokenBalance.data;
  const tooMuchUsdg = usdgRaw !== undefined && usdgBalance.data !== undefined && usdgRaw > usdgBalance.data;
  const needTokenApproval = !!setup && (tokenAllowance.data ?? 0n) < tokenRaw!;
  const needUsdgApproval = !!setup && (usdgAllowance.data ?? 0n) < usdgRaw!;
  const ready = !!setup && !tooMuchToken && !tooMuchUsdg && !poolExists;

  const sendApprove = (tx: ReturnType<typeof useTx>, tokenAddress: Address, amount: bigint, refetch: () => unknown) => async () => {
    if (!contracts) return;
    const receipt = await tx.run(() => writeContractAsync({ address: tokenAddress, abi: erc20Abi, functionName: "approve", args: [contracts!.launcher, amount] }));
    if (receipt) void refetch();
  };

  const doLaunch = async () => {
    if (!contracts || !setup) return;
    const receipt = await launch.run(() =>
      writeContractAsync({
        address: contracts!.launcher,
        abi: upfrontLauncherAbi,
        functionName: "launch",
        args: [
          {
            token: token.address,
            tradingFee: TRADING_FEE,
            tickSpacing: TICK_SPACING,
            upfrontFeeBps: state.feeBps,
            ownerBps: state.ownerBps,
            appBps: state.appBps,
            referrerBps: state.referrerBps,
            app: state.appBps > 0 ? (state.app.trim() as Address) : "0x0000000000000000000000000000000000000000",
            owner: account,
            sqrtPriceX96: setup.sqrtPriceX96,
            tickLower: setup.tickLower,
            tickUpper: setup.tickUpper,
            liquidity: setup.liquidity,
            amount0Max: setup.amount0Max,
            amount1Max: setup.amount1Max,
          },
        ],
      }),
    );
    if (!receipt) return;
    const logs = parseEventLogs({ abi: upfrontLauncherAbi, eventName: "PoolLaunched", logs: receipt.logs });
    const id = logs[0]?.args.poolId;
    if (id) onLaunched(id);
  };

  const tokenBalanceText = tokenBalance.data === undefined ? undefined : formatAmount(displayRaw(tokenBalance.data, mult), token.decimals);

  return (
    <div className="space-y-5">
      <AmountInput
        label={`${token.symbol} to add`}
        unit={token.symbol}
        value={state.tokenText}
        onChange={(v) => onChange({ tokenText: v })}
        {...(tokenBalanceText !== undefined && tokenBalance.data !== undefined
          ? { max: tokenBalanceText, onMax: () => onChange({ tokenText: toInputText(displayRaw(tokenBalance.data!, mult), token.decimals) }) }
          : {})}
      />
      <AmountInput
        label="USDG to add"
        value={state.usdgText}
        onChange={(v) => onChange({ usdgText: v })}
        {...(usdgBalance.data !== undefined ? { max: formatUsdg(usdgBalance.data) } : {})}
        hint="The two amounts set the starting price."
      />

      {tooMuchToken ? <p className="text-[14px]">Not enough {token.symbol}.</p> : null}
      {tooMuchUsdg ? (
        <p className="text-[14px]">
          Not enough USDG.{" "}
          {network.faucetUrl ? (
            <a href="https://faucet.paxos.com/" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              Get test USDG ↗
            </a>
          ) : null}
        </p>
      ) : null}
      {poolExists && existingId.data ? (
        <p className="text-[14px]">
          A pool for {token.symbol} already exists. <PoolLink id={existingId.data}>Open it</PoolLink>
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        {ready && needTokenApproval ? (
          <TxButton label={`Approve ${token.symbol}`} state={approveToken.state} onClick={sendApprove(approveToken, token.address, tokenRaw!, tokenAllowance.refetch)} />
        ) : ready && needUsdgApproval ? (
          <TxButton label="Approve USDG" state={approveUsdg.state} onClick={sendApprove(approveUsdg, network.usdg, usdgRaw!, usdgAllowance.refetch)} />
        ) : (
          <TxButton label="Launch pool" state={launch.state} disabled={!ready} onClick={doLaunch} />
        )}
      </div>
    </div>
  );
}
