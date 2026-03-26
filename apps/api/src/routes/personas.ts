/**
 * Atherum API — Persona Routes
 *
 * GET  /api/v1/personas                    — List personas (global + workspace)
 * GET  /api/v1/personas/:id                — Get persona with memory summary
 * POST /api/v1/personas/generate           — Generate new personas
 * POST /api/v1/personas/roster/refresh     — Trigger daily roster regeneration
 * GET  /api/v1/personas/:id/memory         — Get full memory (all tiers)
 * PUT  /api/v1/personas/:id/memory/distill — Trigger procedural memory extraction
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * GET /api/v1/personas
 *
 * Query params:
 *   ?scope=global|workspace     — filter by scope
 *   ?archetype=X                — filter by archetype
 *   ?limit=N&offset=N           — pagination
 *
 * Response: 200
 * {
 *   personas: Persona[],     // memory fields are summaries only (not full L2)
 *   total: number,
 * }
 */

/**
 * POST /api/v1/personas/generate
 *
 * Request body: PersonaGenerationRequest
 *
 * Response: 200
 * { result: PersonaGenerationResult }
 */

/**
 * POST /api/v1/personas/roster/refresh
 *
 * Manually triggers the daily roster generation (normally runs on cron).
 * Generates 10-20 base personas with fresh web search trend signals.
 *
 * Response: 202 Accepted
 * { jobId: string, estimatedPersonas: number }
 */

/**
 * PUT /api/v1/personas/:id/memory/distill
 *
 * Triggers procedural memory extraction — the persona reviews its recent
 * episodic memories and distills them into learnings and skills.
 *
 * Response: 200
 * { learningsExtracted: number, skillsUpdated: number }
 */

export default app;
