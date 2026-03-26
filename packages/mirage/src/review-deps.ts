/**
 * Mirage — Content Review Session Dependencies
 *
 * CLEAN-ROOM IMPLEMENTATION.
 *
 * Concrete implementations of the SessionDependencies interface for
 * the content review product. Connects the session controller to the
 * LLM client and convergence measurement.
 */

import type {
  AgentResponse,
  ConvergenceMeasurement,
  DeliberationConfig,
  DeliberationOutcome,
  DeliberationRound,
  Panelist,
  PersonaId,
  DeliberationRoundId,
} from "@atherum/core";
import type { Result } from "@atherum/core";
import type { SessionDependencies, PanelistContext, RoundPrompt } from "./session.js";
import { measureConvergenceTFIDF } from "./convergence.js";
import { complete } from "./llm.js";
import type { LLMConfig } from "./llm.js";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ReviewDepsOptions {
  llmConfig?: Partial<LLMConfig>;
}

/**
 * Create a concrete SessionDependencies implementation for content review.
 * Uses the LLM client for agent responses, round summaries, and outcome computation.
 * Uses TF-IDF for convergence measurement (no embedding API needed for v0).
 */
export function createReviewDeps(options?: ReviewDepsOptions): SessionDependencies {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  // Rough cost estimate: $0.10 per 1M input tokens, $0.40 per 1M output tokens (Gemini Flash)
  const INPUT_COST_PER_TOKEN = 0.10 / 1_000_000;
  const OUTPUT_COST_PER_TOKEN = 0.40 / 1_000_000;

  return {
    // -------------------------------------------------------------------
    // generateAgentResponse
    // -------------------------------------------------------------------
    async generateAgentResponse(
      persona: PanelistContext,
      prompt: RoundPrompt,
    ): Promise<Result<AgentResponse>> {
      try {
        const userPrompt = buildAgentUserPrompt(prompt);
        const hasImage = prompt.roundNumber === 1 && prompt.content?.items?.some((i) => i.url);
        const imageUrl = hasImage
          ? prompt.content?.items?.find((i) => i.url)?.url
          : undefined;

        const response = await complete(persona.systemPrompt, userPrompt, {
          temperature: 0.7,
          maxTokens: 2048,
          jsonMode: true,
          imageUrl,
          configOverrides: options?.llmConfig,
        });

        // Parse the JSON response
        let parsed: any;
        try {
          parsed = JSON.parse(response.content);
        } catch {
          // If JSON parsing fails, extract what we can
          parsed = {
            reasoning: response.content,
            position_summary: response.content.slice(0, 200),
            confidence: 0.5,
            scores: [],
          };
        }

        const agentResponse: AgentResponse = {
          personaId: persona.personaId,
          roundId: `round-${prompt.roundNumber}` as DeliberationRoundId,
          reasoning: parsed.reasoning || parsed.analysis || response.content,
          scores: Array.isArray(parsed.scores)
            ? parsed.scores.map((s: any) => ({
                dimension: s.dimension || s.category || "overall",
                score: typeof s.score === "number" ? Math.min(10, Math.max(1, s.score)) : 5,
                justification: s.justification || s.reason || "",
              }))
            : [],
          positionSummary:
            parsed.position_summary || parsed.positionSummary || parsed.summary || "",
          confidence: typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.5,
          positionShift: parsed.position_shift || parsed.positionShift || undefined,
          tokenUsage: response.tokenUsage,
        };

        return { ok: true, value: agentResponse };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "CONVERGENCE_FAILED" as const,
            engine: "mirage" as const,
            message: `Agent response generation failed: ${error instanceof Error ? error.message : String(error)}`,
            finalScore: 0,
            threshold: 0,
            roundsCompleted: prompt.roundNumber,
          },
        };
      }
    },

    // -------------------------------------------------------------------
    // measureConvergence
    // -------------------------------------------------------------------
    async measureConvergence(
      responses: AgentResponse[],
      priorMeasurements: ConvergenceMeasurement[],
    ): Promise<ConvergenceMeasurement> {
      const measurement = measureConvergenceTFIDF(responses, priorMeasurements);
      measurement.roundNumber = priorMeasurements.length + 1;
      return measurement;
    },

    // -------------------------------------------------------------------
    // generateRoundSummary
    // -------------------------------------------------------------------
    async generateRoundSummary(
      responses: AgentResponse[],
      convergence: ConvergenceMeasurement,
    ): Promise<string> {
      const positionsList = responses
        .map(
          (r, i) =>
            `Reviewer ${i + 1} (confidence: ${r.confidence.toFixed(2)}): ${r.positionSummary}`,
        )
        .join("\n");

      const systemPrompt = `You are a neutral moderator summarizing a panel discussion round.
Create an anonymous summary that captures the key themes, areas of agreement, and points of disagreement.
Do NOT identify individual reviewers by number. Synthesize the positions into themes.
Keep the summary under 500 words.`;

      const userPrompt = `Round convergence score: ${convergence.overallScore.toFixed(3)} (${convergence.clusters.length} opinion clusters detected)

Reviewer positions:
${positionsList}

Provide a neutral, anonymous summary of this round's discussion.`;

      try {
        const response = await complete(systemPrompt, userPrompt, {
          temperature: 0.3,
          maxTokens: 1024,
          configOverrides: options?.llmConfig,
        });
        return response.content;
      } catch (error) {
        // Fallback: simple concatenation
        return `Round summary (${responses.length} reviewers, convergence: ${convergence.overallScore.toFixed(2)}): Key themes discussed include the overall quality and effectiveness of the content. ${convergence.clusters.length} distinct opinion groups were identified.`;
      }
    },

    // -------------------------------------------------------------------
    // computeOutcome
    // -------------------------------------------------------------------
    async computeOutcome(
      rounds: DeliberationRound[],
      config: DeliberationConfig,
      panelists: Panelist[],
    ): Promise<DeliberationOutcome> {
      // Build journey data from rounds
      const journeyMap = new Map<
        string,
        Array<{ roundNumber: number; summary: string; confidence: number }>
      >();

      for (const round of rounds) {
        for (const response of round.responses) {
          if (!journeyMap.has(response.personaId)) {
            journeyMap.set(response.personaId, []);
          }
          journeyMap.get(response.personaId)!.push({
            roundNumber: round.roundNumber,
            summary: response.positionSummary,
            confidence: response.confidence,
          });
        }
      }

      // Aggregate scores across the final round
      const finalRound = rounds[rounds.length - 1];
      const finalResponses = finalRound?.responses || [];

      // Collect all score dimensions
      const dimensionScores = new Map<
        string,
        Array<{ personaId: PersonaId; score: number }>
      >();
      for (const response of finalResponses) {
        for (const score of response.scores || []) {
          if (!dimensionScores.has(score.dimension)) {
            dimensionScores.set(score.dimension, []);
          }
          dimensionScores.get(score.dimension)!.push({
            personaId: response.personaId,
            score: score.score,
          });
        }
      }

      const aggregatedScores = Array.from(dimensionScores.entries()).map(
        ([dimension, scores]) => {
          const values = scores.map((s) => s.score);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance =
            values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
          return {
            dimension,
            weightedMean: mean,
            standardDeviation: Math.sqrt(variance),
            scores,
          };
        },
      );

      // Determine resolution based on convergence
      const lastConvergence = finalRound?.convergence?.overallScore || 0;
      let resolution: DeliberationOutcome["resolution"];
      if (lastConvergence >= config.convergenceThreshold) {
        resolution = "consensus";
      } else if (lastConvergence >= config.convergenceThreshold * 0.7) {
        resolution = "majority";
      } else {
        resolution = "no-consensus";
      }

      // Use LLM to synthesize the final outcome
      const allPositions = finalResponses
        .map(
          (r, i) =>
            `Reviewer ${i + 1} (confidence: ${r.confidence.toFixed(2)}): ${r.positionSummary}\nReasoning: ${r.reasoning?.slice(0, 300) || "N/A"}`,
        )
        .join("\n\n");

      let synthesisResult: any = {};
      try {
        const systemPrompt = `You are synthesizing the final outcome of a content review panel deliberation.
Analyze all reviewer positions and produce a structured synthesis.
Respond in valid JSON.`;

        const userPrompt = `The panel has completed ${rounds.length} round(s) of deliberation.
Final convergence score: ${lastConvergence.toFixed(3)}
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

        const response = await complete(systemPrompt, userPrompt, {
          temperature: 0.3,
          maxTokens: 2048,
          jsonMode: true,
          configOverrides: options?.llmConfig,
        });

        try {
          synthesisResult = JSON.parse(response.content);
        } catch {
          synthesisResult = {
            winning_position: "Panel review completed with mixed results.",
            consensus_summary: "No clear synthesis could be generated.",
            key_agreements: [],
            remaining_dissent: [],
            minority_report: "",
            approval_score: 50,
            quick_summary: "The panel completed their review.",
          };
        }
      } catch {
        synthesisResult = {
          winning_position: "Panel review completed.",
          consensus_summary: "Synthesis generation failed.",
          key_agreements: [],
          remaining_dissent: [],
          minority_report: "",
          approval_score: 50,
          quick_summary: "The panel completed their review.",
        };
      }

      // Build minority reports from clusters
      const lastClusters = finalRound?.convergence?.clusters || [];
      const minorityReports: DeliberationOutcome["minorityReports"] = [];

      if (lastClusters.length > 1) {
        // The largest cluster is the majority; others are minority
        const sorted = [...lastClusters].sort(
          (a, b) => b.memberIds.length - a.memberIds.length,
        );
        for (let i = 1; i < sorted.length; i++) {
          minorityReports.push({
            personaIds: sorted[i].memberIds,
            position: sorted[i].centroidSummary,
            strengthOfConviction:
              sorted[i].internalCohesion,
          });
        }
      }

      // Build journeys
      const journeys = Array.from(journeyMap.entries()).map(
        ([personaId, positions]) => ({
          personaId: personaId as PersonaId,
          positions,
        }),
      );

      // Attach synthesis data to outcome for the webhook
      const outcome: DeliberationOutcome & { _synthesis?: any } = {
        resolution,
        aggregatedScores,
        majoritySummary:
          synthesisResult.winning_position ||
          synthesisResult.consensus_summary ||
          "Panel review completed.",
        minorityReports,
        journeys,
        _synthesis: synthesisResult,
      };

      return outcome;
    },

    // -------------------------------------------------------------------
    // recordCost (simple in-memory counter for v0)
    // -------------------------------------------------------------------
    async recordCost(
      tokens: { input: number; output: number },
      _model: string,
    ): Promise<{ costUsd: number; totalUsd: number; budgetExceeded: boolean }> {
      totalInputTokens += tokens.input;
      totalOutputTokens += tokens.output;

      const costUsd =
        tokens.input * INPUT_COST_PER_TOKEN +
        tokens.output * OUTPUT_COST_PER_TOKEN;
      totalCostUsd += costUsd;

      return {
        costUsd,
        totalUsd: totalCostUsd,
        budgetExceeded: totalCostUsd > 5.0, // $5 budget for v0
      };
    },

    // -------------------------------------------------------------------
    // audit (console.log for v0)
    // -------------------------------------------------------------------
    async audit(event: string, payload: Record<string, unknown>): Promise<void> {
      console.log(`[audit] ${event}`, JSON.stringify(payload, null, 0));
    },

    // -------------------------------------------------------------------
    // emit (no-op for v0)
    // -------------------------------------------------------------------
    emit(_event: string, _data: unknown): void {
      // No-op for v0 — SSE streaming will be added later
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildAgentUserPrompt(prompt: RoundPrompt): string {
  let userPrompt = "";

  if (prompt.roundNumber === 1) {
    // First round: agents see the content directly
    userPrompt += `## Content to Review\n\n`;
    userPrompt += `**Description:** ${prompt.subject}\n\n`;

    if (prompt.content?.items) {
      for (const item of prompt.content.items) {
        if (item.text) {
          userPrompt += `**Content Text:** ${item.text}\n\n`;
        }
        if (item.url) {
          userPrompt += `**Content Media:** An image has been provided for your visual review.\n\n`;
        }
      }
    }
  } else {
    // Subsequent rounds: agents see the previous round summary
    userPrompt += `## Round ${prompt.roundNumber} of ${prompt.totalRounds}\n\n`;
    userPrompt += `**Content Under Review:** ${prompt.subject}\n\n`;

    if (prompt.previousRoundSummary) {
      userPrompt += `## Previous Round Discussion Summary\n\n${prompt.previousRoundSummary}\n\n`;
    }

    if (prompt.ownPreviousResponse) {
      userPrompt += `## Your Previous Position\n\n`;
      userPrompt += `You said: "${prompt.ownPreviousResponse.positionSummary}"\n`;
      userPrompt += `Your confidence was: ${prompt.ownPreviousResponse.confidence.toFixed(2)}\n\n`;
      userPrompt += `Consider whether you want to maintain, refine, or change your position based on the discussion.\n\n`;
    }
  }

  if (prompt.guidingQuestions?.length) {
    userPrompt += `## Guiding Questions\n\n`;
    for (const q of prompt.guidingQuestions) {
      userPrompt += `- ${q}\n`;
    }
    userPrompt += "\n";
  }

  userPrompt += `## Response Format

Respond with a JSON object:
{
  "reasoning": "Your detailed analysis and reasoning (2-4 paragraphs)",
  "scores": [
    {
      "dimension": "dimension name",
      "score": <1-10>,
      "justification": "Brief justification for this score"
    }
  ],
  "position_summary": "Your overall position in 2-3 sentences",
  "confidence": <0.0 to 1.0>`;

  if (prompt.roundNumber > 1) {
    userPrompt += `,
  "position_shift": {
    "from": "your previous position (brief)",
    "to": "your current position (brief)",
    "reason": "why you shifted (or 'maintained position')"
  }`;
  }

  userPrompt += "\n}";

  return userPrompt;
}
