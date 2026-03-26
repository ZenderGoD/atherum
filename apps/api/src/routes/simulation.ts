/**
 * Atherum API — Simulation Routes (OASIS via Bridge)
 *
 * POST /api/v1/simulations                — Start a new simulation
 * GET  /api/v1/simulations/:id            — Get simulation state
 * GET  /api/v1/simulations/:id/progress   — SSE stream of simulation progress
 * GET  /api/v1/simulations/:id/result     — Get final result
 * POST /api/v1/simulations/:id/stop       — Force-stop simulation
 *
 * Simulations are long-running (minutes to hours of virtual time).
 * The TS API enqueues a job that calls the Python OASIS worker via HTTP.
 * Progress events are relayed from the worker back through SSE.
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * POST /api/v1/simulations
 *
 * Request body:
 * {
 *   platform: PlatformConfig,
 *   seed: SimulationSeed,
 *   personaIds?: PersonaId[],
 *   backgroundAgentCount?: number,    // default 100
 *   costBudgetUsd?: number,           // default from workspace
 * }
 *
 * Response: 202 Accepted
 * {
 *   simulationId: string,
 *   status: "queued",
 *   estimatedDurationMinutes: number,
 *   streamUrl: string,
 * }
 */

/**
 * GET /api/v1/simulations/:id/progress
 *
 * SSE stream. Events:
 *   - progress           { virtualHour, totalHours, metrics }
 *   - event.viral        { postId, engagements, hour }
 *   - event.echo-chamber { clusterSize, topic, hour }
 *   - event.sentiment    { direction, magnitude, hour }
 *   - completed          { result summary }
 *   - error              { code, message }
 */

/**
 * GET /api/v1/simulations/:id/result
 *
 * Response: 200 (if completed)
 * {
 *   result: SimulationResult
 * }
 */

export default app;
