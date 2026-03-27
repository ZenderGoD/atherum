"use node";

/**
 * Atherum — Deliberation Action (Convex Node.js runtime)
 *
 * Runs the full multi-agent deliberation loop:
 *   1. Build panelist personas
 *   2. Run rounds with concurrent LLM calls
 *   3. Measure convergence (TF-IDF cosine similarity)
 *   4. Synthesize final verdict
 *   5. Persist everything via mutations
 *   6. Send webhook callback
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentMeta {
  agentId: string;
  name: string;
  reasoningStyle: string;
  persona: string;
  confidence: number;
}

interface PanelistContext {
  agentId: string;
  name: string;
  reasoningStyle: string;
  systemPrompt: string;
}

interface AgentResponse {
  agentId: string;
  agentName: string;
  reasoningStyle: string;
  stance: string;
  reasoning: string;
  confidence: number;
  keyFactors: string[];
  dissentPoints: string[];
  influencedBy?: string;
  tokenUsage: { input: number; output: number };
}

interface RoundData {
  roundNumber: number;
  responses: AgentResponse[];
  convergenceScore: number;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Reviewer persona definitions
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
// Build panelists
// ---------------------------------------------------------------------------

function buildPanelists(agentCount: number): {
  panelists: PanelistContext[];
  agentMeta: AgentMeta[];
} {
  const count = Math.min(agentCount, REVIEWER_ROLES.length);
  const panelists: PanelistContext[] = [];
  const agentMeta: AgentMeta[] = [];

  for (let i = 0; i < count; i++) {
    const role = REVIEWER_ROLES[i];
    const reasoningStyle = REASONING_STYLES[i % REASONING_STYLES.length];
    const agentId = crypto.randomUUID();

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
      agentId,
      name: role.name,
      reasoningStyle,
      systemPrompt,
    });

    agentMeta.push({
      agentId,
      name: role.name,
      reasoningStyle,
      persona: role.persona.slice(0, 200),
      confidence: 0,
    });
  }

  return { panelists, agentMeta };
}

// ---------------------------------------------------------------------------
// LLM client helpers
// ---------------------------------------------------------------------------

function getLLMClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL = process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.LLM_MODEL_NAME || "google/gemini-2.5-flash-preview";

  const client = new OpenAI({ apiKey, baseURL });
  return { client, model };
}

async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    imageUrl?: string;
  },
): Promise<{ content: string; tokenUsage: { input: number; output: number } }> {
  const { client, model } = getLLMClient();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (options?.imageUrl) {
    const parts: ChatCompletionContentPart[] = [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: options.imageUrl, detail: "high" } },
    ];
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
    ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  const choice = response.choices[0];
  const usage = response.usage;

  return {
    content: choice?.message?.content || "",
    tokenUsage: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Agent prompt builders
// ---------------------------------------------------------------------------

function buildAgentUserPrompt(
  roundNumber: number,
  totalRounds: number,
  contentDescription: string,
  imageUrl?: string,
  previousRoundSummary?: string,
  ownPreviousResponse?: { stance: string; confidence: number },
): string {
  let userPrompt = "";

  if (roundNumber === 1) {
    userPrompt += `## Content to Review\n\n`;
    userPrompt += `**Description:** ${contentDescription}\n\n`;
    if (imageUrl) {
      userPrompt += `**Content Media:** An image has been provided for your visual review.\n\n`;
    }
  } else {
    userPrompt += `## Round ${roundNumber} of ${totalRounds}\n\n`;
    userPrompt += `**Content Under Review:** ${contentDescription}\n\n`;

    if (previousRoundSummary) {
      userPrompt += `## Previous Round Discussion Summary\n\n${previousRoundSummary}\n\n`;
    }

    if (ownPreviousResponse) {
      userPrompt += `## Your Previous Position\n\n`;
      userPrompt += `You said: "${ownPreviousResponse.stance}"\n`;
      userPrompt += `Your confidence was: ${ownPreviousResponse.confidence.toFixed(2)}\n\n`;
      userPrompt += `Consider whether you want to maintain, refine, or change your position based on the discussion.\n\n`;
    }
  }

  userPrompt += `## Guiding Questions

- What is your initial reaction to this content?
- How well does this content communicate its intended message?
- What are the strongest and weakest elements?
- Would you engage with this content on social media? Why or why not?
- What specific improvements would you suggest?

`;

  userPrompt += `## Response Format

Respond with a JSON object:
{
  "stance": "Your overall position in 2-3 sentences",
  "reasoning": "Your detailed analysis and reasoning (2-4 paragraphs)",
  "confidence": <0.0 to 1.0>,
  "key_factors": ["factor1", "factor2", ...],
  "dissent_points": ["disagreement1", ...]`;

  if (roundNumber > 1) {
    userPrompt += `,
  "influenced_by": "what changed from previous round (or 'maintained position')"`;
  }

  userPrompt += "\n}";

  return userPrompt;
}

// ---------------------------------------------------------------------------
// TF-IDF convergence measurement (ported from packages/mirage/src/convergence.ts)
// ---------------------------------------------------------------------------

function computeTF(text: string): Record<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const tf: Record<string, number> = {};
  for (const word of words) {
    tf[word] = (tf[word] || 0) + 1;
  }

  const total = words.length || 1;
  for (const word of Object.keys(tf)) {
    tf[word] /= total;
  }

  return tf;
}

function computeIDF(documents: Record<string, number>[]): Record<string, number> {
  const docCount = documents.length;
  const documentFrequency: Record<string, number> = {};

  for (const doc of documents) {
    for (const term of Object.keys(doc)) {
      documentFrequency[term] = (documentFrequency[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, df] of Object.entries(documentFrequency)) {
    idf[term] = Math.log((docCount + 1) / (df + 1)) + 1;
  }

  return idf;
}

function tfidfVector(tf: Record<string, number>, idf: Record<string, number>): Map<string, number> {
  const vector = new Map<string, number>();
  for (const [term, freq] of Object.entries(tf)) {
    vector.set(term, freq * (idf[term] || 0));
  }
  return vector;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weight] of a) {
    normA += weight * weight;
    const bWeight = b.get(term);
    if (bWeight !== undefined) {
      dotProduct += weight * bWeight;
    }
  }

  for (const [, weight] of b) {
    normB += weight * weight;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

function measureConvergence(responses: AgentResponse[]): number {
  const documents = responses.map((r) => r.stance);
  const termFreqs = documents.map(computeTF);
  const idf = computeIDF(termFreqs);
  const vectors = termFreqs.map((tf) => tfidfVector(tf, idf));

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      totalSim += cosineSimilarity(vectors[i], vectors[j]);
      pairs++;
    }
  }

  return pairs > 0 ? totalSim / pairs : 1;
}

// ---------------------------------------------------------------------------
// Round summary generation
// ---------------------------------------------------------------------------

async function generateRoundSummary(
  responses: AgentResponse[],
  convergenceScore: number,
): Promise<string> {
  const positionsList = responses
    .map(
      (r, i) =>
        `Reviewer ${i + 1} (confidence: ${r.confidence.toFixed(2)}): ${r.stance}`,
    )
    .join("\n");

  const systemPrompt = `You are a neutral moderator summarizing a panel discussion round.
Create an anonymous summary that captures the key themes, areas of agreement, and points of disagreement.
Do NOT identify individual reviewers by number. Synthesize the positions into themes.
Keep the summary under 500 words.`;

  const userPrompt = `Round convergence score: ${convergenceScore.toFixed(3)}

Reviewer positions:
${positionsList}

Provide a neutral, anonymous summary of this round's discussion.`;

  try {
    const response = await llmComplete(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 1024,
    });
    return response.content;
  } catch {
    return `Round summary (${responses.length} reviewers, convergence: ${convergenceScore.toFixed(2)}): Key themes discussed include the overall quality and effectiveness of the content.`;
  }
}

// ---------------------------------------------------------------------------
// Synthesis generation
// ---------------------------------------------------------------------------

async function generateSynthesis(
  rounds: RoundData[],
  convergenceScore: number,
): Promise<{
  winningPosition: string;
  consensusSummary: string;
  keyAgreements: string[];
  remainingDissent: string[];
  minorityReport: string;
  approvalScore: number;
  quickSummary: string;
}> {
  const finalRound = rounds[rounds.length - 1];
  const finalResponses = finalRound?.responses || [];

  const allPositions = finalResponses
    .map(
      (r, i) =>
        `Reviewer ${i + 1} (confidence: ${r.confidence.toFixed(2)}): ${r.stance}\nReasoning: ${r.reasoning?.slice(0, 300) || "N/A"}`,
    )
    .join("\n\n");

  // Determine resolution
  let resolution: string;
  if (convergenceScore >= 0.80) {
    resolution = "consensus";
  } else if (convergenceScore >= 0.56) {
    resolution = "majority";
  } else {
    resolution = "no-consensus";
  }

  const defaultResult = {
    winningPosition: "Panel review completed.",
    consensusSummary: "Synthesis generation failed.",
    keyAgreements: [] as string[],
    remainingDissent: [] as string[],
    minorityReport: "",
    approvalScore: 50,
    quickSummary: "The panel completed their review.",
  };

  try {
    const systemPrompt = `You are synthesizing the final outcome of a content review panel deliberation.
Analyze all reviewer positions and produce a structured synthesis.
Respond in valid JSON.`;

    const userPrompt = `The panel has completed ${rounds.length} round(s) of deliberation.
Final convergence score: ${convergenceScore.toFixed(3)}
Resolution: ${resolution}

Final round positions:
${allPositions}

Respond with this JSON structure:
{
  "winning_position": "The dominant consensus position in 2-3 sentences",
  "consensus_summary": "A brief synthesis of what the panel agreed on",
  "key_agreements": ["Point of agreement 1", "Point of agreement 2", ...],
  "remaining_dissent": ["Point of disagreement 1", ...],
  "minority_report": "Summary of minority/dissenting views, or empty string if consensus was strong",
  "approval_score": <number 0-100 representing overall approval of the content>,
  "quick_summary": "A single sentence summarizing the panel's verdict"
}`;

    const response = await llmComplete(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 2048,
      jsonMode: true,
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        winningPosition: parsed.winning_position || defaultResult.winningPosition,
        consensusSummary: parsed.consensus_summary || defaultResult.consensusSummary,
        keyAgreements: Array.isArray(parsed.key_agreements) ? parsed.key_agreements : [],
        remainingDissent: Array.isArray(parsed.remaining_dissent) ? parsed.remaining_dissent : [],
        minorityReport: parsed.minority_report || "",
        approvalScore: typeof parsed.approval_score === "number" ? parsed.approval_score : 50,
        quickSummary: parsed.quick_summary || defaultResult.quickSummary,
      };
    } catch {
      return defaultResult;
    }
  } catch {
    return defaultResult;
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function sendWebhook(
  callbackUrl: string,
  callbackSecret: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, callbackSecret);
  const delays = [0, 5000, 15000, 45000];

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
// Main deliberation action
// ---------------------------------------------------------------------------

export const runDeliberation = internalAction({
  args: {
    reviewId: v.string(),
    sessionId: v.string(),
    contentDescription: v.string(),
    contentType: v.string(),
    imageUrl: v.optional(v.string()),
    maxRounds: v.number(),
    agentCount: v.number(),
    callbackUrl: v.optional(v.string()),
    callbackSecret: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const {
      reviewId,
      sessionId,
      contentDescription,
      contentType,
      imageUrl,
      maxRounds,
      agentCount,
      callbackUrl,
      callbackSecret,
    } = args;

    // Mark as running
    await ctx.runMutation(internal.reviews.updateReviewStatus, {
      reviewId,
      status: "running",
    });

    try {
      // --- Build panelists ---
      const { panelists, agentMeta } = buildPanelists(agentCount);

      // Save agents to Convex
      await ctx.runMutation(internal.reviews.saveAgents, {
        reviewId,
        agents: agentMeta,
      });

      console.log(
        `[review] Starting deliberation ${reviewId}: ${agentCount} agents, ${maxRounds} rounds`,
      );

      // --- Deliberation loop ---
      const roundsData: RoundData[] = [];
      const CONVERGENCE_THRESHOLD = 0.80;

      for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
        console.log(`[review] Round ${roundNum}/${maxRounds} for ${reviewId}`);

        // Generate summary from previous round
        let previousSummary: string | undefined;
        if (roundsData.length > 0) {
          const lastRound = roundsData[roundsData.length - 1];
          previousSummary = await generateRoundSummary(
            lastRound.responses,
            lastRound.convergenceScore,
          );
        }

        // Collect responses concurrently from all agents
        const responsePromises = panelists.map(async (panelist): Promise<AgentResponse | null> => {
          try {
            // Find own previous response
            const ownPrevious = roundsData.length > 0
              ? roundsData[roundsData.length - 1].responses.find(
                  (r) => r.agentId === panelist.agentId,
                )
              : undefined;

            const userPrompt = buildAgentUserPrompt(
              roundNum,
              maxRounds,
              contentDescription,
              // Only pass image on round 1
              roundNum === 1 ? imageUrl : undefined,
              previousSummary,
              ownPrevious ? { stance: ownPrevious.stance, confidence: ownPrevious.confidence } : undefined,
            );

            const response = await llmComplete(panelist.systemPrompt, userPrompt, {
              temperature: 0.7,
              maxTokens: 2048,
              jsonMode: true,
              imageUrl: roundNum === 1 ? imageUrl : undefined,
            });

            // Parse the JSON response
            let parsed: any;
            try {
              parsed = JSON.parse(response.content);
            } catch {
              parsed = {
                stance: response.content.slice(0, 200),
                reasoning: response.content,
                confidence: 0.5,
                key_factors: [],
                dissent_points: [],
              };
            }

            return {
              agentId: panelist.agentId,
              agentName: panelist.name,
              reasoningStyle: panelist.reasoningStyle,
              stance: parsed.stance || parsed.position_summary || parsed.summary || response.content.slice(0, 200),
              reasoning: parsed.reasoning || parsed.analysis || response.content,
              confidence: typeof parsed.confidence === "number"
                ? Math.min(1, Math.max(0, parsed.confidence))
                : 0.5,
              keyFactors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
              dissentPoints: Array.isArray(parsed.dissent_points) ? parsed.dissent_points : [],
              influencedBy: parsed.influenced_by,
              tokenUsage: response.tokenUsage,
            };
          } catch (error) {
            console.warn(
              `[review] Agent ${panelist.name} failed in round ${roundNum}:`,
              error instanceof Error ? error.message : error,
            );
            return null;
          }
        });

        const settled = await Promise.all(responsePromises);
        const responses = settled.filter((r): r is AgentResponse => r !== null);

        // Check if we have enough responses
        if (responses.length < panelists.length * 0.5) {
          throw new Error(
            `Only ${responses.length}/${panelists.length} agents responded in round ${roundNum}`,
          );
        }

        // Measure convergence
        const convergenceScore = measureConvergence(responses);

        // Build round data
        const roundData: RoundData = {
          roundNumber: roundNum,
          responses,
          convergenceScore,
          summary: previousSummary,
        };
        roundsData.push(roundData);

        // Persist round to Convex
        await ctx.runMutation(internal.reviews.saveRound, {
          reviewId,
          roundNumber: roundNum,
          convergenceScore,
          summary: previousSummary,
          responses: responses.map((r) => ({
            agentId: r.agentId,
            agentName: r.agentName,
            reasoningStyle: r.reasoningStyle,
            stance: r.stance,
            reasoning: r.reasoning,
            confidence: r.confidence,
            keyFactors: r.keyFactors,
            dissentPoints: r.dissentPoints,
            influencedBy: r.influencedBy,
          })),
        });

        console.log(
          `[review] Round ${roundNum} complete: convergence=${convergenceScore.toFixed(3)}, responses=${responses.length}`,
        );

        // Early exit on convergence
        if (convergenceScore >= CONVERGENCE_THRESHOLD) {
          console.log(
            `[review] Convergence reached at round ${roundNum}: ${convergenceScore.toFixed(3)} >= ${CONVERGENCE_THRESHOLD}`,
          );
          break;
        }
      }

      // --- Synthesis ---
      const finalRound = roundsData[roundsData.length - 1];
      const finalConvergence = finalRound?.convergenceScore ?? 0;
      const synthesis = await generateSynthesis(roundsData, finalConvergence);

      // Compute agent journeys
      const agentJourneys = panelists.map((panelist) => {
        const positions = roundsData
          .map((round) => {
            const resp = round.responses.find((r) => r.agentId === panelist.agentId);
            return resp
              ? { round: round.roundNumber, stance: resp.stance, confidence: resp.confidence }
              : null;
          })
          .filter((p): p is { round: number; stance: string; confidence: number } => p !== null);

        let stanceChanges = 0;
        for (let i = 1; i < positions.length; i++) {
          if (positions[i].stance !== positions[i - 1].stance) {
            stanceChanges++;
          }
        }
        const maxChanges = Math.max(positions.length - 1, 1);
        const consistencyScore = 1 - stanceChanges / maxChanges;

        return {
          agentId: panelist.agentId,
          agentName: panelist.name,
          reasoningStyle: panelist.reasoningStyle,
          finalStance: positions[positions.length - 1]?.stance || "",
          totalStanceChanges: stanceChanges,
          consistencyScore,
          positions,
        };
      });

      // Average confidence from final round
      const finalResponses = finalRound?.responses || [];
      const avgConfidence = finalResponses.length > 0
        ? finalResponses.reduce((s, r) => s + r.confidence, 0) / finalResponses.length
        : 0.5;

      // Save result to Convex
      await ctx.runMutation(internal.reviews.saveResult, {
        reviewId,
        winningPosition: synthesis.winningPosition,
        convergenceScore: finalConvergence,
        confidence: avgConfidence,
        consensusSummary: synthesis.consensusSummary,
        keyAgreements: synthesis.keyAgreements,
        remainingDissent: synthesis.remainingDissent,
        minorityReport: synthesis.minorityReport,
        approvalScore: synthesis.approvalScore,
        quickSummary: synthesis.quickSummary,
        roundsTaken: roundsData.length,
        participantCount: agentCount,
        agentJourneys,
      });

      // Mark as completed
      await ctx.runMutation(internal.reviews.updateReviewStatus, {
        reviewId,
        status: "completed",
        completedAt: Date.now(),
      });

      console.log(`[review] Completed ${reviewId}: approval=${synthesis.approvalScore}`);

      // --- Webhook ---
      if (callbackUrl && callbackSecret) {
        const webhookPayload = {
          review_id: reviewId,
          session_id: sessionId,
          status: "completed" as const,
          decision: {
            winning_position: synthesis.winningPosition,
            convergence_score: finalConvergence,
            confidence: avgConfidence,
            consensus_summary: synthesis.consensusSummary,
            key_agreements: synthesis.keyAgreements,
            remaining_dissent: synthesis.remainingDissent,
            minority_report: synthesis.minorityReport,
            rounds_taken: roundsData.length,
            participant_count: agentCount,
            approval_score: synthesis.approvalScore,
            quick_summary: synthesis.quickSummary,
            agent_journeys: agentJourneys.map((j) => ({
              agent_id: j.agentId,
              agent_name: j.agentName,
              reasoning_style: j.reasoningStyle,
              final_stance: j.finalStance,
              total_stance_changes: j.totalStanceChanges,
              consistency_score: j.consistencyScore,
              positions: j.positions,
            })),
          },
          agents: agentMeta.map((a) => ({
            agent_id: a.agentId,
            name: a.name,
            reasoning_style: a.reasoningStyle,
            persona: a.persona,
            confidence:
              finalResponses.find((r) => r.agentId === a.agentId)?.confidence ?? a.confidence,
          })),
          rounds_taken: roundsData.length,
          error: null,
        };

        await sendWebhook(callbackUrl, callbackSecret, webhookPayload);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[review] Failed ${reviewId}:`, errorMsg);

      // Mark as failed
      await ctx.runMutation(internal.reviews.updateReviewStatus, {
        reviewId,
        status: "failed",
        error: errorMsg,
        completedAt: Date.now(),
      });

      // Send error webhook
      if (callbackUrl && callbackSecret) {
        const errorPayload = {
          review_id: reviewId,
          session_id: sessionId,
          status: "failed" as const,
          decision: null,
          agents: [],
          rounds_taken: 0,
          error: errorMsg,
        };
        await sendWebhook(callbackUrl, callbackSecret, errorPayload);
      }
    }
  },
});
