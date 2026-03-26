/**
 * Atherum Personas — Tiered Context Loader
 *
 * Implements the L0/L1/L2 memory loading strategy from ADR-004.
 * Builds the system prompt for a persona by layering context tiers.
 */

import type {
  Persona,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  DeliberationPrompt,
  PersonaId,
  WorkspaceId,
} from "@atherum/core";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ContextLoaderDependencies {
  /** Load recent episodic memories (last N sessions) */
  loadRecentEpisodic: (
    personaId: PersonaId,
    limit: number,
  ) => Promise<EpisodicMemory[]>;
  /** Load semantic memory for a workspace */
  loadSemantic: (
    personaId: PersonaId,
    workspaceId: WorkspaceId,
  ) => Promise<SemanticMemory | null>;
  /** Load procedural memory */
  loadProcedural: (personaId: PersonaId) => Promise<ProceduralMemory | null>;
  /** Retrieve relevant procedural memories given a query */
  retrieveProcedural: (
    personaId: PersonaId,
    query: string,
    limit: number,
  ) => Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

export interface AssembledContext {
  /** Full system prompt for the LLM */
  systemPrompt: string;
  /** Approximate token count */
  estimatedTokens: number;
  /** Which tiers were loaded */
  tiersLoaded: ("L0" | "L1" | "L2")[];
}

/**
 * Build the complete system prompt for a persona in a session.
 *
 * @param persona - The base persona
 * @param prompt - The deliberation prompt (L0 content)
 * @param workspaceId - For loading workspace-specific memory
 * @param options - Control which tiers to load
 */
export async function assembleContext(
  persona: Persona,
  prompt: DeliberationPrompt,
  workspaceId: WorkspaceId,
  deps: ContextLoaderDependencies,
  options: {
    loadL1?: boolean; // default true
    loadL2?: boolean; // default false (on-demand only)
    l2Query?: string; // if loadL2, what to search for
    brandContext?: string; // injected brand context
    role?: string; // "reviewer" | "devil-advocate" etc.
  } = {},
): Promise<AssembledContext> {
  const { loadL1 = true, loadL2 = false, l2Query, brandContext, role } = options;
  const tiersLoaded: AssembledContext["tiersLoaded"] = ["L0"];

  // ----- Build persona identity section -----
  const identitySection = buildIdentitySection(persona, role);

  // ----- L0: Current session context -----
  const l0Section = buildL0Section(prompt);

  // ----- L1: Semantic memory (accumulated preferences) -----
  let l1Section = "";
  if (loadL1) {
    const semantic = await deps.loadSemantic(persona.id, workspaceId);
    const recentEpisodic = await deps.loadRecentEpisodic(persona.id, 3);

    if (semantic || recentEpisodic.length > 0) {
      tiersLoaded.push("L1");
      l1Section = buildL1Section(semantic, recentEpisodic, brandContext);
    }
  }

  // ----- L2: Procedural memory (deep history, on-demand) -----
  let l2Section = "";
  if (loadL2 && l2Query) {
    const relevantMemories = await deps.retrieveProcedural(
      persona.id,
      l2Query,
      5,
    );
    if (relevantMemories.length > 0) {
      tiersLoaded.push("L2");
      l2Section = buildL2Section(relevantMemories);
    }
  }

  // ----- Assemble final prompt -----
  const systemPrompt = [
    identitySection,
    l1Section,
    l2Section,
    l0Section,
    buildEvaluationInstructions(persona),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Rough token estimate: ~4 chars per token
  const estimatedTokens = Math.ceil(systemPrompt.length / 4);

  return { systemPrompt, estimatedTokens, tiersLoaded };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildIdentitySection(persona: Persona, role?: string): string {
  const p = persona;
  const big5 = p.psychographics.personality;

  let section = `# Your Identity

You are ${p.name}, a ${p.demographics.age}-year-old ${p.demographics.occupation} from ${p.demographics.location}.

**Archetype:** ${p.archetype}
**Evaluation Lens:** ${p.evaluation.lens}

**Personality:**
- Openness: ${describeTraitLevel(big5.openness)} (${big5.openness.toFixed(2)})
- Conscientiousness: ${describeTraitLevel(big5.conscientiousness)} (${big5.conscientiousness.toFixed(2)})
- Extraversion: ${describeTraitLevel(big5.extraversion)} (${big5.extraversion.toFixed(2)})
- Agreeableness: ${describeTraitLevel(big5.agreeableness)} (${big5.agreeableness.toFixed(2)})
- Neuroticism: ${describeTraitLevel(big5.neuroticism)} (${big5.neuroticism.toFixed(2)})

**Values:** ${p.psychographics.values.join(", ")}
**Cultural Anchors:** ${p.psychographics.culturalAnchors.join(", ")}
**Media Style:** ${p.psychographics.mediaConsumptionStyle}

Stay in character. Your opinions should reflect this persona authentically. Do not break character or acknowledge that you are an AI.`;

  if (role) {
    section += `\n\n**Your role in this panel:** ${role}`;
    if (role === "devil-advocate") {
      section += `\nYou are specifically assigned to challenge the group's assumptions and present counterarguments, even if you personally might agree.`;
    }
  }

  return section;
}

function buildL0Section(prompt: DeliberationPrompt): string {
  let section = `# Current Task

**Subject:** ${prompt.subject}`;

  if (prompt.context) {
    section += `\n\n**Context:** ${prompt.context}`;
  }

  if (prompt.guidingQuestions?.length) {
    section += `\n\n**Questions to address:**\n${prompt.guidingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
  }

  return section;
}

function buildL1Section(
  semantic: SemanticMemory | null,
  recentEpisodic: EpisodicMemory[],
  brandContext?: string,
): string {
  const parts: string[] = ["# Your Background Knowledge"];

  if (brandContext) {
    parts.push(`**Brand Context:** ${brandContext}`);
  }

  if (semantic) {
    if (Object.keys(semantic.brandPreferences).length > 0) {
      parts.push("**Your brand preferences from past sessions:**");
      for (const [brand, pref] of Object.entries(semantic.brandPreferences)) {
        parts.push(`- ${brand}: ${pref}`);
      }
    }
    if (semantic.recurringThemes.length > 0) {
      parts.push(
        `**Themes you frequently raise:** ${semantic.recurringThemes.join(", ")}`,
      );
    }
  }

  if (recentEpisodic.length > 0) {
    parts.push("**Your recent session summaries:**");
    for (const ep of recentEpisodic) {
      parts.push(`- ${ep.summary}`);
    }
  }

  return parts.join("\n\n");
}

function buildL2Section(relevantMemories: string[]): string {
  return `# Deep Memory Recall

The following are relevant learnings from your past experience:

${relevantMemories.map((m) => `- ${m}`).join("\n")}`;
}

function buildEvaluationInstructions(persona: Persona): string {
  const rubrics = persona.evaluation.rubrics;

  return `# Evaluation Instructions

Evaluate the content using your personal scoring framework:

${rubrics.map((r) => `**${r.dimension}** (weight: ${(r.weight * 100).toFixed(0)}%)
  ${r.description}
  1 = ${r.lowAnchor} ... 10 = ${r.highAnchor}`).join("\n\n")}

**Your known biases (be aware of these):** ${persona.evaluation.knownBiases.join(", ")}

For each dimension, provide:
1. A score from 1-10
2. A brief justification from your perspective
3. Your overall confidence in this evaluation (0.0 to 1.0)

Also provide a position summary — a 2-3 sentence statement of your overall assessment.`;
}

function describeTraitLevel(value: number): string {
  if (value < 0.2) return "very low";
  if (value < 0.4) return "low";
  if (value < 0.6) return "moderate";
  if (value < 0.8) return "high";
  return "very high";
}
