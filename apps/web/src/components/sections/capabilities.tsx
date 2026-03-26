"use client";

import { FadeIn } from "@/components/motion-wrapper";

const engines = [
  {
    name: "Mirage",
    what: "Multi-agent swarm deliberation",
    detail:
      "Orchestrates 10+ AI personas through structured rounds of analysis, debate, and convergence. Each agent brings a unique evaluative lens.",
  },
  {
    name: "OASIS",
    what: "Social media simulation",
    detail:
      "Predicts how content performs before publishing. Simulates engagement patterns, virality potential, and audience reception across platforms.",
  },
  {
    name: "Atlas",
    what: "Knowledge graph construction",
    detail:
      "Builds dynamic knowledge graphs from deliberation outputs. Maps relationships between concepts, sentiments, and evaluative criteria.",
  },
  {
    name: "Scribe",
    what: "Intelligent report generation",
    detail:
      "Synthesizes multi-agent deliberation into structured, actionable reports with key insights and recommendations.",
  },
];

const platform = [
  {
    name: "Mnemosyne",
    what: "Persistent agent memory",
    detail:
      "Agents remember across sessions. They extract procedural knowledge from every interaction — learning what works for your brand, your audience, your market.",
  },
  {
    name: "Strata",
    what: "Tiered context loading",
    detail:
      "Three layers of context: L0 is the current content, L1 is recent brand preferences and review history, L2 is full workspace history loaded on demand. Agents stay sharp without drowning in data.",
  },
  {
    name: "Aegis",
    what: "Cost governance",
    detail:
      "Every LLM call is tracked. Budgets enforced at session, workspace, and monthly levels. You always know what a deliberation costs before it runs.",
  },
  {
    name: "Nexus",
    what: "Shared collective memory",
    detail:
      "A knowledge graph shared across all agents in a workspace. Insights from every review accumulate into a living map of your brand's creative intelligence.",
  },
  {
    name: "Prometheus",
    what: "Skill acquisition",
    detail:
      "Agents discover they need new capabilities mid-deliberation and acquire them. Need current Instagram trends? A Prometheus-enabled agent triggers a web search and incorporates the findings.",
  },
  {
    name: "Crucible",
    what: "Quality benchmarking",
    detail:
      "Measure whether 10 agents actually produce better output than 1. Red-team for biases and groupthink. Regression-test agent roster changes against historical quality.",
  },
  {
    name: "Agora",
    what: "Human-in-the-loop",
    detail:
      "Your team joins the agent panel as equal participants. A brand manager deliberates alongside 10 AI personas, steering the conversation with domain knowledge no model has.",
  },
];

const products = [
  { name: "Content Review Panels", line: "Multi-agent content evaluation with structured verdicts" },
  { name: "Living Personas", line: "Persistent AI personas that evolve with your brand" },
  { name: "Campaign Colosseum", line: "Pit campaign variants against each other in simulated markets" },
  { name: "War Room", line: "Real-time crisis simulation and response planning" },
  { name: "Trend Forge", line: "Predict emerging trends from synthetic social signals" },
  { name: "Echo Chamber", line: "Model information spread and opinion formation" },
  { name: "Consensus Engine", line: "Find agreement across divergent perspectives" },
  { name: "Sentinel", line: "Continuous brand monitoring through synthetic listening" },
  { name: "Replay", line: "Re-run deliberations with updated personas or criteria" },
  { name: "Symposium", line: "Synthetic focus groups — replace $50K panels with on-demand AI audiences" },
  { name: "Arena", line: "Pre-publication A/B testing — predict which variant wins before spending" },
  { name: "Archetype", line: "Generate audience personas from your real customer data" },
  { name: "Augur", line: "Forward-looking sentiment prediction — know how people will feel, not just how they felt" },
];

const outcomes = [
  { before: "$10K\u201350K", after: "~$100", what: "per focus group" },
  { before: "2 weeks", after: "2 hours", what: "time to insight" },
  { before: "1 segment", after: "50 segments", what: "simultaneously" },
  { before: "Backward-looking", after: "Predictive", what: "sentiment analysis" },
];

export function Capabilities() {
  return (
    <section id="capabilities" className="relative px-6 py-24 lg:py-32">
      <div className="mx-auto max-w-4xl">

        {/* Engines */}
        <FadeIn>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Engines
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Four engines, one platform
          </h2>
        </FadeIn>

        <div className="mt-16 space-y-0">
          {engines.map((engine, i) => (
            <FadeIn key={engine.name} delay={i * 0.08}>
              <div className="py-8">
                <div className="flex items-baseline gap-4">
                  <h3 className="text-xl font-semibold tracking-tight accent-text">
                    {engine.name}
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {engine.what}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {engine.detail}
                </p>
              </div>
              {i < engines.length - 1 && (
                <div className="h-px w-full bg-border/40" />
              )}
            </FadeIn>
          ))}
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-border/40" />

        {/* Platform Capabilities */}
        <FadeIn>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Platform
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            What makes it different
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Not just another agent framework. These are the primitives that turn
            multi-agent orchestration into genuine collective intelligence.
          </p>
        </FadeIn>

        <div className="mt-16 space-y-0">
          {platform.map((cap, i) => (
            <FadeIn key={cap.name} delay={i * 0.06}>
              <div className="py-7">
                <div className="flex items-baseline gap-4">
                  <h3 className="text-lg font-semibold tracking-tight accent-text">
                    {cap.name}
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {cap.what}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {cap.detail}
                </p>
              </div>
              {i < platform.length - 1 && (
                <div className="h-px w-full bg-border/30" />
              )}
            </FadeIn>
          ))}
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-border/40" />

        {/* Products */}
        <FadeIn>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Products
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            13 products, one API
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Each product composes the engines and platform capabilities into a
            specific workflow. Use them standalone or chain them together.
          </p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-y-0 sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-12">
          {products.map((product, i) => (
            <FadeIn key={product.name} delay={i * 0.03}>
              <div className="border-b border-border/20 py-5 sm:border-b-0">
                <p className="text-sm font-semibold text-foreground">
                  {product.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {product.line}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-border/40" />

        {/* Outcomes */}
        <FadeIn>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Impact
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            What changes
          </h2>
        </FadeIn>

        <div className="mt-12 space-y-0">
          {outcomes.map((outcome, i) => (
            <FadeIn key={outcome.what} delay={i * 0.08}>
              <div className="flex items-baseline gap-6 py-6 sm:gap-10">
                <div className="min-w-[100px] shrink-0 text-right sm:min-w-[140px]">
                  <p className="text-sm text-muted-foreground/50 line-through decoration-muted-foreground/20">
                    {outcome.before}
                  </p>
                </div>
                <div className="min-w-[100px] shrink-0 sm:min-w-[140px]">
                  <p className="text-lg font-bold tracking-tight text-foreground">
                    {outcome.after}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {outcome.what}
                </p>
              </div>
              {i < outcomes.length - 1 && (
                <div className="h-px w-full bg-border/30" />
              )}
            </FadeIn>
          ))}
        </div>

        {/* Divider */}
        <div className="my-24 h-px w-full bg-border/40" />

        {/* Metrics */}
        <FadeIn>
          <div className="flex flex-wrap justify-between gap-y-8">
            {[
              { value: "10", label: "agents per review" },
              { value: "3", label: "deliberation rounds" },
              { value: "16s", label: "average response" },
              { value: "0.96", label: "convergence score" },
            ].map((metric) => (
              <div key={metric.label} className="min-w-[120px]">
                <p className="text-4xl font-bold tracking-tight text-foreground">
                  {metric.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
