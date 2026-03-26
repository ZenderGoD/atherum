/**
 * Mirage — Deliberation Session Controller
 *
 * CLEAN-ROOM IMPLEMENTATION. No MiroFish code referenced.
 *
 * The session controller manages the lifecycle of a multi-agent deliberation.
 * It orchestrates rounds, tracks convergence, manages subgroups, and
 * determines when to stop.
 *
 * Architecture decision: The session is a state machine, not a loop.
 * Each state transition is explicit, auditable, and can be resumed after
 * failures. This makes the system debuggable and the audit trail natural.
 */

import type {
  DeliberationSession,
  DeliberationConfig,
  DeliberationPrompt,
  DeliberationRound,
  Panelist,
  AgentResponse,
  ConvergenceMeasurement,
  DeliberationOutcome,
  SessionId,
  WorkspaceId,
  PersonaId,
} from "@atherum/core";
import type { Result } from "@atherum/core";

// ---------------------------------------------------------------------------
// Session state machine
// ---------------------------------------------------------------------------

/**
 * State transitions:
 *
 *   CREATED -> ASSEMBLING -> DELIBERATING -> SUMMARIZING -> (loop or exit)
 *                                               |
 *                                               v
 *                                     COMPUTING_OUTCOME -> DONE
 *
 * At each transition, an audit event is emitted and cost is checked.
 */
type InternalState =
  | "CREATED"
  | "ASSEMBLING_PANEL"
  | "DELIBERATING_ROUND"
  | "MEASURING_CONVERGENCE"
  | "GENERATING_SUMMARY"
  | "COMPUTING_OUTCOME"
  | "DONE"
  | "ERROR";

// ---------------------------------------------------------------------------
// Dependencies — injected, not imported
// ---------------------------------------------------------------------------

export interface SessionDependencies {
  /** Generate responses from agents — wraps LLM calls */
  generateAgentResponse: (
    persona: PanelistContext,
    prompt: RoundPrompt,
  ) => Promise<Result<AgentResponse>>;

  /** Compute convergence from responses */
  measureConvergence: (
    responses: AgentResponse[],
    priorMeasurements: ConvergenceMeasurement[],
  ) => Promise<ConvergenceMeasurement>;

  /** Generate anonymous summary between rounds */
  generateRoundSummary: (
    responses: AgentResponse[],
    convergence: ConvergenceMeasurement,
  ) => Promise<string>;

  /** Compute final outcome from all rounds */
  computeOutcome: (
    rounds: DeliberationRound[],
    config: DeliberationConfig,
    panelists: Panelist[],
  ) => Promise<DeliberationOutcome>;

  /** Track cost — returns whether budget is exceeded */
  recordCost: (tokens: { input: number; output: number }, model: string) => Promise<{
    costUsd: number;
    totalUsd: number;
    budgetExceeded: boolean;
  }>;

  /** Emit audit event */
  audit: (event: string, payload: Record<string, unknown>) => Promise<void>;

  /** Emit SSE event for real-time streaming */
  emit: (event: string, data: unknown) => void;
}

export interface PanelistContext {
  personaId: PersonaId;
  /** Full persona prompt including memory, brand context, role assignment */
  systemPrompt: string;
  /** Scoring rubrics for panel-review strategy */
  rubrics?: Array<{ dimension: string; description: string; weight: number }>;
  role: Panelist["role"];
  domainWeight: number;
}

export interface RoundPrompt {
  /** The original deliberation subject */
  subject: string;
  content: DeliberationPrompt["content"];
  /** Summary of previous round (anonymous) */
  previousRoundSummary?: string;
  /** This agent's own previous response (for self-reflection) */
  ownPreviousResponse?: AgentResponse;
  /** Round number (agents know how far along the deliberation is) */
  roundNumber: number;
  totalRounds: number;
  /** Guiding questions */
  guidingQuestions?: string[];
}

// ---------------------------------------------------------------------------
// Session execution
// ---------------------------------------------------------------------------

