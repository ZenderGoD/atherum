"use node";

/**
 * Atherum — Deliberation Action (Convex Node.js runtime)
 *
 * Hardened with priorities 1-4 from the engineering roadmap:
 *   P1: Structured output with Zod validation + field-level defaults
 *   P2: Per-agent retry with exponential backoff + model fallback chain
 *   P3: Embedding-based convergence (with TF-IDF fallback)
 *   P4: Multi-model agent diversity (per-agent model + temperature)
 *
 * Integrates five Convex components:
 *   1. @convex-dev/agent — Agent definitions, thread management, generateText
 *   2. @convex-dev/rate-limiter — Per-workspace, per-review, and global limits
 *   3. @convex-dev/workpool — Bounded concurrent LLM calls (max 5 parallel)
 *   4. @mzedstudio/llm-cache — Deduplicates identical LLM requests
 *   5. @convex-dev/crons — (registered separately in cronSetup.ts)
 *
 * Flow:
 *   1. Check rate limits
 *   2. Create agents and threads via Agent component
 *   3. Run rounds using Workpool-bounded parallelism with LLM Cache
 *   4. Measure convergence (embedding-based with TF-IDF fallback)
 *   5. Synthesize final verdict
 *   6. Persist everything via mutations
 *   7. Send webhook callback
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  createReviewerAgents,
  createAgentWithModel,
  getPersonaMeta,
  REVIEWER_PERSONAS,
  MODEL_FALLBACKS,
} from "./agents";
import type { ReviewerPersona } from "./agents";
import { rateLimiter } from "./rateLimiter";
import { LLMCache } from "@mzedstudio/llm-cache";
import { components } from "./_generated/api";
import crypto from "node:crypto";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";
import { z } from "zod";

// ---------------------------------------------------------------------------
// LLM Cache instance
// ---------------------------------------------------------------------------

const llmCache = new LLMCache(components.llmCache);

// ---------------------------------------------------------------------------
// Priority 1: Zod schemas for structured output
// ---------------------------------------------------------------------------

const AgentResponseSchema = z.object({
  stance: z.string().describe("Your overall position in 2-3 sentences"),
  reasoning: z.string().describe("Detailed analysis, 2-4 paragraphs"),
  confidence: z.number().min(0).max(1).describe("How certain you are"),
  key_factors: z.array(z.string()).describe("Key supporting arguments"),
  dissent_points: z.array(z.string()).default([]).describe("Points of disagreement"),
  influenced_by: z.string().optional().describe("What changed from previous round"),
});

type ParsedAgentResponse = z.infer<typeof AgentResponseSchema>;

const SynthesisSchema = z.object({
  winning_position: z.string().describe("The dominant consensus position in 2-3 sentences"),
  consensus_summary: z.string().describe("A brief synthesis of what the panel agreed on"),
  key_agreements: z.array(z.string()).describe("Points of agreement"),
  remaining_dissent: z.array(z.string()).default([]).describe("Points of disagreement"),
  minority_report: z.string().default("").describe("Summary of minority/dissenting views"),
  approval_score: z.number().min(0).max(100).describe("Overall approval of the content"),
  quick_summary: z.string().describe("A single sentence summarizing the panel's verdict"),
});

/**
 * Safely parse a JSON string against a Zod schema with field-level defaults.
 * On parse failure: returns field-level defaults for missing fields rather than
 * rejecting the whole response.
 */
function safeParseAgentResponse(
  content: string,
  fallbackContent: string,
): ParsedAgentResponse {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    // Not valid JSON at all — use raw content as stance/reasoning
    return {
      stance: fallbackContent.slice(0, 200),
      reasoning: fallbackContent,
      confidence: 0.5,
      key_factors: [],
      dissent_points: [],
    };
  }

  const result = AgentResponseSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  // Field-level fallback: take what we can from the raw object, fill defaults
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    stance:
      typeof obj.stance === "string"
        ? obj.stance
        : typeof obj.position_summary === "string"
          ? obj.position_summary
          : typeof obj.summary === "string"
            ? obj.summary
            : fallbackContent.slice(0, 200),
    reasoning:
      typeof obj.reasoning === "string"
        ? obj.reasoning
        : typeof obj.analysis === "string"
          ? obj.analysis
          : fallbackContent,
    confidence:
      typeof obj.confidence === "number"
        ? Math.min(1, Math.max(0, obj.confidence))
        : 0.5,
    key_factors: Array.isArray(obj.key_factors) ? obj.key_factors : [],
    dissent_points: Array.isArray(obj.dissent_points) ? obj.dissent_points : [],
    influenced_by: typeof obj.influenced_by === "string" ? obj.influenced_by : undefined,
  };
}

