/**
 * Atherum API — Admin Routes
 *
 * GET  /api/v1/admin/cost                  — Cost dashboard
 * GET  /api/v1/admin/cost/:sessionId       — Session cost breakdown
 * GET  /api/v1/admin/roster                — Current global agent roster
 * GET  /api/v1/admin/health                — Detailed health (all dependencies)
 * GET  /api/v1/admin/workspaces            — List workspaces
 * POST /api/v1/admin/workspaces            — Create workspace
 * PUT  /api/v1/admin/workspaces/:id        — Update workspace (brand context, budgets)
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * GET /api/v1/admin/cost
 *
 * Query params:
 *   ?period=current-month|last-month|custom
 *   ?from=ISO&to=ISO  (if custom)
 *
 * Response: 200
 * {
 *   summary: CostSummary,
 *   topSessions: Array<{ sessionId, costUsd, engine, createdAt }>,
 * }
 */

/**
 * GET /api/v1/admin/health
 *
 * Checks all dependencies and returns status:
 * {
 *   api: "ok",
 *   postgres: "ok" | "degraded" | "down",
 *   redis: "ok" | "degraded" | "down",
 *   neo4j: "ok" | "degraded" | "down",
 *   oasisWorker: { healthy: boolean, latencyMs: number },
 * }
 */

export default app;
