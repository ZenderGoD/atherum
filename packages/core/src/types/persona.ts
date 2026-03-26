/**
 * Atherum Core — Persona Types
 *
 * A Persona is a persistent, culturally-grounded AI agent with evolving memory.
 * Personas are the atoms of every Atherum engine — they deliberate, simulate,
 * review content, and build knowledge.
 */

import type { PersonaId, WorkspaceId, SessionId } from "../ids";

// ---------------------------------------------------------------------------
// Demographic & psychographic profile
// ---------------------------------------------------------------------------

export interface Demographics {
  age: number;
  gender: string;
  location: string; // e.g. "Brooklyn, NY" — free text, culturally relevant
  occupation: string;
  incomeRange?: string;
  education?: string;
}

export interface Psychographics {
  /** Big Five personality traits, each 0..1 */
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  /** Free-form values that shape decision-making */
  values: string[];
  /** Cultural touchstones — media, brands, communities they identify with */
  culturalAnchors: string[];
  /** How they consume media — passive scroller, active commenter, creator, etc. */
  mediaConsumptionStyle: string;
}

// ---------------------------------------------------------------------------
// Evaluation framework — how this persona judges content
// ---------------------------------------------------------------------------

export interface ScoringRubric {
  /** Unique name, e.g. "visual_impact" */
  dimension: string;
  /** Human-readable description of what this dimension measures */
  description: string;
  /** Weight relative to other dimensions for this persona (0..1, sum to 1) */
  weight: number;
  /** Anchors for the low and high ends of the scale */
  lowAnchor: string;   // e.g. "generic, forgettable"
  highAnchor: string;  // e.g. "iconic, instantly recognizable"
}

export interface EvaluationFramework {
  /** What this persona primarily looks for when evaluating content */
  lens: string; // e.g. "authenticity seeker", "trend analyst", "craft purist"
  /** Ordered scoring rubric — defines per-agent scoring dimensions */
  rubrics: ScoringRubric[];
  /** Biases this persona tends to exhibit (for transparency / debiasing) */
  knownBiases: string[];
}

// ---------------------------------------------------------------------------
// Memory tiers
// ---------------------------------------------------------------------------

/** L0 — injected fresh each session */
export interface EpisodicMemory {
  sessionId: SessionId;
  timestamp: Date;
  summary: string;
  /** Key decisions or opinions expressed */
  positions: Array<{ topic: string; stance: string; confidence: number }>;
}

/** L1 — accumulated preferences and patterns */
export interface SemanticMemory {
  /** Brand-specific taste profiles built over sessions */
  brandPreferences: Record<string, string>; // brandId -> preference summary
  /** Recurring themes in their evaluations */
  recurringThemes: string[];
  /** Updated periodically via procedural extraction */
  lastDistilledAt: Date;
}

/** L2 — compressed full history, loaded only when needed */
export interface ProceduralMemory {
  /** Distilled learnings — "rules of thumb" this persona has developed */
  learnings: Array<{
    rule: string;
    derivedFrom: SessionId[];
    confidence: number;
  }>;
  /** Skills acquired mid-session (e.g. learned to evaluate video pacing) */
  acquiredSkills: Array<{
    skill: string;
    acquiredAt: Date;
    proficiency: number; // 0..1
  }>;
}

// ---------------------------------------------------------------------------
// Full Persona
// ---------------------------------------------------------------------------

export interface Persona {
  id: PersonaId;
  workspaceId: WorkspaceId | null; // null = global roster persona
  name: string;
  archetype: string; // e.g. "Gen-Z Streetwear Enthusiast", "Midwest Mom Blogger"
  demographics: Demographics;
  psychographics: Psychographics;
  evaluation: EvaluationFramework;

  /** Memory — loaded on demand per tier */
  memory: {
    episodic: EpisodicMemory[];   // L0 — recent sessions
    semantic: SemanticMemory;      // L1
    procedural: ProceduralMemory;  // L2
  };

  /** When this persona was generated and from what source */
  provenance: {
    generatedAt: Date;
    generationMethod: "daily-roster" | "workspace-custom" | "on-demand";
    trendSignals: string[]; // web search signals used during generation
  };

  /** Consistency tracking — detect when persona drifts too far */
  consistency: {
    baselineEmbedding: number[]; // embedding of original persona prompt
    currentDrift: number;        // cosine distance from baseline, 0..1
    lastCheckedAt: Date;
  };
}

// ---------------------------------------------------------------------------
// Persona generation request
// ---------------------------------------------------------------------------

export interface PersonaGenerationRequest {
  workspaceId: WorkspaceId | null;
  count: number;
  /** Optional constraints */
  constraints?: {
    archetypes?: string[];        // target archetypes
    demographicFilters?: Partial<Demographics>;
    requiredRubrics?: string[];   // must include these scoring dimensions
  };
  /** Web search signals to ground personas in current trends */
  trendContext?: string[];
}

export interface PersonaGenerationResult {
  personas: Persona[];
  costUsd: number;
  generatedAt: Date;
}
