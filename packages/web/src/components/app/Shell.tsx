"use client";

import { ArrowLeftRight, House, Landmark, Rocket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Mark } from "@/components/Logo";
import { NetworkBanner, ConnectButton, FaucetCard } from "./Wallet";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/app", label: "Home", icon: House, match: (p: string) => p === "/app" || p.startsWith("/app/pool") },
  { href: "/app/launch", label: "Launch", icon: Rocket, match: (p: string) => p.startsWith("/app/launch") },
  { href: "/app/trade", label: "Trade", icon: ArrowLeftRight, match: (p: string) => p.startsWith("/app/trade") },
  { href: "/app/lend", label: "Lend", icon: Landmark, match: (p: string) => p.startsWith("/app/lend") },
] as const;

/**
 * The app frame (DESIGN.md §4): a left sidebar on desktop and a bottom tab bar on mobile, with the wallet and network
 * at the top right.
 */
export function Shell({ children, theme }: { children: React.ReactNode; theme: "light" | "dark" | "system" }) {
  const path = usePathname();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-border md:block">
        <div className="sticky top-0 flex h-svh flex-col px-5 py-6">
          <Link href="/" aria-label="Upfront website" className="rounded">
            <Logo size={30} animated />
          </Link>
          <nav aria-label="App" className="mt-10 flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon, match }) => {
              const active = match(path);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${active ? "bg-fg text-bg" : "text-muted hover:bg-fg/5 hover:text-fg"}`}
                >
                  <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-24 md:pb-0">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" aria-label="Upfront website" className="md:hidden">
            <Mark size={30} animated />
          </Link>
          <span className="hidden md:block" />
          <div className="flex items-center gap-2">
            <ThemeToggle initial={theme} />
            <ConnectButton />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 pb-10 sm:px-8">
          <NetworkBanner />
          <FaucetCard />
          {children}
        </main>
      </div>

      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[12px] font-medium ${active ? "text-fg" : "text-muted"}`}
            >
              <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
