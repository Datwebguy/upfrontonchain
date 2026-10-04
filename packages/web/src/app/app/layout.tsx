import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Providers } from "@/components/app/Providers";
import { Shell } from "@/components/app/Shell";

export const metadata: Metadata = { title: { default: "App", template: "%s · Upfront" } };

type Theme = "light" | "dark" | "system";

/** The app: light and dark themes, drawn on the server from a cookie so nothing flashes. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get("upfront-theme")?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "system";

  return (
    <div data-app-theme data-theme={theme} className="app-shell min-h-svh bg-bg text-fg">
      <Providers>
        <Shell theme={theme}>{children}</Shell>
      </Providers>
    </div>
  );
}
