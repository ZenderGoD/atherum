/**
 * Atherum Core — Error Construction Helpers
 *
 * Factory functions for creating domain errors. These keep error construction
 * consistent and reduce boilerplate in engine code.
 */

import type {
  BudgetExceededError,
  ConvergenceFailedError,
  PersonaGenerationError,
  SimulationError,
  GraphError,
  ReportError,
  ValidationError,
  TenantError,
  OasisWorkerError,
} from "./result";

type Engine = "mirage" | "atlas" | "scribe" | "oasis" | "personas" | "orchestrator";

export function budgetExceeded(
  engine: Engine,
  budgetUsd: number,
  spentUsd: number,
): BudgetExceededError {
  return {
    code: "BUDGET_EXCEEDED",
    engine,
    message: `Budget exceeded: spent $${spentUsd.toFixed(4)} of $${budgetUsd.toFixed(4)} budget`,
    budgetUsd,
    spentUsd,
  };
}

export function convergenceFailed(
  finalScore: number,
  threshold: number,
  roundsCompleted: number,
): ConvergenceFailedError {
  return {
    code: "CONVERGENCE_FAILED",
    engine: "mirage",
    message: `Failed to converge after ${roundsCompleted} rounds (score: ${finalScore.toFixed(3)}, threshold: ${threshold})`,
    finalScore,
    threshold,
    roundsCompleted,
  };
}

export function personaGenerationFailed(
  requestedCount: number,
  generatedCount: number,
  reason: string,
): PersonaGenerationError {
  return {
    code: "PERSONA_GENERATION_FAILED",
    engine: "personas",
    message: `Generated ${generatedCount}/${requestedCount} personas: ${reason}`,
    requestedCount,
    generatedCount,
  };
}

export function simulationFailed(
  simulationId: string,
  phase: SimulationError["phase"],
  reason: string,
): SimulationError {
  return {
    code: "SIMULATION_FAILED",
    engine: "oasis",
    message: `Simulation ${simulationId} failed during ${phase}: ${reason}`,
    simulationId,
    phase,
  };
}

export function graphError(
  operation: GraphError["operation"],
  reason: string,
): GraphError {
  return {
    code: "GRAPH_ERROR",
    engine: "atlas",
    message: `Graph ${operation} failed: ${reason}`,
    operation,
  };
}

export function reportError(
  phase: ReportError["phase"],
  reason: string,
  sectionIndex?: number,
): ReportError {
  return {
    code: "REPORT_ERROR",
    engine: "scribe",
    message: `Report ${phase} failed${sectionIndex !== undefined ? ` at section ${sectionIndex}` : ""}: ${reason}`,
    phase,
    sectionIndex,
  };
}

export function validationError(
  engine: Engine,
  field: string,
  constraint: string,
): ValidationError {
  return {
    code: "VALIDATION_ERROR",
    engine,
    message: `Validation failed: ${field} ${constraint}`,
    field,
    constraint,
  };
}

export function tenantError(
  workspaceId: string,
  reason: TenantError["reason"],
): TenantError {
  return {
    code: "TENANT_ERROR",
    engine: "orchestrator",
    message: `Workspace ${workspaceId}: ${reason}`,
    workspaceId,
    reason,
  };
}

export function oasisWorkerError(
  reason: OasisWorkerError["reason"],
  httpStatus?: number,
): OasisWorkerError {
  return {
    code: "OASIS_WORKER_ERROR",
    engine: "oasis",
    message: `OASIS worker ${reason}${httpStatus ? ` (HTTP ${httpStatus})` : ""}`,
    reason,
    httpStatus,
  };
}
