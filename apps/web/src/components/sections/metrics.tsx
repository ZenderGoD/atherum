"use client";

import { FadeIn, StaggerContainer, StaggerItem } from "@/components/motion-wrapper";

const metrics = [
  {
    value: "10",
    label: "agents per review",
    description: "Diverse AI personas evaluating every submission",
  },
  {
    value: "3",
    label: "rounds of deliberation",
    description: "Iterative convergence for deeper consensus",
  },
  {
    value: "16s",
    label: "average response",
    description: "Full multi-agent review in under 20 seconds",
  },
  {
    value: "0.96",
    label: "convergence score",
    description: "High agreement across independent evaluators",
  },
];

export function Metrics() {
  return (
    <section
      className="relative px-6 py-24 lg:py-32"
      style={{ backgroundColor: "oklch(0.11 0.006 270)" }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              Performance
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for production
            </h2>
          </div>
        </FadeIn>

        <StaggerContainer
          className="mt-16 flex flex-wrap items-start justify-center"
          staggerDelay={0.1}
        >
          {metrics.map((metric, i) => (
            <StaggerItem key={metric.label}>
              <div className="flex items-start">
                <div className="px-6 py-4 text-center sm:px-10 lg:px-14">
                  <div className="gradient-text text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
                    {metric.value}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">
                    {metric.label}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[160px] mx-auto">
                    {metric.description}
                  </p>
                </div>
                {/* Vertical divider between items */}
                {i < metrics.length - 1 && (
                  <div className="hidden h-24 w-px self-center bg-border/30 sm:block" />
                )}
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
