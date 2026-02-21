import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { MarketsSection } from "@/components/MarketsSection";
import { HowItWorks } from "@/components/HowItWorks";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <div id="markets">
        <MarketsSection />
      </div>
      <HowItWorks />
      <CTASection />
      <Footer />
    </div>
  );
}
