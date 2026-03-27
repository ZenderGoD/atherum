/**
 * Atherum — Rate Limiter Configuration
 *
 * Configures three rate limit tiers:
 * - Per-workspace: max 100 reviews/hour
 * - Per-review: max 30 LLM calls (10 agents x 3 rounds)
 * - Global: max 1000 LLM calls/hour
 */

import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Per-workspace: max 100 reviews per hour
  workspaceReviews: {
    kind: "fixed window",
    rate: 100,
    period: HOUR,
  },

  // Per-review: max 30 LLM calls (10 agents x 3 rounds)
  reviewLlmCalls: {
    kind: "token bucket",
    rate: 30,
    period: HOUR,
    capacity: 30,
  },

  // Global: max 1000 LLM calls per hour across all reviews
  globalLlmCalls: {
    kind: "token bucket",
    rate: 1000,
    period: HOUR,
    capacity: 1000,
    shards: 10,
  },
});
