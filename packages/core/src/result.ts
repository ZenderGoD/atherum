/**
 * Atherum Core — Result Type
 *
 * Domain operations return Result<T, E> instead of throwing exceptions.
 * This makes error paths explicit in the type system and forces callers
 * to handle failures.
 *
 * Exceptions are reserved for truly unexpected situations (programmer errors,
 * infrastructure failures). Domain errors (budget exceeded, convergence failed,
 * invalid persona config) use Result.
 */

export type Result<T, E = AtheumError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Unwrap a Result, throwing if it's an error.
 * Use only at API boundaries where you convert domain errors to HTTP responses.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

// ---------------------------------------------------------------------------
// Domain error hierarchy
// ---------------------------------------------------------------------------

export type AtheumError =
  | BudgetExceededError
  | ConvergenceFailedError
  | PersonaGenerationError
  | SimulationError
  | GraphError
  | ReportError
  | ValidationError
  | TenantError
  | OasisWorkerError;

interface BaseError {
  code: string;
  message: string;
  /** Which engine produced the error */
  engine: "mirage" | "atlas" | "scribe" | "oasis" | "personas" | "orchestrator";
  /** Additional context for debugging */
  context?: Record<string, unknown>;
}

export interface BudgetExceededError extends BaseError {
  code: "BUDGET_EXCEEDED";
  budgetUsd: number;
  spentUsd: number;
}

export interface ConvergenceFailedError extends BaseError {
  code: "CONVERGENCE_FAILED";
  finalScore: number;
  threshold: number;
  roundsCompleted: number;
}

export interface PersonaGenerationError extends BaseError {
  code: "PERSONA_GENERATION_FAILED";
  requestedCount: number;
  generatedCount: number;
}

export interface SimulationError extends BaseError {
  code: "SIMULATION_FAILED";
  simulationId: string;
  phase: "setup" | "running" | "analysis";
}

export interface GraphError extends BaseError {
  code: "GRAPH_ERROR";
  operation: "extract" | "cognify" | "load" | "query";
}

export interface ReportError extends BaseError {
  code: "REPORT_ERROR";
  phase: "planning" | "generation" | "tool-call";
  sectionIndex?: number;
}

export interface ValidationError extends BaseError {
  code: "VALIDATION_ERROR";
  field: string;
  constraint: string;
}

export interface TenantError extends BaseError {
  code: "TENANT_ERROR";
  workspaceId: string;
  reason: "not-found" | "budget-exceeded" | "rate-limited";
}

export interface OasisWorkerError extends BaseError {
  code: "OASIS_WORKER_ERROR";
  reason: "unreachable" | "timeout" | "internal-error";
  httpStatus?: number;
}
