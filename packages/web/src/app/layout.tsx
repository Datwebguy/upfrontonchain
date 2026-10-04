import type { Metadata, Viewport } from "next";
import { Manrope, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { QueryProvider } from "@/components/QueryProvider";
import "./globals.css";

// Fonts are self-hosted by next/font: no request to Google when someone visits (DESIGN.md §1, AGENTS.md §7).
const display = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Upfront: every trade in your pool pays you", template: "%s · Upfront" },
  description: "Every trade in your pool pays you. And you can get those earnings upfront. Built on Robinhood Chain, paid in USDG.",
  applicationName: "Upfront",
};

export const viewport: Viewport = {
  themeColor: "#f3efe6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
