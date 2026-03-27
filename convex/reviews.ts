import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";

// ─── Public Mutations (called from httpAction) ─────────────────────────────

export const createReview = mutation({
  args: {
    reviewId: v.string(),
    sessionId: v.string(),
    contentDescription: v.string(),
    contentType: v.string(),
    imageUrl: v.optional(v.string()),
    agentCount: v.number(),
    maxRounds: v.number(),
    callbackUrl: v.optional(v.string()),
    callbackSecret: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reviews", {
      ...args,
      status: "pending",
      startedAt: Date.now(),
    });
  },
});

// ─── Internal Mutations (called from actions) ──────────────────────────────

export const updateReviewStatus = internalMutation({
  args: {
    reviewId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db
      .query("reviews")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .unique();
    if (!review) return;
    await ctx.db.patch(review._id, {
      status: args.status,
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.completedAt !== undefined ? { completedAt: args.completedAt } : {}),
    });
  },
});

export const saveAgents = internalMutation({
  args: {
    reviewId: v.string(),
    agents: v.array(
      v.object({
        agentId: v.string(),
        name: v.string(),
        reasoningStyle: v.string(),
        persona: v.string(),
        confidence: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const agent of args.agents) {
      await ctx.db.insert("reviewAgents", {
        reviewId: args.reviewId,
        ...agent,
      });
    }
  },
});

export const saveRound = internalMutation({
  args: {
    reviewId: v.string(),
    roundNumber: v.number(),
    convergenceScore: v.number(),
    summary: v.optional(v.string()),
    responses: v.array(
      v.object({
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
    ),
  },
  handler: async (ctx, args) => {
    // Save round metadata
    await ctx.db.insert("rounds", {
      reviewId: args.reviewId,
      roundNumber: args.roundNumber,
      convergenceScore: args.convergenceScore,
      summary: args.summary,
      completedAt: Date.now(),
    });
    // Save each agent response
    for (const response of args.responses) {
      await ctx.db.insert("responses", {
        reviewId: args.reviewId,
        roundNumber: args.roundNumber,
        ...response,
      });
    }
  },
});

export const saveResult = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("results", args);
  },
});

// ─── Public Queries (called from httpAction and ask action) ────────────────

export const getReview = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .unique();
  },
});

export const getReviewAgents = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewAgents")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});

export const getReviewRounds = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rounds")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});

export const getReviewResponses = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("responses")
      .withIndex("by_reviewId_round", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});

export const getResult = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("results")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .unique();
  },
});

// Full transcript for /ask endpoint
export const getFullTranscript = query({
  args: { reviewId: v.string() },
  handler: async (ctx, args) => {
    const review = await ctx.db
      .query("reviews")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .unique();
    if (!review) return null;

    const agents = await ctx.db
      .query("reviewAgents")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .collect();

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .collect();

    const responses = await ctx.db
      .query("responses")
      .withIndex("by_reviewId_round", (q) => q.eq("reviewId", args.reviewId))
      .collect();

    const result = await ctx.db
      .query("results")
      .withIndex("by_reviewId", (q) => q.eq("reviewId", args.reviewId))
      .unique();

    return {
      review,
      agents,
      rounds: rounds.map((round) => ({
        ...round,
        responses: responses.filter((r) => r.roundNumber === round.roundNumber),
      })),
      result,
    };
  },
});
