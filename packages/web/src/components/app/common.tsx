"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, type Address } from "viem";
import { ButtonLink } from "@/components/ui";
import { ConnectButton } from "./Wallet";
import { contracts } from "@/lib/contracts";
import { formatUsdg, shortAddress } from "@/lib/format";
import { network } from "@/lib/network";

export function Card({ children, className = "", as: Tag = "section" }: { children: React.ReactNode; className?: string; as?: "section" | "div" }) {
  return <Tag className={`rounded-2xl border border-border bg-card p-5 sm:p-6 ${className}`}>{children}</Tag>;
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">{children}</h1>
      {aside}
    </div>
  );
}

/** A big number: Geist Mono with tabular figures, 40px (DESIGN.md §1). */
export function BigNumber({ value, unit = "USDG" }: { value: bigint | string; unit?: string }) {
  return (
    <p className="num text-[40px] font-medium leading-none tracking-tight">
      {formatUsdg(value)} <span className="text-[16px] text-muted">{unit}</span>
    </p>
  );
}

/** Honest empty state: says there is nothing, and offers the next action. */
export function Empty({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div className="py-6">
      <p className="text-muted">{title}</p>
      {action ? (
        <ButtonLink href={action.href} variant="signal" className="mt-4">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/** Shown when Upfront's contracts aren't deployed on this network yet. Nothing is faked. */
export function NotLive() {
  return (
    <Card>
      <h2 className="text-[17px] font-semibold">Upfront isn&apos;t live on {network.name} yet</h2>
      <p className="mt-1 text-muted">Pools, trading and lending open here as soon as the contracts are deployed.</p>
    </Card>
  );
}

/** The one card on first visit: connect to get started. */
export function ConnectCard({ what = "launch, trade or lend" }: { what?: string }) {
  return (
    <Card>
      <h2 className="text-[17px] font-semibold">Connect your wallet to {what}</h2>
      <div className="mt-4">
        <ConnectButton variant="signal" />
      </div>
    </Card>
  );
}

/** Wraps a screen that needs the contracts and a connected wallet, with the right honest state when it has neither. */
export function NeedsWallet({ what, children }: { what?: string; children: (account: Address) => React.ReactNode }) {
  const { address, isConnected } = useAccount();
  if (!contracts) return <NotLive />;
  if (!isConnected || !address) return <ConnectCard {...(what ? { what } : {})} />;
  return <>{children(address)}</>;
}

/** A token's symbol, read from the token itself. A short address while it loads. */
export function useTokenInfo(token?: Address) {
  const base = { address: token, abi: erc20Abi, query: { enabled: !!token, staleTime: 3_600_000 } } as const;
  const symbol = useReadContract({ ...base, functionName: "symbol" });
  const name = useReadContract({ ...base, functionName: "name" });
  const decimals = useReadContract({ ...base, functionName: "decimals" });
  return { symbol: symbol.data, name: name.data, decimals: decimals.data };
}

export function TokenSymbol({ token }: { token?: string | null }) {
  const { symbol } = useTokenInfo(token ? (token as Address) : undefined);
  if (!token) return <span className="skeleton inline-block h-4 w-12 align-middle" />;
  return <span>{symbol ?? shortAddress(token)}</span>;
}

/** A round monogram for tokens that have no logo. Real logos are used wherever the data has one. */
export function TokenMark({ symbol, logo, size = 36 }: { symbol: string; logo?: string | null; size?: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} className="rounded-full bg-border object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-fg text-[13px] font-semibold text-bg">
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PoolLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link href={`/app/pool/${id}`} className="underline underline-offset-2">
      {children}
    </Link>
  );
}
