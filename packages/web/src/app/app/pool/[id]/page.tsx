import type { Metadata } from "next";
import { PoolView } from "@/components/app/PoolView";

export const metadata: Metadata = { title: "Pool" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PoolView id={id} />;
}
