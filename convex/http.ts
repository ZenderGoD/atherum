import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

// ---------------------------------------------------------------------------
// OPTIONS preflight for all routes
// ---------------------------------------------------------------------------

http.route({
  path: "/api/review",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

// ---------------------------------------------------------------------------
// POST /api/review — Start a content review
// ---------------------------------------------------------------------------

http.route({
  path: "/api/review",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    // Validate required fields
    const { content_description, content_type, metadata, review_id } = body;

    if (!content_description || typeof content_description !== "string") {
      return jsonResponse(
        { success: false, error: "content_description is required and must be a string" },
        400,
      );
    }

    if (!content_type || !["image", "video", "3d"].includes(content_type)) {
      return jsonResponse(
        { success: false, error: "content_type must be one of: image, video, 3d" },
        400,
      );
    }

    const imageUrl: string | undefined = body.image_url;
    const callbackUrl: string | undefined = body.callback_url;
    const callbackSecret: string | undefined = body.callback_secret;
    const maxRounds: number = typeof body.max_rounds === "number" ? body.max_rounds : 3;
    const agentCount: number = typeof body.agent_count === "number" ? body.agent_count : 10;
    const resolvedReviewId: string = review_id || crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    // Create review record in Convex
    await ctx.runMutation(api.reviews.createReview, {
      reviewId: resolvedReviewId,
      sessionId,
      contentDescription: content_description,
      contentType: content_type,
      imageUrl,
      agentCount,
      maxRounds,
      callbackUrl,
      callbackSecret,
      metadata,
    });

    // Schedule the deliberation action (runs in background)
    await ctx.scheduler.runAfter(0, internal.deliberate.runDeliberation, {
      reviewId: resolvedReviewId,
      sessionId,
      contentDescription: content_description,
      contentType: content_type,
      imageUrl,
      maxRounds,
      agentCount,
      callbackUrl,
      callbackSecret,
      metadata,
    });

    return jsonResponse(
      {
        success: true,
        data: {
          review_id: resolvedReviewId,
          session_id: sessionId,
        },
      },
      202,
    );
  }),
});

// ---------------------------------------------------------------------------
// GET /api/review/:reviewId/status — Poll for review status
//
// Convex httpRouter does not support path parameters, so we use a prefix
// route and parse the reviewId from the URL path manually.
// ---------------------------------------------------------------------------

http.route({
  pathPrefix: "/api/review/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Expected: ["api", "review", "<reviewId>", "status"]
    const reviewId = pathParts[2];
    const suffix = pathParts[3];

    if (!reviewId) {
      return jsonResponse({ success: false, error: "Missing reviewId" }, 400);
    }

    if (suffix !== "status") {
      return jsonResponse({ success: false, error: "Unknown endpoint" }, 404);
    }

    const review = await ctx.runQuery(api.reviews.getReview, { reviewId });

    if (!review) {
      return jsonResponse({ success: false, error: "Review not found" }, 404);
    }

    const agents = await ctx.runQuery(api.reviews.getReviewAgents, { reviewId });

    const responseData: any = {
      success: true,
      data: {
        review_id: review.reviewId,
        session_id: review.sessionId,
        status: review.status,
        created_at: new Date(review.startedAt).toISOString(),
        completed_at: review.completedAt ? new Date(review.completedAt).toISOString() : null,
        agents: agents.map((a) => ({
          agent_id: a.agentId,
          name: a.name,
          reasoning_style: a.reasoningStyle,
          persona: a.persona,
          confidence: a.confidence,
        })),
      },
    };

    if (review.status === "completed") {
      const result = await ctx.runQuery(api.reviews.getResult, { reviewId });
      if (result) {
        responseData.data.result = {
          review_id: review.reviewId,
          session_id: review.sessionId,
          status: "completed",
          decision: {
            winning_position: result.winningPosition,
            convergence_score: result.convergenceScore,
            confidence: result.confidence,
            consensus_summary: result.consensusSummary,
            key_agreements: result.keyAgreements,
            remaining_dissent: result.remainingDissent,
            minority_report: result.minorityReport,
            rounds_taken: result.roundsTaken,
            participant_count: result.participantCount,
            approval_score: result.approvalScore,
            quick_summary: result.quickSummary,
            agent_journeys: result.agentJourneys.map((j) => ({
              agent_id: j.agentId,
              agent_name: j.agentName,
              reasoning_style: j.reasoningStyle,
              final_stance: j.finalStance,
              total_stance_changes: j.totalStanceChanges,
              consistency_score: j.consistencyScore,
              positions: j.positions,
            })),
          },
          agents: agents.map((a) => ({
            agent_id: a.agentId,
            name: a.name,
            reasoning_style: a.reasoningStyle,
            persona: a.persona,
            confidence: a.confidence,
          })),
          rounds_taken: result.roundsTaken,
          error: null,
        };
      }
    }

    if (review.status === "failed" && review.error) {
      responseData.data.error = review.error;
    }

    return jsonResponse(responseData);
  }),
});

// ---------------------------------------------------------------------------
// POST /api/review/:reviewId/ask — Follow-up questions
// ---------------------------------------------------------------------------

http.route({
  pathPrefix: "/api/review/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Expected: ["api", "review", "<reviewId>", "ask"]
    const reviewId = pathParts[2];
    const suffix = pathParts[3];

    if (!reviewId || suffix !== "ask") {
      return jsonResponse({ success: false, error: "Unknown endpoint" }, 404);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const { question, agent_id } = body;

    if (!question || typeof question !== "string") {
      return jsonResponse(
        { success: false, error: "question is required and must be a string" },
        400,
      );
    }

    // Check that the review exists and is completed
    const review = await ctx.runQuery(api.reviews.getReview, { reviewId });
    if (!review) {
      return jsonResponse({ success: false, error: "Review not found" }, 404);
    }
    if (review.status !== "completed") {
      return jsonResponse(
        { success: false, error: "Review has not completed yet" },
        400,
      );
    }

    // Run the ask action
    const answer: string = await ctx.runAction(internal.ask.askQuestion, {
      reviewId,
      question,
      agentId: agent_id,
    });

    return jsonResponse({
      success: true,
      data: {
        review_id: reviewId,
        question,
        agent_id: agent_id || null,
        answer,
      },
    });
  }),
});

// ---------------------------------------------------------------------------
// OPTIONS preflight for dynamic routes
// ---------------------------------------------------------------------------

http.route({
  pathPrefix: "/api/review/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

// ---------------------------------------------------------------------------
// GET /health — Health check
// ---------------------------------------------------------------------------

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return jsonResponse({
      status: "ok",
      service: "atherum-content-review",
      timestamp: new Date().toISOString(),
    });
  }),
});

export default http;
