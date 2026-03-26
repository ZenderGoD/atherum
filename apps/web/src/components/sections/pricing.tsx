"use client";

import { FadeIn } from "@/components/motion-wrapper";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For experimentation and evaluation",
    features: [
      "50 reviews / month",
      "3 agents per review",
      "2 deliberation rounds",
      "JSON responses",
      "Community support",
    ],
    cta: "Start Free",
    variant: "outline" as const,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For teams shipping content at scale",
    features: [
      "Unlimited reviews",
      "10 agents per review",
      "3 deliberation rounds",
      "Webhook callbacks",
      "Custom persona config",
      "Priority support",
    ],
    cta: "Get Pro",
    variant: "default" as const,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Advanced requirements",
    features: [
      "Everything in Pro",
      "OASIS simulation",
      "Dedicated personas",
      "Atlas knowledge graphs",
      "99.9% SLA",
      "SSO and audit logs",
    ],
    cta: "Contact Sales",
    variant: "outline" as const,
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      className="relative px-6 py-24 lg:py-32"
      style={{ backgroundColor: "oklch(0.12 0.005 75)" }}
    >
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Start free, scale as you grow
          </h2>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 gap-16 sm:grid-cols-3 sm:gap-12">
          {tiers.map((tier, i) => (
            <FadeIn key={tier.name} delay={i * 0.08}>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {tier.name}
                </p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tier.description}
                </p>

                <div className="mt-6">
                  <Button variant={tier.variant} size="sm">
                    {tier.cta}
                  </Button>
                </div>

                <ul className="mt-8 space-y-3">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
