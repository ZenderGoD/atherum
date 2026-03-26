"use client";

import { FadeIn, StaggerContainer, StaggerItem } from "@/components/motion-wrapper";
import {
  LayoutGrid,
  Users,
  Swords,
  Shield,
  TrendingUp,
  Radio,
  Scale,
  Eye,
  RotateCcw,
} from "lucide-react";

const products = [
  {
    icon: LayoutGrid,
    name: "Content Review Panels",
    tagline: "Multi-agent content evaluation with structured verdicts",
  },
  {
    icon: Users,
    name: "Living Personas",
    tagline: "Persistent AI personas that evolve with your brand context",
  },
  {
    icon: Swords,
    name: "Campaign Colosseum",
    tagline: "Pit campaign variants against each other in simulated markets",
  },
  {
    icon: Shield,
    name: "War Room",
    tagline: "Real-time crisis simulation and response planning",
  },
  {
    icon: TrendingUp,
    name: "Trend Forge",
    tagline: "Predict emerging trends from synthetic social signals",
  },
  {
    icon: Radio,
    name: "Echo Chamber",
    tagline: "Model information spread and opinion formation dynamics",
  },
  {
    icon: Scale,
    name: "Consensus Engine",
    tagline: "Find agreement points across divergent agent perspectives",
  },
  {
    icon: Eye,
    name: "Sentinel",
    tagline: "Continuous brand monitoring through synthetic social listening",
  },
  {
    icon: RotateCcw,
    name: "Replay",
    tagline: "Re-run past deliberations with updated personas or criteria",
  },
];

export function Products() {
  return (
    <section
      id="products"
      className="relative px-6 py-24 lg:py-32"
      style={{ backgroundColor: "oklch(0.11 0.006 270)" }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              Products
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for every use case
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Nine products that turn collective intelligence into competitive
              advantage across content, strategy, and brand management.
            </p>
          </div>
        </FadeIn>

        <StaggerContainer
          className="mt-16 grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3"
          staggerDelay={0.06}
        >
          {products.map((product, i) => (
            <StaggerItem key={product.name}>
              <div className="group flex items-start gap-4 px-2 py-5 transition-colors duration-200 hover:bg-white/[0.02]">
                <product.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary/70 transition-colors group-hover:text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {product.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {product.tagline}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
