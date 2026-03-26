"use client";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion-wrapper";
import { motion } from "motion/react";
import { ArrowRight, ExternalLink } from "lucide-react";

const agents = [
  "Brand Strategist",
  "Art Director",
  "Consumer Psychologist",
  "Cultural Analyst",
  "Copy Editor",
  "Data Scientist",
  "Ethics Reviewer",
  "Gen-Z Lens",
  "Market Researcher",
  "Creative Director",
];

function AgentConvergence() {
  return (
    <div className="relative mx-auto mt-16 max-w-3xl lg:mt-20">
      <div className="flex flex-col items-center gap-0">
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          {agents.map((name, i) => (
            <motion.span
              key={name}
              className="text-sm font-medium whitespace-nowrap text-muted-foreground/70 sm:text-base"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.5 + i * 0.08,
                duration: 0.5,
                ease: [0.21, 0.47, 0.32, 0.98],
              }}
            >
              {name}
              {i < agents.length - 1 && (
                <span className="ml-1 text-muted-foreground/20">/</span>
              )}
            </motion.span>
          ))}
        </div>

        <motion.div
          className="my-6 flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
        >
          <div className="h-10 w-px bg-gradient-to-b from-primary/40 to-primary/10" />
          <motion.div
            className="h-2 w-2 rounded-full bg-primary"
            animate={{ opacity: [1, 0.4, 1], scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="h-4 w-px bg-gradient-to-b from-primary/10 to-transparent" />
        </motion.div>

        <motion.p
          className="text-sm font-medium tracking-wide text-muted-foreground/50 uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 0.6 }}
        >
          Converging on verdict
        </motion.p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden px-6 pt-32 pb-20 lg:pt-40">
      <div className="relative mx-auto max-w-5xl text-center">
        <FadeIn delay={0}>
          <div className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now in public beta
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl leading-[1.1]">
            Collective Intelligence{" "}
            <span className="accent-text">Engine</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            10 AI agents deliberate on your content. One API call.
          </p>
        </FadeIn>

        <FadeIn delay={0.4}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="group min-w-[160px]">
              Get API Key
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button variant="outline" size="lg" className="min-w-[160px]">
              View Docs
              <ExternalLink className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </FadeIn>

        <FadeIn delay={0.3}>
          <AgentConvergence />
        </FadeIn>
      </div>
    </section>
  );
}
