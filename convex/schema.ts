import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Workspaces (multi-tenancy) ─────────────────────────────────────
  workspaces: defineTable({
    name: v.string(),
    externalId: v.string(),
    brandContext: v.optional(
      v.object({
        brandName: v.string(),
        brandDescription: v.optional(v.string()),
        industry: v.optional(v.string()),
        targetAudiences: v.optional(v.array(v.string())),
        voiceGuidelines: v.optional(v.string()),
        customInstructions: v.optional(v.string()),
      })
    ),
    monthlyBudgetUsd: v.optional(v.number()),
    currentMonthSpendUsd: v.optional(v.number()),
    apiKeyHash: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_apiKeyHash", ["apiKeyHash"]),

  // ─── Personas (agent roster) ────────────────────────────────────────
  personas: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    archetype: v.string(),
    reasoningStyle: v.string(),
    persona: v.string(),
    expertiseDomains: v.array(v.string()),
    confidence: v.number(),
    isGlobal: v.boolean(),
    generatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_global_active", ["isGlobal", "expiresAt"])
    .index("by_workspace", ["workspaceId"]),

  // ─── Reviews ────────────────────────────────────────────────────────
  reviews: defineTable({
    reviewId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    sessionId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    contentDescription: v.string(),
    contentType: v.string(),
    imageUrl: v.optional(v.string()),
    agentCount: v.number(),
    maxRounds: v.number(),
    // Webhook config
    callbackUrl: v.optional(v.string()),
    callbackSecret: v.optional(v.string()),
    // Metadata from caller
    metadata: v.optional(v.any()),
    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    // Error
    error: v.optional(v.string()),
  })
    .index("by_reviewId", ["reviewId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_sessionId", ["sessionId"]),

  // ─── Agents (per review) ────────────────────────────────────────────
  reviewAgents: defineTable({
    reviewId: v.string(),
    agentId: v.string(),
    name: v.string(),
    reasoningStyle: v.string(),
    persona: v.string(),
    confidence: v.number(),
  }).index("by_reviewId", ["reviewId"]),

  // ─── Deliberation Rounds ────────────────────────────────────────────
  rounds: defineTable({
    reviewId: v.string(),
    roundNumber: v.number(),
    convergenceScore: v.number(),
    summary: v.optional(v.string()),
    completedAt: v.number(),
  })
    .index("by_reviewId", ["reviewId"])
    .index("by_reviewId_round", ["reviewId", "roundNumber"]),

  // ─── Agent Responses (per round) ────────────────────────────────────
  responses: defineTable({
    reviewId: v.string(),
    roundNumber: v.number(),
    agentId: v.string(),
    agentName: v.string(),
    reasoningStyle: v.string(),
    stance: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    keyFactors: v.array(v.string()),
    dissentPoints: v.array(v.string()),
    influencedBy: v.optional(v.string()),
  })
    .index("by_reviewId_round", ["reviewId", "roundNumber"])
    .index("by_reviewId_agent", ["reviewId", "agentId"]),

  // ─── Review Results (final verdict) ─────────────────────────────────
  results: defineTable({
    reviewId: v.string(),
    winningPosition: v.string(),
    convergenceScore: v.number(),
    confidence: v.number(),
    consensusSummary: v.string(),
    keyAgreements: v.array(v.string()),
    remainingDissent: v.array(v.string()),
    minorityReport: v.string(),
    approvalScore: v.number(),
    quickSummary: v.string(),
    roundsTaken: v.number(),
    participantCount: v.number(),
    agentJourneys: v.array(
      v.object({
        agentId: v.string(),
        agentName: v.string(),
        reasoningStyle: v.string(),
        finalStance: v.string(),
        totalStanceChanges: v.number(),
        consistencyScore: v.number(),
        positions: v.array(
          v.object({
            round: v.number(),
            stance: v.string(),
            confidence: v.number(),
          })
        ),
      })
    ),
  }).index("by_reviewId", ["reviewId"]),

  // ─── Cost Events ────────────────────────────────────────────────────
  costEvents: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    reviewId: v.string(),
    engine: v.string(),
    operation: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  })
    .index("by_reviewId", ["reviewId"])
    .index("by_workspace", ["workspaceId"]),

  // ─── Audit Log ──────────────────────────────────────────────────────
  auditLog: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    reviewId: v.optional(v.string()),
    event: v.string(),
    actor: v.string(),
    payload: v.optional(v.any()),
  })
    .index("by_reviewId", ["reviewId"])
    .index("by_workspace", ["workspaceId"]),
});