// ---------------------------------------------------------------------------
// Priority 2: Retry wrapper with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelay = 1000,
  timeoutMs = 30000,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Race against a timeout to prevent hanging calls
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelay * Math.pow(3, attempt); // 1s, 3s, 9s
      console.warn(
        `[retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

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
  partial?: boolean;
}

// ---------------------------------------------------------------------------
// LLM client helpers (kept for synthesis + round summary which don't use Agent)
// ---------------------------------------------------------------------------

function getLLMClient(modelOverride?: string): { client: OpenAI; model: string } {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL = process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
  const model = modelOverride || process.env.LLM_MODEL_NAME || "google/gemini-2.5-flash-preview";

  const client = new OpenAI({ apiKey, baseURL });
  return { client, model };
}

async function llmCompleteWithCache(
  ctx: any,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    imageUrl?: string;
    tags?: string[];
    modelOverride?: string;
  },
): Promise<{ content: string; tokenUsage: { input: number; output: number }; cached: boolean }> {
  const { client, model } = getLLMClient(options?.modelOverride);

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

  const request = {
    model,
    messages: messages.map((m) => ({
      role: String(m.role),
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  };

  // Check LLM Cache first
  try {
    const cached = await llmCache.lookup(ctx, { request });
    if (cached) {
      console.log("[cache] HIT for LLM request");
      const choice = (cached.response as any)?.choices?.[0];
      const usage = (cached.response as any)?.usage;
      return {
        content: choice?.message?.content || JSON.stringify(cached.response),
        tokenUsage: {
          input: usage?.prompt_tokens ?? 0,
          output: usage?.completion_tokens ?? 0,
        },
        cached: true,
      };
    }
  } catch (e) {
    // Cache lookup failed, proceed with live call
    console.warn("[cache] Lookup error, proceeding with live call:", e);
  }

  // Cache miss — make the live LLM call
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
    ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  // Store in cache
  try {
    await llmCache.store(ctx, {
      request,
      response: response as any,
      tags: options?.tags || ["deliberation"],
    });
    console.log("[cache] STORED LLM response");
  } catch (e) {
    console.warn("[cache] Store error:", e);
  }

  const choice = response.choices[0];
  const usage = response.usage;

  return {
    content: choice?.message?.content || "",
    tokenUsage: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
    },
    cached: false,
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
// Priority 3: Embedding-based convergence measurement
// ---------------------------------------------------------------------------

/**
 * Embed texts using the OpenAI-compatible embeddings API.
 * Falls back gracefully if the embedding call fails.
 */
async function embedTexts(texts: string[]): Promise<number[][] | null> {
  try {
    const { client } = getLLMClient();
    // Race against a 5s timeout — if embeddings aren't fast, TF-IDF is fine
    const response = await Promise.race([
      client.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Embedding timeout (5s)")), 5000)
      ),
    ]);
    return response.data.map((d) => d.embedding);
  } catch (err) {
    console.warn(
      "[embeddings] Falling back to TF-IDF:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
function embeddingCosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute mean pairwise cosine similarity from embedding vectors.
 */
function embeddingMeanSimilarity(embeddings: number[][]): number {
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      totalSim += embeddingCosineSimilarity(embeddings[i], embeddings[j]);
      pairs++;
    }
  }
  return pairs > 0 ? totalSim / pairs : 1;
}

// --- TF-IDF fallback (kept from original) ---

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

function measureConvergenceTFIDF(responses: AgentResponse[]): number {
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

/**
 * Multi-dimensional convergence measurement (Priority 3).
 *
 * Combines:
 *   - Semantic similarity (embeddings or TF-IDF fallback)  weight: 0.50
 *   - Score agreement (inverse std dev of confidence)       weight: 0.25
 *   - Direction agreement (% agents on same side of 0.5)    weight: 0.25
 */
async function measureConvergence(responses: AgentResponse[]): Promise<number> {
  if (responses.length <= 1) return 1;

  // --- Dimension 1: Semantic similarity ---
  let semanticSimilarity: number;
  const stances = responses.map((r) => r.stance);
  const embeddings = await embedTexts(stances);

  if (embeddings && embeddings.length === stances.length) {
    semanticSimilarity = embeddingMeanSimilarity(embeddings);
    console.log(`[convergence] Embedding similarity: ${semanticSimilarity.toFixed(3)}`);
  } else {
    semanticSimilarity = measureConvergenceTFIDF(responses);
    console.log(`[convergence] TF-IDF fallback similarity: ${semanticSimilarity.toFixed(3)}`);
  }

  // --- Dimension 2: Score agreement (inverse of confidence std dev) ---
  const confidences = responses.map((r) => r.confidence);
  const meanConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const variance =
    confidences.reduce((sum, c) => sum + (c - meanConf) ** 2, 0) / confidences.length;
  const stdDev = Math.sqrt(variance);
  // stdDev ranges 0..0.5 for values in [0,1]; normalize to [0,1] agreement
  const scoreAgreement = 1 - Math.min(stdDev / 0.5, 1);

  // --- Dimension 3: Direction agreement (% on same side of 0.5) ---
  const above = confidences.filter((c) => c >= 0.5).length;
  const below = confidences.length - above;
  const majorityFraction = Math.max(above, below) / confidences.length;
  // Already in [0.5, 1.0] range; normalize to [0, 1]
  const directionAgreement = (majorityFraction - 0.5) * 2;

  // --- Weighted combination ---
  const combined =
    semanticSimilarity * 0.50 +
    scoreAgreement * 0.25 +
    directionAgreement * 0.25;

  console.log(
    `[convergence] Multi-dimensional: semantic=${semanticSimilarity.toFixed(3)} ` +
      `score=${scoreAgreement.toFixed(3)} direction=${directionAgreement.toFixed(3)} ` +
      `combined=${combined.toFixed(3)}`,
  );

  return combined;
}

// ---------------------------------------------------------------------------
// Round summary generation (uses cache)
// ---------------------------------------------------------------------------

async function generateRoundSummary(
  ctx: any,
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
    const response = await withRetry(() =>
      llmCompleteWithCache(ctx, systemPrompt, userPrompt, {
        temperature: 0.3,
        maxTokens: 1024,
        tags: ["round-summary"],
      }),
    );
    return response.content;
  } catch {
    return `Round summary (${responses.length} reviewers, convergence: ${convergenceScore.toFixed(2)}): Key themes discussed include the overall quality and effectiveness of the content.`;
  }
}

// ---------------------------------------------------------------------------
// Synthesis generation (uses cache + Zod validation)
// ---------------------------------------------------------------------------

async function generateSynthesis(
  ctx: any,
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

    const response = await withRetry(() =>
      llmCompleteWithCache(ctx, systemPrompt, userPrompt, {
        temperature: 0.3,
        maxTokens: 2048,
        jsonMode: true,
        tags: ["synthesis"],
      }),
    );

    try {
      const raw = JSON.parse(response.content);
      const parsed = SynthesisSchema.safeParse(raw);

      if (parsed.success) {
        return {
          winningPosition: parsed.data.winning_position,
          consensusSummary: parsed.data.consensus_summary,
          keyAgreements: parsed.data.key_agreements,
          remainingDissent: parsed.data.remaining_dissent,
          minorityReport: parsed.data.minority_report,
          approvalScore: parsed.data.approval_score,
          quickSummary: parsed.data.quick_summary,
        };
      }

      // Field-level fallback on Zod validation failure
      console.warn("[synthesis] Zod validation failed, using field-level fallback:", parsed.error.message);
      return {
        winningPosition: raw.winning_position || defaultResult.winningPosition,
        consensusSummary: raw.consensus_summary || defaultResult.consensusSummary,
        keyAgreements: Array.isArray(raw.key_agreements) ? raw.key_agreements : [],
        remainingDissent: Array.isArray(raw.remaining_dissent) ? raw.remaining_dissent : [],
        minorityReport: raw.minority_report || "",
        approvalScore: typeof raw.approval_score === "number" ? raw.approval_score : 50,
        quickSummary: raw.quick_summary || defaultResult.quickSummary,
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
// Workpool-bounded agent call (Priority 2: retry + model fallback)
// ---------------------------------------------------------------------------

/**
 * Runs a single agent's LLM call with retry and model fallback.
 * On failure after retries with the agent's primary model, tries the
 * next models in the fallback chain.
 */
async function runSingleAgent(
  ctx: any,
  agent: ReturnType<typeof createReviewerAgents>[number],
  persona: ReviewerPersona,
  agentId: string,
  meta: AgentMeta,
  roundNum: number,
  maxRounds: number,
  contentDescription: string,
  imageUrl: string | undefined,
  previousSummary: string | undefined,
  previousResponses: AgentResponse[] | undefined,
): Promise<AgentResponse | null> {
  // Check per-review rate limit
  const reviewLimit = await rateLimiter.limit(ctx, "reviewLlmCalls", {
    key: agentId,
  });
  if (!reviewLimit.ok) {
    console.warn(`[rate-limit] Per-review limit hit for agent ${meta.name}`);
    return null;
  }

  // Check global rate limit
  const globalLimit = await rateLimiter.limit(ctx, "globalLlmCalls");
  if (!globalLimit.ok) {
    console.warn(`[rate-limit] Global LLM limit hit`);
    return null;
  }

  // Find own previous response
  const ownPrevious = previousResponses?.find((r) => r.agentId === agentId);

  const userPrompt = buildAgentUserPrompt(
    roundNum,
    maxRounds,
    contentDescription,
    roundNum === 1 ? imageUrl : undefined,
    previousSummary,
    ownPrevious
      ? { stance: ownPrevious.stance, confidence: ownPrevious.confidence }
      : undefined,
  );

  // Build the model fallback chain starting from the agent's assigned model
  const assignedModel = persona.model;
  const assignedModelName =
    assignedModel === "primary"
      ? MODEL_FALLBACKS[0]
      : assignedModel === "secondary"
        ? MODEL_FALLBACKS[1]
        : MODEL_FALLBACKS[2];

  // Create ordered fallback list: assigned model first, then others
  const fallbackChain = [
    assignedModelName,
    ...MODEL_FALLBACKS.filter((m) => m !== assignedModelName),
  ];

  let lastError: Error | null = null;
  let visionFailed = false;

  for (const modelName of fallbackChain) {
    try {
      // Build the agent for this model
      const currentAgent =
        modelName === assignedModelName
          ? agent
          : createAgentWithModel(persona, modelName);

      const result = await withRetry(async () => {
        const { threadId } = await currentAgent.createThread(ctx, {
          title: `Review agent ${meta.name} round ${roundNum}`,
        });

        const { thread } = await currentAgent.continueThread(ctx, { threadId });

        // Build prompt, handling vision fallback
        let promptToSend = userPrompt;
        if (visionFailed && roundNum === 1 && imageUrl) {
          promptToSend =
            "Note: image could not be analyzed, review based on description only.\n\n" +
            promptToSend;
        }

        return await thread.generateText({
          prompt: promptToSend,
          temperature: persona.temperature,
          maxOutputTokens: 2048,
        });
      });

      const content = result.text || "";

      // Parse with Zod (Priority 1)
      let parsed = safeParseAgentResponse(content, content);

      // If parsing got poor results (empty stance from fallback), try a JSON nudge retry
      if (parsed.stance === content.slice(0, 200) && content.length > 50) {
        try {
          const { threadId: retryThreadId } = await agent.createThread(ctx, {
            title: `Review agent ${meta.name} round ${roundNum} (JSON retry)`,
          });
          const { thread: retryThread } = await agent.continueThread(ctx, {
            threadId: retryThreadId,
          });
          const retryResult = await retryThread.generateText({
            prompt:
              "Your previous response was not in valid JSON format. Please respond ONLY with a valid JSON object matching this schema:\n" +
              '{"stance": "...", "reasoning": "...", "confidence": 0.0-1.0, "key_factors": [...], "dissent_points": [...]}\n\n' +
              "Original question:\n" +
              userPrompt,
            temperature: persona.temperature,
            maxOutputTokens: 2048,
          });
          const retryContent = retryResult.text || "";
          const retryParsed = safeParseAgentResponse(retryContent, content);
          // Use retry result if it has a proper stance
          if (retryParsed.stance !== retryContent.slice(0, 200)) {
            parsed = retryParsed;
          }
        } catch {
          // JSON nudge retry failed, keep original parsed result
        }
      }

      return {
        agentId,
        agentName: meta.name,
        reasoningStyle: meta.reasoningStyle,
        stance: parsed.stance,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
        keyFactors: parsed.key_factors,
        dissentPoints: parsed.dissent_points,
        influencedBy: parsed.influenced_by,
        tokenUsage: {
          input: result.usage?.inputTokens ?? 0,
          output: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[review] Agent ${meta.name} failed with model ${modelName}:`,
        lastError.message,
      );

      // Priority 2: Vision fallback — if round 1 with image, retry without image
      if (roundNum === 1 && imageUrl && !visionFailed) {
        console.warn(`[review] Enabling vision fallback for agent ${meta.name}`);
        visionFailed = true;
        // Continue to next model in fallback chain (vision flag is now set)
      }
    }
  }

  console.warn(
    `[review] Agent ${meta.name} exhausted all model fallbacks in round ${roundNum}:`,
    lastError?.message,
  );
  return null;
}

