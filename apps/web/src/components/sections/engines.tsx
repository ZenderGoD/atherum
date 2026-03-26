"use client";

import { FadeIn, StaggerContainer, StaggerItem } from "@/components/motion-wrapper";
import { Sparkles, Globe, Network, FileText } from "lucide-react";

const engines = [
  {
    icon: Sparkles,
    name: "Mirage",
    tagline: "Multi-agent swarm deliberation",
    description:
      "Orchestrates 10+ AI personas through structured rounds of analysis, debate, and convergence. Each agent brings a unique evaluative lens to your content.",
    color: "oklch(0.7 0.18 265)",
  },
  {
    icon: Globe,
    name: "OASIS",
    tagline: "Social media simulation",
    description:
      "Generates synthetic social environments to predict how content performs before publishing. Simulates engagement patterns, virality potential, and audience reception.",
    color: "oklch(0.65 0.15 200)",
  },
  {
    icon: Network,
    name: "Atlas",
    tagline: "Knowledge graph construction",
    description:
      "Builds dynamic knowledge graphs from deliberation outputs. Maps relationships between concepts, sentiments, and evaluative criteria across reviews.",
    color: "oklch(0.65 0.2 300)",
  },
  {
    icon: FileText,
    name: "Scribe",
    tagline: "Intelligent report generation",
    description:
      "Synthesizes multi-agent deliberation into structured, human-readable reports. Extracts key insights, patterns, and actionable recommendations.",
    color: "oklch(0.7 0.15 150)",
  },
];

export function Engines() {
  return (
    <section id="engines" className="relative px-6 py-24 lg:py-32">
      {/* Top divider */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              Engines
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Four engines, one platform
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Each engine powers a different dimension of collective intelligence,
              from real-time deliberation to long-term knowledge synthesis.
            </p>
          </div>
        </FadeIn>

        <StaggerContainer className="mt-20 space-y-0" staggerDelay={0.12}>
          {engines.map((engine, i) => (
            <StaggerItem key={engine.name}>
              <div className="group grid grid-cols-1 gap-4 py-10 sm:grid-cols-[auto_1fr] sm:gap-8">
                {/* Icon + name block */}
                <div className="flex items-start gap-4 sm:flex-col sm:items-center sm:gap-3 sm:w-28">
                  <engine.icon
                    className="h-6 w-6 shrink-0"
                    style={{ color: engine.color }}
                  />
                  <h3
                    className="text-xl font-bold tracking-tight sm:text-center"
                    style={{ color: engine.color }}
                  >
                    {engine.name}
                  </h3>
                </div>

                {/* Description block */}
                <div>
                  <p className="text-sm font-medium text-foreground/80">
                    {engine.tagline}
                  </p>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {engine.description}
                  </p>
                </div>

                {/* Divider (not on last) */}
                {i < engines.length - 1 && (
                  <div className="col-span-full mt-2 h-px w-full bg-gradient-to-r from-border/50 via-border/20 to-transparent" />
                )}
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
