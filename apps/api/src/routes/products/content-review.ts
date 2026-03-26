/**
 * Atherum API -- Content Review Product
 *
 * CLEAN-ROOM IMPLEMENTATION.
 *
 * Replicates the MiroFish review API contract:
 * - POST /review        -- Start a content review (returns immediately, runs in background)
 * - GET  /review/:id/status -- Poll for review status
 *
 * 10 reviewer personas with fixed roles, multi-round deliberation,
 * HMAC-signed webhook callback on completion.
 */

import { Hono } from "hono";
import crypto from "node:crypto";
import { runSession } from "@atherum/mirage";
import type { PanelistContext } from "@atherum/mirage";
import { createReviewDeps } from "@atherum/mirage/review-deps";
import type {
  DeliberationConfig,
  DeliberationPrompt,
  DeliberationOutcome,
  SessionId,
  PersonaId,
} from "@atherum/core";
import { makeId } from "@atherum/core";

// ---------------------------------------------------------------------------
// In-memory review tracking
// ---------------------------------------------------------------------------

interface ReviewRecord {
  reviewId: string;
  sessionId: string;
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  agents: Array<{
    agent_id: string;
    name: string;
    reasoning_style: string;
    persona: string;
    confidence: number;
  }>;
}

const reviewStore = new Map<string, ReviewRecord>();

// ---------------------------------------------------------------------------
// Reviewer persona definitions (matching MiroFish roles)
// ---------------------------------------------------------------------------

const REVIEWER_ROLES = [
  {
    name: "Target Audience Member",
    persona:
      "You are a typical member of the target audience. You evaluate content based on whether it resonates with you personally, whether you would engage with it, share it, or scroll past it. You represent the everyday consumer's perspective.",
  },
  {
    name: "Brand Critic",
    persona:
      "You are a sharp brand critic with deep knowledge of brand strategy. You evaluate whether content aligns with brand identity, maintains consistency, and strengthens brand equity. You notice when brands stray from their core values.",
  },
  {
    name: "Trend Analyst",
    persona:
      "You are a cultural trend analyst who tracks emerging patterns in media, fashion, technology, and social behavior. You evaluate content based on its cultural relevance, timeliness, and alignment with current or emerging trends.",
  },
  {
    name: "Marketing Expert",
    persona:
      "You are a seasoned marketing professional with expertise in campaign strategy, audience segmentation, and performance metrics. You evaluate content based on its potential to drive engagement, conversions, and measurable business outcomes.",
  },
  {
    name: "Social Media User",
    persona:
      "You are an active social media user who spends significant time on Instagram, TikTok, and other platforms. You evaluate content based on its scroll-stopping power, shareability, and how it compares to what performs well in your feed.",
  },
  {
    name: "Creative Director",
    persona:
      "You are a creative director with years of experience leading visual campaigns. You evaluate content on craft quality -- composition, color theory, typography, visual hierarchy, and overall creative execution. You have high standards.",
  },
  {
    name: "UX Designer",
    persona:
      "You are a UX designer focused on user experience and interaction design. You evaluate content based on clarity, accessibility, readability, and how well it communicates its intended message to diverse audiences.",
  },
  {
    name: "E-commerce Specialist",
    persona:
      "You are an e-commerce specialist who understands what drives purchase decisions. You evaluate content based on its ability to showcase products effectively, build desire, and move consumers toward purchase.",
  },
  {
    name: "Consumer Psychologist",
    persona:
      "You are a consumer psychologist who studies decision-making, emotional responses, and behavioral triggers. You evaluate content based on its psychological impact -- emotional resonance, cognitive load, persuasion techniques, and memorability.",
  },
  {
    name: "Photographer",
    persona:
      "You are a professional photographer and visual artist. You evaluate content on technical and artistic merit -- lighting, composition, color grading, focus, and visual storytelling. You appreciate both commercial and artistic photography.",
  },
];

const REASONING_STYLES = [
  "analytical",
  "creative",
  "skeptical",
  "pragmatic",
  "synthesizing",
  "visionary",
] as const;

type ReasoningStyle = (typeof REASONING_STYLES)[number];

// ---------------------------------------------------------------------------
// Build panelist contexts
// ---------------------------------------------------------------------------

