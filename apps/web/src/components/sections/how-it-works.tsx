"use client";

import { FadeIn, StaggerContainer, StaggerItem } from "@/components/motion-wrapper";

const steps = [
  {
    step: "01",
    title: "Submit Content",
    description:
      "Send your image, text, or campaign asset via a single API call. Supports URLs, base64, and multipart uploads.",
  },
  {
    step: "02",
    title: "Agents Deliberate",
    description:
      "10 specialized AI personas analyze your content from different angles, debate trade-offs, and converge through structured deliberation rounds.",
  },
  {
    step: "03",
    title: "Get Verdict",
    description:
      "Receive a structured response with approval scores, per-agent reasoning, points of agreement, dissenting opinions, and actionable suggestions.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative px-6 py-24 lg:py-32"
      style={{ backgroundColor: "oklch(0.11 0.006 270)" }}
    >
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to collective intelligence
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Replace single-model reviews with multi-agent deliberation. Get
              richer feedback in seconds.
            </p>
          </div>
        </FadeIn>

        <StaggerContainer className="mt-20 space-y-0" staggerDelay={0.15}>
          {steps.map((step, i) => (
            <StaggerItem key={step.step}>
              <div className="group relative grid grid-cols-[auto_1fr] gap-x-8 gap-y-0 py-10 sm:gap-x-12 md:grid-cols-[80px_1fr]">
                {/* Left: step number */}
                <div className="flex flex-col items-center">
                  <span className="gradient-text text-5xl font-bold tracking-tighter sm:text-6xl">
                    {step.step}
                  </span>
                </div>

                {/* Right: content */}
                <div className="pt-1">
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>

                {/* Divider line (not on last) */}
                {i < steps.length - 1 && (
                  <div className="col-span-2 mt-10 h-px w-full bg-gradient-to-r from-border/60 via-border/30 to-transparent md:col-span-2" />
                )}
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
