import type { Metadata } from "next";
import { Home } from "@/components/app/Home";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <Home />;
}
