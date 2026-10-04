import type { Metadata } from "next";
import { TradeList } from "@/components/app/TradeViews";

export const metadata: Metadata = { title: "Trade" };

export default function Page() {
  return <TradeList />;
}
