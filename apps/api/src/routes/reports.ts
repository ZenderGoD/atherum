/**
 * Atherum API — Report Routes (Scribe Engine)
 *
 * POST /api/v1/reports                     — Generate a new report
 * GET  /api/v1/reports/:id                 — Get report with all sections
 * GET  /api/v1/reports/:id/stream          — SSE stream of incremental generation
 * POST /api/v1/reports/:id/chat            — Follow-up question about the report
 *
 * Reports are generated incrementally — each section streams as it completes.
 * The ReACT agent trace is preserved for transparency.
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * POST /api/v1/reports
 *
 * Request body:
 * {
 *   template: ReportTemplate,
 *   sources: ReportSource[],
 *   brief: string,
 *   costBudgetUsd?: number,
 * }
 *
 * Response: 202 Accepted
 * {
 *   reportId: string,
 *   plan: ReportPlan,     // section outline with estimated cost
 *   streamUrl: string,
 * }
 */

/**
 * GET /api/v1/reports/:id/stream
 *
 * SSE stream. Events:
 *   - plan.ready           { plan }
 *   - section.started      { sectionIndex, title }
 *   - section.chunk        { sectionIndex, text }  (incremental text)
 *   - section.completed    { sectionIndex, fullContent }
 *   - agent.trace          { step: AgentTraceStep }
 *   - report.completed     { report summary }
 *   - error                { code, message }
 */

/**
 * POST /api/v1/reports/:id/chat
 *
 * Request body:
 * { message: string }
 *
 * Response: 200 (streamed)
 * { response: string, toolCalls?: AgentTraceStep[] }
 */

export default app;
