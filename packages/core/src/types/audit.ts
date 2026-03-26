/**
 * Atherum Core — Audit Trail Types
 *
 * Every deliberation decision, agent response, vote, and state transition
 * is recorded in an append-only audit log. This provides full transparency
 * into how Atherum reached any conclusion.
 */

import type { WorkspaceId, SessionId, PersonaId } from "../ids";

export interface AuditEntry {
  id: string;
  workspaceId: WorkspaceId;
  sessionId: SessionId;
  /** What happened */
  event: AuditEvent;
  /** Who/what caused it */
  actor: { type: "system" | "persona" | "user"; id: string };
  /** Structured payload — varies by event type */
  payload: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: Date;
}

export type AuditEvent =
  // Session lifecycle
  | "session.created"
  | "session.started"
  | "session.completed"
  | "session.failed"
  | "session.budget-exceeded"
  // Deliberation
  | "round.started"
  | "round.completed"
  | "agent.responded"
  | "agent.position-shifted"
  | "convergence.measured"
  | "consensus.reached"
  | "subgroup.formed"
  | "subgroup.merged"
  | "vote.cast"
  // Simulation
  | "simulation.started"
  | "simulation.event"
  | "simulation.completed"
  // Knowledge
  | "document.ingested"
  | "graph.updated"
  | "graph.queried"
  // Report
  | "report.planned"
  | "report.section-completed"
  | "report.completed"
  // Cost
  | "cost.incurred"
  | "cost.budget-warning"
  | "cost.budget-exceeded";
