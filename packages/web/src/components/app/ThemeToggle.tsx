"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

type Theme = "light" | "dark" | "system";
const COOKIE = "upfront-theme";

/** Light or dark. The choice is kept in a cookie so the server draws the right one and nothing flashes. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const effective = (): "light" | "dark" =>
    theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;

  const toggle = () => {
    const next = effective() === "dark" ? "light" : "dark";
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector("[data-app-theme]")?.setAttribute("data-theme", next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Switch between light and dark"
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-fg hover:bg-fg/5"
    >
      <Sun size={18} strokeWidth={1.75} aria-hidden="true" className="hidden dark-visible" />
      <Moon size={18} strokeWidth={1.75} aria-hidden="true" className="dark-hidden" />
    </button>
  );
}
