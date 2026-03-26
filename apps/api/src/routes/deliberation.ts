/**
 * Atherum API — Deliberation Routes (Mirage Engine)
 *
 * POST /api/v1/deliberations              — Start a new deliberation session
 * GET  /api/v1/deliberations/:id          — Get session state (poll or SSE)
 * GET  /api/v1/deliberations/:id/rounds   — Get all rounds with agent responses
 * GET  /api/v1/deliberations/:id/outcome  — Get final outcome (consensus map)
 * POST /api/v1/deliberations/:id/stop     — Force-stop a running session
 * GET  /api/v1/deliberations/:id/audit    — Full audit trail
 * GET  /api/v1/deliberations/:id/stream   — SSE stream of round-by-round progress
 *
 * Route definitions only — implementation references the Mirage engine package.
 */

import { Hono } from "hono";
import { stream } from "hono/streaming";

// Type-only imports — actual implementation would come from engine packages
import type {
  DeliberationConfig,
  DeliberationPrompt,
  DeliberationSession,
  DeliberationOutcome,
  SessionId,
  WorkspaceId,
} from "@atherum/core";

const app = new Hono();

/**
 * POST /api/v1/deliberations
 *
 * Request body:
 * {
 *   config: DeliberationConfig,
 *   prompt: DeliberationPrompt,
 *   personaIds?: PersonaId[],      // optional — if omitted, auto-select from roster
 *   personaCount?: number,          // how many agents if auto-selecting
 * }
 *
 * Response: 202 Accepted
 * {
 *   sessionId: string,
 *   status: "configuring",
 *   estimatedCostUsd: number,
 *   pollUrl: string,
 *   streamUrl: string,
 * }
 *
 * The session is queued as a BullMQ job. Client can poll or use SSE.
 */

/**
 * GET /api/v1/deliberations/:id
 *
 * Response: 200
 * {
 *   session: DeliberationSession  // full session state
 * }
 */

/**
 * GET /api/v1/deliberations/:id/rounds
 *
 * Query params:
 *   ?round=N          — specific round
 *   ?personaId=X      — filter to one agent's responses
 *
 * Response: 200
 * {
 *   rounds: DeliberationRound[]
 * }
 */

/**
 * GET /api/v1/deliberations/:id/outcome
 *
 * Response: 200 (if completed) or 404 (if still running)
 * {
 *   outcome: DeliberationOutcome
 * }
 */

/**
 * POST /api/v1/deliberations/:id/stop
 *
 * Force-stops a running session. Current round completes, then outcome
 * is computed from available data.
 *
 * Response: 200
 * { status: "completed", reason: "user-stopped" }
 */

/**
 * GET /api/v1/deliberations/:id/stream
 *
 * Server-Sent Events stream. Events:
 *   - session.status     { status }
 *   - round.started      { roundNumber }
 *   - agent.responded    { personaId, roundNumber, positionSummary }
 *   - convergence.update { roundNumber, overallScore, clusters }
 *   - session.completed  { outcome }
 *   - cost.update        { totalUsd }
 *   - error              { code, message }
 */

/**
 * GET /api/v1/deliberations/:id/audit
 *
 * Response: 200
 * {
 *   entries: AuditEntry[]
 * }
 */

export default app;
