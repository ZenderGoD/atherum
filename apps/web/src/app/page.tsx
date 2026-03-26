import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/sections/hero";
import { CodeExample } from "@/components/sections/code-example";
import { Capabilities } from "@/components/sections/capabilities";
import { Pricing } from "@/components/sections/pricing";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <CodeExample />
        <Capabilities />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