/**
 * Runs all agents in batches with bounded concurrency.
 * Returns responses and a partial flag if not all agents responded.
 */
async function runAgentBatch(
  ctx: any,
  agents: ReturnType<typeof createReviewerAgents>,
  personas: ReviewerPersona[],
  agentIds: string[],
  agentMeta: AgentMeta[],
  roundNum: number,
  maxRounds: number,
  contentDescription: string,
  imageUrl: string | undefined,
  previousSummary: string | undefined,
  previousResponses: AgentResponse[] | undefined,
): Promise<{ responses: AgentResponse[]; partial: boolean }> {
  const MAX_PARALLEL = agents.length <= 5 ? agents.length : 5;
  const responses: AgentResponse[] = [];

  // Process agents in batches of MAX_PARALLEL (no batching if <=5 agents)
  for (let batchStart = 0; batchStart < agents.length; batchStart += MAX_PARALLEL) {
    const batchEnd = Math.min(batchStart + MAX_PARALLEL, agents.length);
    const batchPromises: Promise<AgentResponse | null>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(
        runSingleAgent(
          ctx,
          agents[i],
          personas[i],
          agentIds[i],
          agentMeta[i],
          roundNum,
          maxRounds,
          contentDescription,
          imageUrl,
          previousSummary,
          previousResponses,
        ),
      );
    }

    const batchResults = await Promise.all(batchPromises);
    for (const result of batchResults) {
      if (result !== null) {
        responses.push(result);
      }
    }

    console.log(
      `[review] Batch ${Math.floor(batchStart / MAX_PARALLEL) + 1} complete: ${responses.length} responses so far`,
    );
  }

  // Priority 2: Partial results — lowered threshold from 50% to 30%
  const partial = responses.length < agents.length;
  return { responses, partial };
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
      // --- Rate limit check: workspace-level ---
      const workspaceLimit = await rateLimiter.limit(ctx, "workspaceReviews", {
        key: reviewId,
      });
      if (!workspaceLimit.ok) {
        throw new Error(
          `Workspace rate limit exceeded. Retry after ${workspaceLimit.retryAfter}ms`,
        );
      }

      // --- Create agents using Agent component (Priority 4: per-agent model) ---
      const allAgents = createReviewerAgents();
      const agents = allAgents.slice(0, Math.min(agentCount, allAgents.length));
      const personas = REVIEWER_PERSONAS.slice(0, agents.length);
      const agentIds: string[] = [];
      const agentMeta: AgentMeta[] = [];

      for (let i = 0; i < agents.length; i++) {
        const id = crypto.randomUUID();
        const persona = getPersonaMeta(i);
        agentIds.push(id);
        agentMeta.push({
          agentId: id,
          name: persona.name,
          reasoningStyle: persona.reasoningStyle,
          persona: persona.persona.slice(0, 200),
          confidence: 0,
        });
      }

      // Save agents to Convex
      await ctx.runMutation(internal.reviews.saveAgents, {
        reviewId,
        agents: agentMeta,
      });

      console.log(
        `[review] Starting deliberation ${reviewId}: ${agents.length} agents, ${maxRounds} rounds ` +
          `(Zod validation + retry/fallback + embedding convergence + multi-model diversity)`,
      );

      // --- Deliberation loop ---
      const roundsData: RoundData[] = [];
      const CONVERGENCE_THRESHOLD = 0.80;
      const MIN_RESPONSE_RATIO = 0.30; // Priority 2: lowered from 0.50

      for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
        console.log(`[review] Round ${roundNum}/${maxRounds} for ${reviewId}`);

        // Generate summary from previous round (cached)
        let previousSummary: string | undefined;
        if (roundsData.length > 0) {
          const lastRound = roundsData[roundsData.length - 1];
          previousSummary = await generateRoundSummary(
            ctx,
            lastRound.responses,
            lastRound.convergenceScore,
          );
        }

        // Collect responses using Workpool-bounded batching
        const previousResponses =
          roundsData.length > 0
            ? roundsData[roundsData.length - 1].responses
            : undefined;

        const { responses, partial } = await runAgentBatch(
          ctx,
          agents,
          personas,
          agentIds,
          agentMeta,
          roundNum,
          maxRounds,
          contentDescription,
          imageUrl,
          previousSummary,
          previousResponses,
        );

        // Check if we have enough responses (Priority 2: lowered to 30%)
        if (responses.length < agents.length * MIN_RESPONSE_RATIO) {
          throw new Error(
            `Only ${responses.length}/${agents.length} agents responded in round ${roundNum} (below ${MIN_RESPONSE_RATIO * 100}% threshold)`,
          );
        }

        if (partial) {
          console.warn(
            `[review] Round ${roundNum} partial: ${responses.length}/${agents.length} agents responded`,
          );
        }

        // Measure convergence (Priority 3: embedding-based with multi-dimensional scoring)
        const convergenceScore = await measureConvergence(responses);

        // Build round data
        const roundData: RoundData = {
          roundNumber: roundNum,
          responses,
          convergenceScore,
          summary: previousSummary,
          partial,
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
          `[review] Round ${roundNum} complete: convergence=${convergenceScore.toFixed(3)}, responses=${responses.length}${partial ? " (partial)" : ""}`,
        );

        // Early exit on convergence
        if (convergenceScore >= CONVERGENCE_THRESHOLD) {
          console.log(
            `[review] Convergence reached at round ${roundNum}: ${convergenceScore.toFixed(3)} >= ${CONVERGENCE_THRESHOLD}`,
          );
          break;
        }
      }

      // --- Synthesis (cached + Zod validated) ---
      const finalRound = roundsData[roundsData.length - 1];
      const finalConvergence = finalRound?.convergenceScore ?? 0;
      const synthesis = await generateSynthesis(ctx, roundsData, finalConvergence);

      // Check if any round was partial
      const hadPartialRounds = roundsData.some((r) => r.partial);

      // Compute agent journeys
      const agentJourneys = agents.map((_, i) => {
        const agentId = agentIds[i];
        const meta = agentMeta[i];
        const positions = roundsData
          .map((round) => {
            const resp = round.responses.find((r) => r.agentId === agentId);
            return resp
              ? { round: round.roundNumber, stance: resp.stance, confidence: resp.confidence }
              : null;
          })
          .filter(
            (p): p is { round: number; stance: string; confidence: number } =>
              p !== null,
          );

        let stanceChanges = 0;
        for (let k = 1; k < positions.length; k++) {
          if (positions[k].stance !== positions[k - 1].stance) {
            stanceChanges++;
          }
        }
        const maxChanges = Math.max(positions.length - 1, 1);
        const consistencyScore = 1 - stanceChanges / maxChanges;

        return {
          agentId,
          agentName: meta.name,
          reasoningStyle: meta.reasoningStyle,
          finalStance: positions[positions.length - 1]?.stance || "",
          totalStanceChanges: stanceChanges,
          consistencyScore,
          positions,
        };
      });

      // Average confidence from final round
      const finalResponses = finalRound?.responses || [];
      const avgConfidence =
        finalResponses.length > 0
          ? finalResponses.reduce((s, r) => s + r.confidence, 0) /
            finalResponses.length
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

      console.log(
        `[review] Completed ${reviewId}: approval=${synthesis.approvalScore}${hadPartialRounds ? " (had partial rounds)" : ""}`,
      );

      // --- Webhook ---
      if (callbackUrl && callbackSecret) {
        const webhookPayload = {
          review_id: reviewId,
          session_id: sessionId,
          status: "completed" as const,
          partial: hadPartialRounds,
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
              finalResponses.find((r) => r.agentId === a.agentId)?.confidence ??
              a.confidence,
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
