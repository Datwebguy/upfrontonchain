import type { Metadata } from "next";
import { LaunchView } from "@/components/app/LaunchView";

export const metadata: Metadata = { title: "Launch a pool" };

export default function Page() {
  return <LaunchView />;
}
