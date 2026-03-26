/**
 * Atherum Core — Deliberation Types
 *
 * Deliberation is structured multi-agent debate. A session progresses through
 * rounds, each round producing agent responses that are measured for convergence.
 * Sessions can fork into subgroups (side conversations, coalitions) and merge
 * back into the main thread.
 */

import type {
  SessionId,
  PersonaId,
  WorkspaceId,
  DeliberationRoundId,
  SubgroupId,
} from "../ids";

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

export type DeliberationStrategy =
  | "panel-review"       // structured content evaluation with scoring
  | "adversarial"        // intentional devil's advocate assignment
  | "consensus-seeking"  // minimize divergence, find common ground
  | "exploration"        // maximize diversity of perspectives
  | "tournament";        // bracket-style elimination of ideas

export interface DeliberationConfig {
  strategy: DeliberationStrategy;
  maxRounds: number;
  /** Cosine similarity threshold — if all positions within this, declare consensus */
  convergenceThreshold: number; // 0..1, typical: 0.85
  /** Allow early exit if consensus reached before maxRounds */
  allowEarlyExit: boolean;
  /** Enable concurrent subgroups (side conversations) */
  enableSubgroups: boolean;
  /** Maximum LLM cost in USD before session is force-stopped */
  costBudgetUsd: number;
  /** Whether to include anonymous summaries between rounds */
  anonymousSummaries: boolean;
  /** Voting configuration */
  voting: {
    method: "weighted" | "equal" | "ranked-choice";
    /** If weighted, how to compute weights */
    weightSource?: "domain-relevance" | "confidence" | "custom";
  };
}

// ---------------------------------------------------------------------------
// Prompt — what the agents are deliberating about
// ---------------------------------------------------------------------------

export interface DeliberationPrompt {
  /** Main question or content to evaluate */
  subject: string;
  /** Structured content payload (images, video URLs, text, etc.) */
  content?: ContentPayload;
  /** Additional context injected into every agent's system prompt */
  context?: string;
  /** Specific questions the agents should address */
  guidingQuestions?: string[];
}

export interface ContentPayload {
  type: "image" | "video" | "text" | "mixed";
  items: Array<{
    mediaType: string;
    url?: string;
    text?: string;
    metadata?: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Session — the full deliberation lifecycle
// ---------------------------------------------------------------------------

export type SessionStatus =
  | "configuring"   // session created, agents being assigned
  | "running"       // deliberation in progress
  | "converged"     // consensus reached (early exit)
  | "completed"     // max rounds reached
  | "budget-exceeded" // cost limit hit
  | "failed";       // unrecoverable error

export interface DeliberationSession {
  id: SessionId;
  workspaceId: WorkspaceId;
  config: DeliberationConfig;
  prompt: DeliberationPrompt;
  status: SessionStatus;

  /** Assigned panelists */
  panelists: Panelist[];

  /** Completed rounds */
  rounds: DeliberationRound[];

  /** Active subgroups (if enabled) */
  subgroups: Subgroup[];

  /** Convergence history — one measurement per round */
  convergenceHistory: ConvergenceMeasurement[];

  /** Final outcome */
  outcome?: DeliberationOutcome;

  /** Cost tracking */
  cost: {
    totalUsd: number;
    breakdown: Array<{ roundId: DeliberationRoundId; costUsd: number }>;
  };

  /** Timestamps */
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ---------------------------------------------------------------------------
// Panelist — a persona assigned to this session with session-specific config
// ---------------------------------------------------------------------------

export interface Panelist {
  personaId: PersonaId;
  /** Role within this deliberation */
  role: "reviewer" | "devil-advocate" | "moderator" | "specialist";
  /** Domain relevance weight (0..1) — used for weighted voting */
  domainWeight: number;
  /** Which subgroups this panelist participates in */
  subgroupIds: SubgroupId[];
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export interface DeliberationRound {
  id: DeliberationRoundId;
  sessionId: SessionId;
  roundNumber: number;
  /** What each agent was shown (includes prior round summary if anonymousSummaries) */
  inputSummary?: string;
  /** Individual agent responses */
  responses: AgentResponse[];
  /** Convergence measurement after this round */
  convergence: ConvergenceMeasurement;
  /** Cost of this round */
  costUsd: number;
  startedAt: Date;
  completedAt: Date;
}

export interface AgentResponse {
  personaId: PersonaId;
  roundId: DeliberationRoundId;
  /** The agent's full reasoning */
  reasoning: string;
  /** Structured score (if panel-review strategy) */
  scores?: Array<{
    dimension: string;
    score: number;      // 1..10
    justification: string;
  }>;
  /** Position summary — used for convergence computation */
  positionSummary: string;
  /** Embedding of positionSummary — computed server-side */
  positionEmbedding?: number[];
  /** Confidence in their position (0..1) */
  confidence: number;
  /** Whether this agent changed their position from the previous round */
  positionShift?: {
    from: string;
    to: string;
    reason: string;
  };
  /** Token usage */
  tokenUsage: { input: number; output: number };
}

// ---------------------------------------------------------------------------
// Subgroups — concurrent side conversations
// ---------------------------------------------------------------------------

export interface Subgroup {
  id: SubgroupId;
  sessionId: SessionId;
  name: string; // e.g. "Visual Design Coalition", "Skeptics Corner"
  memberIds: PersonaId[];
  /** Subgroup-specific prompt refinement */
  focusTopic?: string;
  /** Rounds that happened within this subgroup */
  internalRounds: DeliberationRound[];
  /** Summary produced when subgroup merges back */
  mergeSummary?: string;
}

// ---------------------------------------------------------------------------
// Convergence measurement
// ---------------------------------------------------------------------------

export interface ConvergenceMeasurement {
  roundNumber: number;
  /** Overall convergence score (0..1, 1 = perfect consensus) */
  overallScore: number;
  /** Pairwise similarity matrix (agent x agent) */
  pairwiseSimilarities: Array<{
    agentA: PersonaId;
    agentB: PersonaId;
    similarity: number;
  }>;
  /** Identified clusters of agreement */
  clusters: Array<{
    memberIds: PersonaId[];
    centroidSummary: string;
    internalCohesion: number;
  }>;
  /** Method used */
  method: "tfidf-cosine" | "embedding-cosine";
}

// ---------------------------------------------------------------------------
// Outcome — final result of deliberation
// ---------------------------------------------------------------------------

export interface DeliberationOutcome {
  /** How the session ended */
  resolution: "consensus" | "majority" | "no-consensus" | "budget-stop";
  /** Aggregated scores (if panel-review) */
  aggregatedScores?: Array<{
    dimension: string;
    weightedMean: number;
    standardDeviation: number;
    scores: Array<{ personaId: PersonaId; score: number }>;
  }>;
  /** Majority position summary */
  majoritySummary: string;
  /** Minority/dissenting positions */
  minorityReports: Array<{
    personaIds: PersonaId[];
    position: string;
    strengthOfConviction: number;
  }>;
  /** Vote tally */
  votes?: Array<{
    personaId: PersonaId;
    vote: string;
    weight: number;
  }>;
  /** Agent journey — how each agent's position evolved */
  journeys: Array<{
    personaId: PersonaId;
    positions: Array<{
      roundNumber: number;
      summary: string;
      confidence: number;
    }>;
  }>;
}
