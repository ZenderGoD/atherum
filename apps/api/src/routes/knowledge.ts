/**
 * Atherum API — Knowledge Graph Routes (Atlas Engine)
 *
 * POST /api/v1/knowledge/ingest           — Ingest document into a graph
 * GET  /api/v1/knowledge/graphs           — List graphs for workspace
 * GET  /api/v1/knowledge/graphs/:id       — Get graph metadata + stats
 * POST /api/v1/knowledge/graphs/:id/query — Query a knowledge graph
 * DELETE /api/v1/knowledge/graphs/:id     — Delete a graph
 *
 * The ECL pipeline (Extract, Cognify, Load) runs as a background job.
 * Querying is synchronous since graph lookups are fast.
 */

import { Hono } from "hono";

const app = new Hono();

/**
 * POST /api/v1/knowledge/ingest
 *
 * Request body:
 * {
 *   graphId?: KnowledgeGraphId,  // add to existing graph, or omit to create new
 *   graphName?: string,          // required if creating new graph
 *   documents: DocumentInput[],
 * }
 *
 * Response: 202 Accepted
 * {
 *   graphId: string,
 *   jobId: string,
 *   documentsQueued: number,
 * }
 */

/**
 * POST /api/v1/knowledge/graphs/:id/query
 *
 * Request body:
 * {
 *   query: string,                         // natural language
 *   strategy?: "traversal" | "semantic-search" | "chain-of-thought" | "completion",
 *   limit?: number,                        // max results, default 10
 * }
 *
 * Response: 200
 * {
 *   result: GraphQueryResult
 * }
 */

export default app;