function buildPanelists(
  agentCount: number,
  contentDescription: string,
  imageUrl?: string,
): {
  panelists: PanelistContext[];
  agentMeta: ReviewRecord["agents"];
} {
  const count = Math.min(agentCount, REVIEWER_ROLES.length);
  const panelists: PanelistContext[] = [];
  const agentMeta: ReviewRecord["agents"] = [];

  for (let i = 0; i < count; i++) {
    const role = REVIEWER_ROLES[i];
    const reasoningStyle = REASONING_STYLES[i % REASONING_STYLES.length];
    const agentId = crypto.randomUUID();
    const personaId = makeId<"PersonaId">(agentId);

    const systemPrompt = `# Your Role: ${role.name}

${role.persona}

## Your Reasoning Style: ${reasoningStyle}
${getReasoningStyleDescription(reasoningStyle)}

## Evaluation Dimensions
Score the content on these dimensions (1-10 each):
1. **Visual Impact** - How visually striking and attention-grabbing is the content?
2. **Brand Alignment** - How well does the content align with professional brand standards?
3. **Audience Resonance** - How likely is the target audience to connect with this content?
4. **Creativity** - How original and creative is the execution?
5. **Effectiveness** - How well does the content achieve its apparent goal?

## Important Rules
- Stay in character as ${role.name} at all times
- Apply your ${reasoningStyle} reasoning style to your analysis
- Be specific and reference concrete elements of the content
- Provide honest, constructive feedback -- do not be uniformly positive or negative
- Your confidence score should reflect how certain you are of your assessment`;

    panelists.push({
      personaId,
      systemPrompt,
      rubrics: [
        { dimension: "Visual Impact", description: "How visually striking", weight: 0.2 },
        { dimension: "Brand Alignment", description: "Brand consistency", weight: 0.2 },
        { dimension: "Audience Resonance", description: "Audience connection", weight: 0.2 },
        { dimension: "Creativity", description: "Originality of execution", weight: 0.2 },
        { dimension: "Effectiveness", description: "Goal achievement", weight: 0.2 },
      ],
      role: "reviewer",
      domainWeight: 1.0,
    });

    agentMeta.push({
      agent_id: agentId,
      name: role.name,
      reasoning_style: reasoningStyle,
      persona: role.persona.slice(0, 200),
      confidence: 0,
    });
  }

  return { panelists, agentMeta };
}

function getReasoningStyleDescription(style: ReasoningStyle): string {
  const descriptions: Record<ReasoningStyle, string> = {
    analytical:
      "You approach evaluation systematically, breaking down content into components and assessing each on its merits. You prefer data and evidence over gut feelings.",
    creative:
      "You evaluate with an artistic sensibility, looking for innovation, emotional impact, and creative risk-taking. You appreciate when content pushes boundaries.",
    skeptical:
      "You are naturally critical and question assumptions. You look for weaknesses, inconsistencies, and potential issues. You play devil's advocate.",
    pragmatic:
      "You focus on practical outcomes. Does it work? Will it achieve its goals? You care less about artistic merit and more about real-world effectiveness.",
    synthesizing:
      "You look for connections and patterns across different aspects. You build holistic assessments by weaving together multiple viewpoints into coherent narratives.",
    visionary:
      "You evaluate content against future possibilities. You consider how it positions the brand for emerging trends and whether it feels forward-thinking.",
  };
  return descriptions[style];
}

