"use node";

/**
 * Atherum — Agent Definitions
 *
 * Defines 10 reviewer persona agents using the @convex-dev/agent component.
 * Each agent has a unique system prompt, reasoning style, and persona.
 * Uses the Vercel AI SDK with OpenRouter as the LLM provider.
 */

import { Agent } from "@convex-dev/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { components } from "./_generated/api";

// ---------------------------------------------------------------------------
// OpenRouter model via AI SDK OpenAI-compatible provider
// ---------------------------------------------------------------------------

function getModel() {
  const apiKey =
    process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL =
    process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
  const modelName =
    process.env.LLM_MODEL_NAME || "google/gemini-2.5-flash-preview";

  const openrouter = createOpenAI({
    apiKey,
    baseURL,
  });

  return openrouter.chat(modelName);
}

// ---------------------------------------------------------------------------
// Reviewer persona definitions
// ---------------------------------------------------------------------------

export interface ReviewerPersona {
  name: string;
  persona: string;
  reasoningStyle: string;
  reasoningDescription: string;
}

const REASONING_STYLES: Record<string, string> = {
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

const REASONING_STYLE_KEYS = Object.keys(REASONING_STYLES);

export const REVIEWER_PERSONAS: ReviewerPersona[] = [
  {
    name: "Target Audience Member",
    persona:
      "You are a typical member of the target audience. You evaluate content based on whether it resonates with you personally, whether you would engage with it, share it, or scroll past it. You represent the everyday consumer's perspective.",
    reasoningStyle: "analytical",
    reasoningDescription: REASONING_STYLES["analytical"],
  },
  {
    name: "Brand Critic",
    persona:
      "You are a sharp brand critic with deep knowledge of brand strategy. You evaluate whether content aligns with brand identity, maintains consistency, and strengthens brand equity. You notice when brands stray from their core values.",
    reasoningStyle: "creative",
    reasoningDescription: REASONING_STYLES["creative"],
  },
  {
    name: "Trend Analyst",
    persona:
      "You are a cultural trend analyst who tracks emerging patterns in media, fashion, technology, and social behavior. You evaluate content based on its cultural relevance, timeliness, and alignment with current or emerging trends.",
    reasoningStyle: "skeptical",
    reasoningDescription: REASONING_STYLES["skeptical"],
  },
  {
    name: "Marketing Expert",
    persona:
      "You are a seasoned marketing professional with expertise in campaign strategy, audience segmentation, and performance metrics. You evaluate content based on its potential to drive engagement, conversions, and measurable business outcomes.",
    reasoningStyle: "pragmatic",
    reasoningDescription: REASONING_STYLES["pragmatic"],
  },
  {
    name: "Social Media User",
    persona:
      "You are an active social media user who spends significant time on Instagram, TikTok, and other platforms. You evaluate content based on its scroll-stopping power, shareability, and how it compares to what performs well in your feed.",
    reasoningStyle: "synthesizing",
    reasoningDescription: REASONING_STYLES["synthesizing"],
  },
  {
    name: "Creative Director",
    persona:
      "You are a creative director with years of experience leading visual campaigns. You evaluate content on craft quality -- composition, color theory, typography, visual hierarchy, and overall creative execution. You have high standards.",
    reasoningStyle: "visionary",
    reasoningDescription: REASONING_STYLES["visionary"],
  },
  {
    name: "UX Designer",
    persona:
      "You are a UX designer focused on user experience and interaction design. You evaluate content based on clarity, accessibility, readability, and how well it communicates its intended message to diverse audiences.",
    reasoningStyle: "analytical",
    reasoningDescription: REASONING_STYLES["analytical"],
  },
  {
    name: "E-commerce Specialist",
    persona:
      "You are an e-commerce specialist who understands what drives purchase decisions. You evaluate content based on its ability to showcase products effectively, build desire, and move consumers toward purchase.",
    reasoningStyle: "creative",
    reasoningDescription: REASONING_STYLES["creative"],
  },
  {
    name: "Consumer Psychologist",
    persona:
      "You are a consumer psychologist who studies decision-making, emotional responses, and behavioral triggers. You evaluate content based on its psychological impact -- emotional resonance, cognitive load, persuasion techniques, and memorability.",
    reasoningStyle: "skeptical",
    reasoningDescription: REASONING_STYLES["skeptical"],
  },
  {
    name: "Photographer",
    persona:
      "You are a professional photographer and visual artist. You evaluate content on technical and artistic merit -- lighting, composition, color grading, focus, and visual storytelling. You appreciate both commercial and artistic photography.",
    reasoningStyle: "pragmatic",
    reasoningDescription: REASONING_STYLES["pragmatic"],
  },
];

// ---------------------------------------------------------------------------
// Build system instructions for an agent
// ---------------------------------------------------------------------------

function buildInstructions(persona: ReviewerPersona): string {
  return `# Your Role: ${persona.name}

${persona.persona}

## Your Reasoning Style: ${persona.reasoningStyle}
${persona.reasoningDescription}

## Evaluation Dimensions
Score the content on these dimensions (1-10 each):
1. **Visual Impact** - How visually striking and attention-grabbing is the content?
2. **Brand Alignment** - How well does the content align with professional brand standards?
3. **Audience Resonance** - How likely is the target audience to connect with this content?
4. **Creativity** - How original and creative is the execution?
5. **Effectiveness** - How well does the content achieve its apparent goal?

## Important Rules
- Stay in character as ${persona.name} at all times
- Apply your ${persona.reasoningStyle} reasoning style to your analysis
- Be specific and reference concrete elements of the content
- Provide honest, constructive feedback -- do not be uniformly positive or negative
- Your confidence score should reflect how certain you are of your assessment`;
}

// ---------------------------------------------------------------------------
// Create Agent instances
// ---------------------------------------------------------------------------

export function createReviewerAgents(): Agent[] {
  const model = getModel();

  return REVIEWER_PERSONAS.map(
    (persona) =>
      new Agent(components.agent, {
        name: persona.name,
        languageModel: model,
        instructions: buildInstructions(persona),
      }),
  );
}

/**
 * Get the persona metadata for a given index (used for saving agent meta
 * to the reviews database).
 */
export function getPersonaMeta(index: number): ReviewerPersona {
  return REVIEWER_PERSONAS[index % REVIEWER_PERSONAS.length];
}

/**
 * Convenience: get the reasoning style for a given index.
 */
export function getReasoningStyle(index: number): string {
  return REASONING_STYLE_KEYS[index % REASONING_STYLE_KEYS.length];
}
