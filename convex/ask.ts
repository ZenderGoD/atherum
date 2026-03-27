"use node";

/**
 * Atherum — Follow-up Question Action (Convex Node.js runtime)
 *
 * Takes a user question about a completed review, builds context from the
 * full deliberation transcript, and returns an LLM-generated answer.
 * Optionally targets a specific agent to respond in character.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// LLM client (same config as deliberate.ts)
// ---------------------------------------------------------------------------

function getLLMClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL = process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.LLM_MODEL_NAME || "google/gemini-2.5-flash-preview";

  const client = new OpenAI({ apiKey, baseURL });
  return { client, model };
}

// ---------------------------------------------------------------------------
// Follow-up question action
// ---------------------------------------------------------------------------

export const askQuestion = internalAction({
  args: {
    reviewId: v.string(),
    question: v.string(),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const { reviewId, question, agentId } = args;

    // Fetch the full transcript
    const transcript = await ctx.runQuery(api.reviews.getFullTranscript, { reviewId });

    if (!transcript) {
      return "Review not found.";
    }

    if (transcript.review.status !== "completed" || !transcript.result) {
      return "This review has not completed yet. Please wait for the deliberation to finish.";
    }

    // Build context from the transcript
    let contextPrompt = `# Deliberation Transcript for Review ${reviewId}\n\n`;
    contextPrompt += `**Content:** ${transcript.review.contentDescription}\n`;
    contextPrompt += `**Content Type:** ${transcript.review.contentType}\n\n`;

    // Agents
    contextPrompt += `## Panel Members\n`;
    for (const agent of transcript.agents) {
      contextPrompt += `- **${agent.name}** (${agent.reasoningStyle}): ${agent.persona}\n`;
    }
    contextPrompt += "\n";

    // Rounds
    for (const round of transcript.rounds) {
      contextPrompt += `## Round ${round.roundNumber}\n`;
      if (round.summary) {
        contextPrompt += `**Summary:** ${round.summary}\n\n`;
      }
      for (const response of round.responses) {
        contextPrompt += `### ${response.agentName} (${response.reasoningStyle})\n`;
        contextPrompt += `**Stance:** ${response.stance}\n`;
        contextPrompt += `**Reasoning:** ${response.reasoning}\n`;
        contextPrompt += `**Confidence:** ${response.confidence}\n`;
        if (response.influencedBy) {
          contextPrompt += `**Influenced by:** ${response.influencedBy}\n`;
        }
        contextPrompt += "\n";
      }
    }

    // Final result
    contextPrompt += `## Final Verdict\n`;
    contextPrompt += `**Winning Position:** ${transcript.result.winningPosition}\n`;
    contextPrompt += `**Approval Score:** ${transcript.result.approvalScore}/100\n`;
    contextPrompt += `**Convergence:** ${transcript.result.convergenceScore.toFixed(3)}\n`;
    contextPrompt += `**Quick Summary:** ${transcript.result.quickSummary}\n`;
    contextPrompt += `**Key Agreements:** ${transcript.result.keyAgreements.join("; ")}\n`;
    contextPrompt += `**Remaining Dissent:** ${transcript.result.remainingDissent.join("; ")}\n`;
    if (transcript.result.minorityReport) {
      contextPrompt += `**Minority Report:** ${transcript.result.minorityReport}\n`;
    }

    // Build system prompt based on whether targeting a specific agent
    let systemPrompt: string;

    if (agentId) {
      const targetAgent = transcript.agents.find((a) => a.agentId === agentId);
      if (!targetAgent) {
        return `Agent with ID ${agentId} not found in this review.`;
      }

      systemPrompt = `You are ${targetAgent.name}, a content review panelist with a ${targetAgent.reasoningStyle} reasoning style.

${targetAgent.persona}

You participated in a content review deliberation. The full transcript of the deliberation is provided below. Answer the user's question in character, drawing on your specific perspective and the positions you took during the deliberation.

Stay in character. Refer to your own positions and reasoning from the rounds. Be specific about what you observed and analyzed.

${contextPrompt}`;
    } else {
      systemPrompt = `You are a helpful assistant with access to the full transcript of a content review panel deliberation.

The panel consisted of ${transcript.agents.length} expert reviewers who deliberated across ${transcript.rounds.length} round(s). Answer the user's question based on the deliberation transcript below.

Be specific, reference particular agents' positions when relevant, and provide a balanced view that represents the full spectrum of the panel's discussion.

${contextPrompt}`;
    }

    // Call LLM
    const { client, model } = getLLMClient();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    });

    return response.choices[0]?.message?.content || "Unable to generate a response.";
  },
});
