import { Faq } from "@/components/site/Faq";
import { FinalCall } from "@/components/site/FinalCall";
import { ForYou } from "@/components/site/ForYou";
import { Hero } from "@/components/site/Hero";
import { HonestFees } from "@/components/site/HonestFees";
import { HowItWorks } from "@/components/site/HowItWorks";
import { LiveStrip } from "@/components/site/LiveStrip";

export default function Home() {
  return (
    <>
      <Hero />
      <LiveStrip />
      <HowItWorks />
      <ForYou />
      <HonestFees />
      <Faq />
      <FinalCall />
    </>
  );
}
