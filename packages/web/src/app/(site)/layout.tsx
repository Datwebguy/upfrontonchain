import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

/** The website: always light, always Bone (DESIGN.md §1). The app has its own layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bone text-ink">
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
