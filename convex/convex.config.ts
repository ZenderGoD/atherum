import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import crons from "@convex-dev/crons/convex.config.js";
import llmCache from "@mzedstudio/llm-cache/convex.config.js";

const app = defineApp();

// Agent component — manages threads, messages, and agent state
app.use(agent);

// Rate limiter — per-workspace, per-review, and global LLM call limits
app.use(rateLimiter);

// Workpool — bounded concurrency for LLM calls (max 5 parallel)
app.use(workpool, { name: "llmPool" });

// Crons — dynamic cron registration for agent roster refresh
app.use(crons);

// LLM Cache — deduplicates identical LLM requests
app.use(llmCache, { name: "llmCache" });

export default app;
