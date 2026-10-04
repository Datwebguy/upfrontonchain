"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#for-you", label: "For you" },
  { href: "/#faq", label: "FAQ" },
];

/** Sticky top bar: Bone, with a hairline border once the page scrolls (DESIGN.md §3). */
export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-bone/95 backdrop-blur-sm transition-colors ${scrolled ? "border-b border-line" : "border-b border-transparent"}`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-bone"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Upfront home" className="rounded">
          <Logo size={30} animated tone="ink" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] font-medium text-graphite transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <ButtonLink href="/app" variant="ink" className="!px-4 !py-2.5">
          Open app
        </ButtonLink>
      </div>
    </header>
  );
}
