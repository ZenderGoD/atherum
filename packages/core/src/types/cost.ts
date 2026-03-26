/**
 * Atherum Core — Cost Governance Types
 *
 * Every LLM call is tracked. Budgets are enforced at workspace, session,
 * and per-round granularity.
 */

import type { WorkspaceId, SessionId } from "../ids";

export interface CostEvent {
  id: string;
  workspaceId: WorkspaceId;
  sessionId: SessionId;
  /** Which engine incurred the cost */
  engine: "mirage" | "atlas" | "scribe" | "oasis" | "personas";
  /** Which operation within the engine */
  operation: string;
  /** LLM provider and model */
  provider: string;
  model: string;
  /** Token counts */
  inputTokens: number;
  outputTokens: number;
  /** Computed cost in USD */
  costUsd: number;
  timestamp: Date;
}

export interface CostBudget {
  /** Maximum allowed spend */
  limitUsd: number;
  /** Current accumulated spend */
  spentUsd: number;
  /** What happens when budget is exceeded */
  onExceed: "stop" | "warn" | "throttle";
}

export interface CostSummary {
  workspaceId: WorkspaceId;
  periodStart: Date;
  periodEnd: Date;
  totalUsd: number;
  byEngine: Record<string, number>;
  byModel: Record<string, number>;
  sessionCount: number;
  averageCostPerSession: number;
}