export async function runSession(
  sessionId: SessionId,
  config: DeliberationConfig,
  prompt: DeliberationPrompt,
  panelists: PanelistContext[],
  deps: SessionDependencies,
): Promise<Result<DeliberationOutcome>> {
  const rounds: DeliberationRound[] = [];
  const convergenceHistory: ConvergenceMeasurement[] = [];
  let totalCostUsd = 0;

  await deps.audit("session.started", { sessionId, panelistCount: panelists.length });
  deps.emit("session.status", { status: "running" });

  // -----------------------------------------------------------------------
  // Main deliberation loop
  // -----------------------------------------------------------------------
  for (let roundNum = 1; roundNum <= config.maxRounds; roundNum++) {
    await deps.audit("round.started", { sessionId, roundNumber: roundNum });
    deps.emit("round.started", { roundNumber: roundNum });

    // --- Step 1: Build round prompt for each agent ---
    const previousSummary = config.anonymousSummaries && rounds.length > 0
      ? await deps.generateRoundSummary(
          rounds[rounds.length - 1].responses,
          convergenceHistory[convergenceHistory.length - 1],
        )
      : undefined;

    // --- Step 2: Collect responses concurrently ---
    // All agents in a round respond in parallel. This is architecturally
    // important: agents do NOT see each other's responses within a round,
    // only the anonymous summary of the previous round. This prevents
    // anchoring bias and encourages independent thinking.
    const responsePromises = panelists.map(async (panelist) => {
      const ownPrevious = rounds.length > 0
        ? rounds[rounds.length - 1].responses.find(
            (r) => r.personaId === panelist.personaId,
          )
        : undefined;

      const roundPrompt: RoundPrompt = {
        subject: prompt.subject,
        content: prompt.content,
        previousRoundSummary: previousSummary,
        ownPreviousResponse: ownPrevious,
        roundNumber: roundNum,
        totalRounds: config.maxRounds,
        guidingQuestions: prompt.guidingQuestions,
      };

      const result = await deps.generateAgentResponse(panelist, roundPrompt);

      if (result.ok) {
        // Track cost
        const cost = await deps.recordCost(result.value.tokenUsage, "default");
        totalCostUsd = cost.totalUsd;

        await deps.audit("agent.responded", {
          sessionId,
          personaId: panelist.personaId,
          roundNumber: roundNum,
          confidence: result.value.confidence,
        });
        deps.emit("agent.responded", {
          personaId: panelist.personaId,
          roundNumber: roundNum,
          positionSummary: result.value.positionSummary,
        });

        // Check if agent shifted position
        if (result.value.positionShift) {
          await deps.audit("agent.position-shifted", {
            sessionId,
            personaId: panelist.personaId,
            roundNumber: roundNum,
            shift: result.value.positionShift,
          });
        }

        // Budget check
        if (cost.budgetExceeded) {
          return { response: result.value, budgetExceeded: true };
        }
      }

      return { response: result.ok ? result.value : null, budgetExceeded: false };
    });

    const settled = await Promise.all(responsePromises);

    // Check for budget exceeded
    if (settled.some((s) => s.budgetExceeded)) {
      await deps.audit("session.budget-exceeded", { sessionId, totalCostUsd });
      deps.emit("session.status", { status: "budget-exceeded" });
      // Still compute outcome from what we have
      break;
    }

    // Collect successful responses
    const responses = settled
      .map((s) => s.response)
      .filter((r): r is AgentResponse => r !== null);

    if (responses.length < panelists.length * 0.5) {
      // More than half the panel failed — abort
      await deps.audit("session.failed", {
        sessionId,
        reason: "too-many-agent-failures",
        successCount: responses.length,
        totalCount: panelists.length,
      });
      return {
        ok: false,
        error: {
          code: "CONVERGENCE_FAILED",
          engine: "mirage" as const,
          message: `Only ${responses.length}/${panelists.length} agents responded in round ${roundNum}`,
          finalScore: 0,
          threshold: config.convergenceThreshold,
          roundsCompleted: roundNum,
        },
      };
    }

    // --- Step 3: Measure convergence ---
    const convergence = await deps.measureConvergence(responses, convergenceHistory);
    convergenceHistory.push(convergence);

    await deps.audit("convergence.measured", {
      sessionId,
      roundNumber: roundNum,
      overallScore: convergence.overallScore,
      clusterCount: convergence.clusters.length,
    });
    deps.emit("convergence.update", {
      roundNumber: roundNum,
      overallScore: convergence.overallScore,
      clusters: convergence.clusters,
    });

    // --- Step 4: Record the round ---
    const round: DeliberationRound = {
      id: `${sessionId}-round-${roundNum}` as any,
      sessionId,
      roundNumber: roundNum,
      inputSummary: previousSummary,
      responses,
      convergence,
      costUsd: totalCostUsd - rounds.reduce((sum, r) => sum + r.costUsd, 0),
      startedAt: new Date(),
      completedAt: new Date(),
    };
    rounds.push(round);

    await deps.audit("round.completed", {
      sessionId,
      roundNumber: roundNum,
      responseCount: responses.length,
      convergenceScore: convergence.overallScore,
    });
    deps.emit("round.completed", { roundNumber: roundNum, convergence: convergence.overallScore });

    // --- Step 5: Check early exit ---
    if (
      config.allowEarlyExit &&
      convergence.overallScore >= config.convergenceThreshold
    ) {
      await deps.audit("consensus.reached", {
        sessionId,
        roundNumber: roundNum,
        score: convergence.overallScore,
      });
      break;
    }
  }

  // -----------------------------------------------------------------------
  // Compute outcome
  // -----------------------------------------------------------------------
  const panelistsForOutcome: Panelist[] = panelists.map((p) => ({
    personaId: p.personaId,
    role: p.role,
    domainWeight: p.domainWeight,
    subgroupIds: [],
  }));

  const outcome = await deps.computeOutcome(rounds, config, panelistsForOutcome);

  await deps.audit("session.completed", {
    sessionId,
    resolution: outcome.resolution,
    totalRounds: rounds.length,
    totalCostUsd,
  });
  deps.emit("session.completed", { outcome });

  return { ok: true, value: outcome };
}
