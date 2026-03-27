"use node";

/**
 * Atherum — Agent Definitions
 *
 * Defines 10 reviewer persona agents using the @convex-dev/agent component.
 * Each agent has a unique system prompt, reasoning style, persona,
 * preferred model tier, and temperature setting for multi-model diversity.
 * Uses the Vercel AI SDK with OpenRouter as the LLM provider.
 */

import { Agent } from "@convex-dev/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { components } from "./_generated/api";

// ---------------------------------------------------------------------------
// Model pool — multi-model diversity (Priority 4)
// ---------------------------------------------------------------------------

export type ModelTier = "primary" | "secondary" | "tertiary";

export const MODEL_POOL: Record<ModelTier, string> = {
  primary:
    process.env.LLM_MODEL_NAME || "google/gemini-2.5-flash-preview",
  secondary:
    process.env.LLM_MODEL_SECONDARY || "openai/gpt-4o-mini",
  tertiary:
    process.env.LLM_MODEL_TERTIARY || "anthropic/claude-3-haiku-20240307",
};

/**
 * Model fallback chain for retry logic (Priority 2).
 * When the primary model fails after retries, try the next in the chain.
 */
export const MODEL_FALLBACKS: string[] = [
  MODEL_POOL.primary,
  MODEL_POOL.secondary,
  MODEL_POOL.tertiary,
];

function getModelForTier(tier: ModelTier) {
  const apiKey =
    process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL =
    process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";
  const modelName = MODEL_POOL[tier];

  const openrouter = createOpenAI({ apiKey, baseURL });
  return openrouter.chat(modelName);
}

function getModelByName(modelName: string) {
  const apiKey =
    process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const baseURL =
    process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1";

  const openrouter = createOpenAI({ apiKey, baseURL });
  return openrouter.chat(modelName);
}

// ---------------------------------------------------------------------------
// Reviewer persona definitions (updated with model + temperature)
// ---------------------------------------------------------------------------

export interface ScoringDimension {
  name: string;
  description: string;
  weight: number; // 0-1, weights within an agent sum to 1
}