// ---------------------------------------------------------------------------
// HMAC webhook signing
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function sendWebhook(
  callbackUrl: string,
  callbackSecret: string,
  payload: any,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, callbackSecret);
  const delays = [0, 5000, 15000, 45000]; // immediate + 3 retries with backoff

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      console.log(`[webhook] Retry ${attempt}/3 after ${delays[attempt] / 1000}s...`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }

    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MiroFish-Signature": signature,
          "X-Signature-256": `sha256=${signature}`,
          "X-Webhook-Source": "atherum-content-review",
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        console.log(`[webhook] Delivered to ${callbackUrl} (attempt ${attempt + 1})`);
        return;
      }
      console.warn(`[webhook] Attempt ${attempt + 1} got status ${response.status}`);
    } catch (error) {
      console.warn(
        `[webhook] Attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.error(`[webhook] Failed after ${delays.length} attempts to ${callbackUrl}`);
}

// ---------------------------------------------------------------------------
// Background deliberation runner
// ---------------------------------------------------------------------------

async function runReview(record: ReviewRecord, params: {
  contentDescription: string;
  imageUrl?: string;
  contentType: string;
  maxRounds: number;
  agentCount: number;
  callbackUrl?: string;
  callbackSecret?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    contentDescription,
    imageUrl,
    contentType,
    maxRounds,
    agentCount,
    callbackUrl,
    callbackSecret,
    metadata,
  } = params;

  record.status = "running";

  try {
    const { panelists, agentMeta } = buildPanelists(
      agentCount,
      contentDescription,
      imageUrl,
    );
    record.agents = agentMeta;

    const sessionId = makeId<"SessionId">(record.sessionId);

    const config: DeliberationConfig = {
      strategy: "panel-review",
      maxRounds,
      convergenceThreshold: 0.80,
      allowEarlyExit: true,
      enableSubgroups: false,
      costBudgetUsd: 5.0,
      anonymousSummaries: true,
      voting: { method: "weighted", weightSource: "confidence" },
    };

    const prompt: DeliberationPrompt = {
      subject: contentDescription,
      content: {
        type: contentType === "video" ? "video" : contentType === "3d" ? "mixed" : "image",
        items: [
          {
            mediaType: contentType,
            url: imageUrl,
            text: contentDescription,
            metadata: metadata || {},
          },
        ],
      },
      guidingQuestions: [
        "What is your initial reaction to this content?",
        "How well does this content communicate its intended message?",
        "What are the strongest and weakest elements?",
        "Would you engage with this content on social media? Why or why not?",
        "What specific improvements would you suggest?",
      ],
    };

    const deps = createReviewDeps();

    console.log(
      `[review] Starting deliberation ${record.reviewId}: ${agentCount} agents, ${maxRounds} rounds`,
    );

    const result = await runSession(sessionId, config, prompt, panelists, deps);

    if (result.ok) {
      const outcome = result.value as DeliberationOutcome & { _synthesis?: any };
      const synthesis = outcome._synthesis || {};

      // Compute approval score from aggregated scores if not in synthesis
      let approvalScore = synthesis.approval_score;
      if (typeof approvalScore !== "number" && outcome.aggregatedScores?.length) {
        const avgScore =
          outcome.aggregatedScores.reduce((s, d) => s + d.weightedMean, 0) /
          outcome.aggregatedScores.length;
        approvalScore = Math.round(avgScore * 10); // 1-10 scale -> 0-100
      }
      approvalScore = typeof approvalScore === "number" ? approvalScore : 50;

      // Build agent journeys for the webhook
      const agentJourneys = outcome.journeys.map((journey) => {
        const agent = agentMeta.find((a) => a.agent_id === journey.personaId);
        const positions = journey.positions.map((p) => ({
          round: p.roundNumber,
          stance: p.summary,
          confidence: p.confidence,
        }));

        // Count stance changes
        let stanceChanges = 0;
        for (let i = 1; i < positions.length; i++) {
          if (positions[i].stance !== positions[i - 1].stance) {
            stanceChanges++;
          }
        }

        // Consistency = 1 - (changes / max possible changes)
        const maxChanges = Math.max(positions.length - 1, 1);
        const consistencyScore = 1 - stanceChanges / maxChanges;

        return {
          agent_id: agent?.agent_id || journey.personaId,
          agent_name: agent?.name || "Unknown",
          reasoning_style: agent?.reasoning_style || "analytical",
          final_stance: positions[positions.length - 1]?.stance || "",
          total_stance_changes: stanceChanges,
          consistency_score: consistencyScore,
          positions,
        };
      });

      // Update agent confidence from final round
      const lastRoundResponses =
        outcome.journeys.length > 0
          ? outcome.journeys.map((j) => {
              const lastPos = j.positions[j.positions.length - 1];
              return { personaId: j.personaId, confidence: lastPos?.confidence || 0 };
            })
          : [];

      for (const resp of lastRoundResponses) {
        const agent = record.agents.find((a) => a.agent_id === resp.personaId);
        if (agent) agent.confidence = resp.confidence;
      }

      // Convergence from last round
      const convergenceScore =
        outcome.aggregatedScores && outcome.aggregatedScores.length > 0
          ? 1 - outcome.aggregatedScores.reduce((s, d) => s + d.standardDeviation, 0) /
              outcome.aggregatedScores.length / 10
          : 0.5;

      const webhookPayload = {
        review_id: record.reviewId,
        session_id: record.sessionId,
        status: "completed" as const,
        decision: {
          winning_position: synthesis.winning_position || outcome.majoritySummary,
          convergence_score: convergenceScore,
          confidence:
            lastRoundResponses.reduce((s, r) => s + r.confidence, 0) /
            Math.max(lastRoundResponses.length, 1),
          consensus_summary: synthesis.consensus_summary || outcome.majoritySummary,
          key_agreements: synthesis.key_agreements || [],
          remaining_dissent: synthesis.remaining_dissent || [],
          minority_report:
            synthesis.minority_report ||
            outcome.minorityReports.map((m) => m.position).join("; ") ||
            "",
          rounds_taken: outcome.journeys[0]?.positions?.length || maxRounds,
          participant_count: agentCount,
          approval_score: approvalScore,
          quick_summary: synthesis.quick_summary || outcome.majoritySummary.slice(0, 100),
          agent_journeys: agentJourneys,
        },
        agents: record.agents,
        rounds_taken: outcome.journeys[0]?.positions?.length || maxRounds,
        error: null,
      };

      record.status = "completed";
      record.completedAt = new Date();
      record.result = webhookPayload;

      console.log(`[review] Completed ${record.reviewId}: approval=${approvalScore}`);

      // Send webhook
      if (callbackUrl && callbackSecret) {
        await sendWebhook(callbackUrl, callbackSecret, webhookPayload);
      }
    } else {
      // Deliberation failed
      const errorPayload = {
        review_id: record.reviewId,
        session_id: record.sessionId,
        status: "failed" as const,
        decision: null,
        agents: record.agents,
        rounds_taken: 0,
        error: result.error?.message || "Deliberation failed",
      };

      record.status = "failed";
      record.completedAt = new Date();
      record.error = result.error?.message || "Deliberation failed";
      record.result = errorPayload;

      console.error(`[review] Failed ${record.reviewId}:`, result.error);

      if (callbackUrl && callbackSecret) {
        await sendWebhook(callbackUrl, callbackSecret, errorPayload);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorPayload = {
      review_id: record.reviewId,
      session_id: record.sessionId,
      status: "failed" as const,
      decision: null,
      agents: record.agents,
      rounds_taken: 0,
      error: errorMsg,
    };

    record.status = "failed";
    record.completedAt = new Date();
    record.error = errorMsg;
    record.result = errorPayload;

    console.error(`[review] Uncaught error ${record.reviewId}:`, errorMsg);

    if (callbackUrl && callbackSecret) {
      await sendWebhook(callbackUrl, callbackSecret, errorPayload);
    }
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const app = new Hono();

/**
 * POST /review -- Start a content review
 */
app.post("/review", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body) {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  const { content_description, content_type, metadata, review_id } = body;

  if (!content_description || typeof content_description !== "string") {
    return c.json(
      { success: false, error: "content_description is required and must be a string" },
      400,
    );
  }

  if (!content_type || !["image", "video", "3d"].includes(content_type)) {
    return c.json(
      { success: false, error: 'content_type must be one of: image, video, 3d' },
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
  const taskId = crypto.randomUUID();

  // Create review record
  const record: ReviewRecord = {
    reviewId: resolvedReviewId,
    sessionId,
    taskId,
    status: "pending",
    createdAt: new Date(),
    agents: [],
  };

  reviewStore.set(resolvedReviewId, record);

  // Run deliberation in background (do not await)
  runReview(record, {
    contentDescription: content_description,
    imageUrl,
    contentType: content_type,
    maxRounds,
    agentCount,
    callbackUrl,
    callbackSecret,
    metadata,
  }).catch((err) => {
    console.error(`[review] Background task error for ${resolvedReviewId}:`, err);
  });

  // Return immediately
  return c.json(
    {
      success: true,
      data: {
        review_id: resolvedReviewId,
        session_id: sessionId,
        task_id: taskId,
      },
    },
    202,
  );
});

/**
 * GET /review/:reviewId/status -- Poll for review status
 */
app.get("/review/:reviewId/status", async (c) => {
  const reviewId = c.req.param("reviewId");
  const record = reviewStore.get(reviewId);

  if (!record) {
    return c.json({ success: false, error: "Review not found" }, 404);
  }

  const response: any = {
    success: true,
    data: {
      review_id: record.reviewId,
      session_id: record.sessionId,
      task_id: record.taskId,
      status: record.status,
      created_at: record.createdAt.toISOString(),
      completed_at: record.completedAt?.toISOString() || null,
      agents: record.agents,
    },
  };

  if (record.status === "completed" && record.result) {
    response.data.result = record.result;
  }

  if (record.status === "failed" && record.error) {
    response.data.error = record.error;
  }

  return c.json(response);
});

export default app;
