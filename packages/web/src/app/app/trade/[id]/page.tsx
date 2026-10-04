import type { Metadata } from "next";
import { TradeView } from "@/components/app/TradeViews";

export const metadata: Metadata = { title: "Trade" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TradeView id={id} />;
}