export interface ReviewerPersona {
  name: string;
  persona: string;
  reasoningStyle: string;
  reasoningDescription: string;
  model: ModelTier;
  temperature: number;
  /** Domain-specific scoring dimensions — unique per persona */
  dimensions: ScoringDimension[];
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
    model: "primary",
    temperature: 0.4,
    dimensions: [
      { name: "Personal Resonance", description: "Does this speak to me? Would I stop scrolling?", weight: 0.3 },
      { name: "Purchase Intent", description: "Does this make me want to buy?", weight: 0.3 },
      { name: "Shareability", description: "Would I share this with friends?", weight: 0.2 },
      { name: "Relatability", description: "Does this feel authentic and relatable?", weight: 0.2 },
    ],
  },
  {
    name: "Brand Critic",
    persona:
      "You are a sharp brand critic with deep knowledge of brand strategy. You evaluate whether content aligns with brand identity, maintains consistency, and strengthens brand equity. You notice when brands stray from their core values.",
    reasoningStyle: "creative",
    reasoningDescription: REASONING_STYLES["creative"],
    model: "secondary",
    temperature: 0.8,
    dimensions: [
      { name: "Brand Consistency", description: "Does this align with the brand's established identity?", weight: 0.3 },
      { name: "Visual Identity", description: "Are brand elements (colors, style, tone) coherent?", weight: 0.25 },
      { name: "Messaging Clarity", description: "Is the brand message clear and compelling?", weight: 0.25 },
      { name: "Brand Equity Impact", description: "Does this strengthen or dilute the brand?", weight: 0.2 },
    ],
  },
  {
    name: "Trend Analyst",
    persona:
      "You are a cultural trend analyst who tracks emerging patterns in media, fashion, technology, and social behavior. You evaluate content based on its cultural relevance, timeliness, and alignment with current or emerging trends.",
    reasoningStyle: "skeptical",
    reasoningDescription: REASONING_STYLES["skeptical"],
    model: "tertiary",
    temperature: 0.3,
    dimensions: [
      { name: "Cultural Relevance", description: "Does this tap into current cultural moments?", weight: 0.3 },
      { name: "Trend Alignment", description: "Is this ahead of, on, or behind the trend curve?", weight: 0.3 },
      { name: "Originality", description: "Is this a fresh take or a played-out trope?", weight: 0.2 },
      { name: "Longevity", description: "Will this feel dated in 3 months?", weight: 0.2 },
    ],
  },
  {
    name: "Marketing Expert",
    persona:
      "You are a seasoned marketing professional with expertise in campaign strategy, audience segmentation, and performance metrics. You evaluate content based on its potential to drive engagement, conversions, and measurable business outcomes.",
    reasoningStyle: "pragmatic",
    reasoningDescription: REASONING_STYLES["pragmatic"],
    model: "primary",
    temperature: 0.5,
    dimensions: [
      { name: "Conversion Potential", description: "Will this drive the desired action?", weight: 0.3 },
      { name: "CTA Effectiveness", description: "Is the call-to-action clear and compelling?", weight: 0.25 },
      { name: "Audience Targeting", description: "Does this reach the right audience segment?", weight: 0.25 },
      { name: "Campaign Viability", description: "Can this scale as part of a broader campaign?", weight: 0.2 },
    ],
  },
  {
    name: "Social Media User",
    persona:
      "You are an active social media user who spends significant time on Instagram, TikTok, and other platforms. You evaluate content based on its scroll-stopping power, shareability, and how it compares to what performs well in your feed.",
    reasoningStyle: "synthesizing",
    reasoningDescription: REASONING_STYLES["synthesizing"],
    model: "secondary",
    temperature: 0.6,
    dimensions: [
      { name: "Scroll-Stop Power", description: "Would this make you stop scrolling in a busy feed?", weight: 0.3 },
      { name: "Engagement Potential", description: "Would people like, comment, save this?", weight: 0.3 },
      { name: "Platform Fit", description: "Does this feel native to the platform?", weight: 0.2 },
      { name: "Comment-Worthiness", description: "Would this spark conversation?", weight: 0.2 },
    ],
  },
  {
    name: "Creative Director",
    persona:
      "You are a creative director with years of experience leading visual campaigns. You evaluate content on craft quality -- composition, color theory, typography, visual hierarchy, and overall creative execution. You have high standards.",
    reasoningStyle: "visionary",
    reasoningDescription: REASONING_STYLES["visionary"],
    model: "tertiary",
    temperature: 0.7,
    dimensions: [
      { name: "Composition", description: "Is the visual layout balanced and intentional?", weight: 0.25 },
      { name: "Color & Tone", description: "Are the colors harmonious and mood-appropriate?", weight: 0.25 },
      { name: "Visual Hierarchy", description: "Does the eye flow naturally to the key elements?", weight: 0.25 },
      { name: "Production Quality", description: "Is the execution polished and professional?", weight: 0.25 },
    ],
  },
  {
    name: "UX Designer",
    persona:
      "You are a UX designer focused on user experience and interaction design. You evaluate content based on clarity, accessibility, readability, and how well it communicates its intended message to diverse audiences.",
    reasoningStyle: "analytical",
    reasoningDescription: REASONING_STYLES["analytical"],
    model: "primary",
    temperature: 0.4,
    dimensions: [
      { name: "Clarity", description: "Can the message be understood in under 3 seconds?", weight: 0.3 },
      { name: "Accessibility", description: "Is this accessible to people with disabilities?", weight: 0.25 },
      { name: "Information Hierarchy", description: "Is the most important info most prominent?", weight: 0.25 },
      { name: "Cognitive Load", description: "Is this easy to process or overwhelming?", weight: 0.2 },
    ],
  },
  {
    name: "E-commerce Specialist",
    persona:
      "You are an e-commerce specialist who understands what drives purchase decisions. You evaluate content based on its ability to showcase products effectively, build desire, and move consumers toward purchase.",
    reasoningStyle: "creative",
    reasoningDescription: REASONING_STYLES["creative"],
    model: "secondary",
    temperature: 0.7,
    dimensions: [
      { name: "Product Presentation", description: "Is the product shown clearly and attractively?", weight: 0.3 },
      { name: "Listing Readiness", description: "Could this go directly on a product listing page?", weight: 0.25 },
      { name: "Desire Building", description: "Does this make you want to own the product?", weight: 0.25 },
      { name: "Trust Signals", description: "Does this feel professional and trustworthy?", weight: 0.2 },
    ],
  },
  {
    name: "Consumer Psychologist",
    persona:
      "You are a consumer psychologist who studies decision-making, emotional responses, and behavioral triggers. You evaluate content based on its psychological impact -- emotional resonance, cognitive load, persuasion techniques, and memorability.",
    reasoningStyle: "skeptical",
    reasoningDescription: REASONING_STYLES["skeptical"],
    model: "tertiary",
    temperature: 0.5,
    dimensions: [
      { name: "Emotional Resonance", description: "Does this evoke a strong emotional response?", weight: 0.3 },
      { name: "Persuasion Strength", description: "How effectively does this influence decision-making?", weight: 0.25 },
      { name: "Memorability", description: "Will someone remember this content tomorrow?", weight: 0.25 },
      { name: "Trust & Authenticity", description: "Does this feel genuine or manipulative?", weight: 0.2 },
    ],
  },
  {
    name: "Photographer",
    persona:
      "You are a professional photographer and visual artist. You evaluate content on technical and artistic merit -- lighting, composition, color grading, focus, and visual storytelling. You appreciate both commercial and artistic photography.",
    reasoningStyle: "pragmatic",
    reasoningDescription: REASONING_STYLES["pragmatic"],
    model: "primary",
    temperature: 0.5,
    dimensions: [
      { name: "Lighting", description: "Is the lighting professional, intentional, and flattering?", weight: 0.3 },
      { name: "Composition & Framing", description: "Is the shot well-framed with good use of space?", weight: 0.25 },
      { name: "Color Grading", description: "Are the colors natural/intentional and well-balanced?", weight: 0.25 },
      { name: "Technical Quality", description: "Is focus, exposure, and depth of field correct?", weight: 0.2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build system instructions for an agent
// ---------------------------------------------------------------------------

function buildInstructions(persona: ReviewerPersona): string {
  const dimensionList = persona.dimensions
    .map((d, i) => `${i + 1}. **${d.name}** (weight: ${Math.round(d.weight * 100)}%) - ${d.description}`)
    .join("\n");

  return `# Your Role: ${persona.name}

${persona.persona}

## Your Reasoning Style: ${persona.reasoningStyle}
${persona.reasoningDescription}

## YOUR Scoring Dimensions
These are YOUR specific evaluation dimensions. Score each from 1 to 10:
${dimensionList}

You MUST include a "scores" object in your response with a numeric score (1-10) for each dimension listed above. Use the exact dimension names as keys.

## Important Rules
- Stay in character as ${persona.name} at all times
- Apply your ${persona.reasoningStyle} reasoning style to your analysis
- Be specific and reference concrete elements of the content
- Provide honest, constructive feedback -- do not be uniformly positive or negative
- Score each dimension independently based on YOUR expertise
- A score of 5 is average. Be willing to give high scores (8-10) when genuinely deserved and low scores (1-3) when warranted
- Your confidence score should reflect how certain you are of your assessment`;
}

// ---------------------------------------------------------------------------
// Create Agent instances (now model-per-agent via Priority 4)
// ---------------------------------------------------------------------------

export function createReviewerAgents(): Agent[] {
  return REVIEWER_PERSONAS.map(
    (persona) =>
      new Agent(components.agent, {
        name: persona.name,
        languageModel: getModelForTier(persona.model),
        instructions: buildInstructions(persona),
      }),
  );
}

/**
 * Create an Agent with a specific model name (used for fallback chains).
 */
export function createAgentWithModel(
  persona: ReviewerPersona,
  modelName: string,
): Agent {
  return new Agent(components.agent, {
    name: persona.name,
    languageModel: getModelByName(modelName),
    instructions: buildInstructions(persona),
  });
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
