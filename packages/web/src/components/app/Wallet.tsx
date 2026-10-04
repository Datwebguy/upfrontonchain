"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { chain, network } from "@/lib/network";
import { shortAddress } from "@/lib/format";
import { useEthBalance, useUsdgBalance } from "@/lib/contracts";
import { links } from "@config/networks";

/** Connect, or the connected address with a way to disconnect. */
export function ConnectButton({ variant = "ink" }: { variant?: "ink" | "signal" }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <details className="relative">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          <WalletIcon size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="num">{shortAddress(address)}</span>
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-border bg-card p-1 shadow-lg">
          <button onClick={() => disconnect()} className="w-full rounded-lg px-3 py-2 text-left text-[14px] hover:bg-fg/5">
            Disconnect
          </button>
        </div>
      </details>
    );
  }

  const connector = connectors[0];
  return (
    <Button variant={variant} onClick={() => connector && connect({ connector, chainId: chain.id })} disabled={isPending || !connector}>
      {isPending ? "Confirm in your wallet" : "Connect"}
    </Button>
  );
}

/** One banner when the wallet is on another network. Nothing else is blocked visually. */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === chain.id) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-signal px-4 py-3 text-ink">
      <p className="text-[15px] font-semibold">Switch to {network.name}</p>
      <Button variant="ink" className="!px-4 !py-2" onClick={() => switchChain({ chainId: chain.id })} disabled={isPending}>
        {isPending ? "Confirm in your wallet" : "Switch"}
      </Button>
    </div>
  );
}

/** On testnet, a card with faucet links when there is no ETH or no USDG to work with. */
export function FaucetCard() {
  const { address, isConnected, chainId } = useAccount();
  const eth = useEthBalance(address);
  const usdg = useUsdgBalance(address);
  if (!isConnected || chainId !== chain.id || network.faucetUrl === null) return null;
  if (eth.data === undefined || usdg.data === undefined) return null;
  const noEth = eth.data.value === 0n;
  const noUsdg = usdg.data === 0n;
  if (!noEth && !noUsdg) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold">{noEth && noUsdg ? "You need test ETH and test USDG" : noEth ? "You need test ETH for network fees" : "You need test USDG"}</p>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
        {noEth ? (
          <a href={network.faucetUrl} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
            Get test ETH ↗
          </a>
        ) : null}
        {noUsdg ? (
          <a href={links.paxosFaucet} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
            Get test USDG ↗
          </a>
        ) : null}
      </p>
    </div>
  );
}
