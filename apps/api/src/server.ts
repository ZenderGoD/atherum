import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(import.meta.dirname, "../../../.env") });

/**
 * Atherum API -- Server Bootstrap
 *
 * Hono HTTP server with middleware stack:
 * 1. Request ID (tracing)
 * 2. Auth (API key or JWT) -- relaxed for v0
 * 3. Tenant resolution (workspace from auth)
 * 4. Cost tracking middleware
 * 5. Audit logging
 * 6. Error handler (domain errors -> HTTP responses)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import contentReviewRoutes from "./routes/products/content-review.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware stack
// ---------------------------------------------------------------------------

app.use("*", cors());
app.use("*", logger());

// Request ID -- attached to every request for tracing
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

// Auth middleware -- relaxed for v0: allow requests without auth
// In production, this would validate API keys and resolve workspaces.
app.use("/api/*", async (c, next) => {
  const apiKey = c.req.header("authorization")?.replace("Bearer ", "");
  if (apiKey) {
    // TODO: Validate API key, resolve workspace
    // c.set("workspaceId", resolvedWorkspaceId);
  }
  // v0: allow unauthenticated requests
  await next();
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

// Product routes -- content review is the first product
app.route("/api", contentReviewRoutes);

// Engine routes (future)
// app.route("/api/v1/deliberations", deliberationRoutes);
// app.route("/api/v1/simulations", simulationRoutes);
// app.route("/api/v1/knowledge", knowledgeRoutes);
// app.route("/api/v1/reports", reportRoutes);
// app.route("/api/v1/personas", personaRoutes);

// Product routes (future)
// app.route("/api/v1/products/content-review", contentReviewRoutes);
// app.route("/api/v1/products/living-personas", livingPersonaRoutes);
// app.route("/api/v1/products/campaign-colosseum", campaignColosseumRoutes);
// app.route("/api/v1/products/war-room", warRoomRoutes);
// app.route("/api/v1/products/trend-forge", trendForgeRoutes);
// app.route("/api/v1/products/echo-chamber", echoChamberRoutes);
// app.route("/api/v1/products/consensus-engine", consensusEngineRoutes);
// app.route("/api/v1/products/sentinel", sentinelRoutes);
// app.route("/api/v1/products/replay", replayRoutes);

// Admin routes
// app.route("/api/v1/admin", adminRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "atherum-api",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Error handler -- convert domain errors to HTTP responses
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  const requestId = c.get("requestId") || "unknown";

  // Check if it's a domain error (has a 'code' field)
  if (typeof err === "object" && err !== null && "code" in err) {
    const domainErr = err as { code: string; message: string };

    const statusMap: Record<string, number> = {
      BUDGET_EXCEEDED: 402,
      VALIDATION_ERROR: 400,
      TENANT_ERROR: 404, // or 429 for rate-limited
      OASIS_WORKER_ERROR: 503,
      CONVERGENCE_FAILED: 422,
      PERSONA_GENERATION_FAILED: 500,
      SIMULATION_FAILED: 500,
      GRAPH_ERROR: 500,
      REPORT_ERROR: 500,
    };

    const status = statusMap[domainErr.code] || 500;
    return c.json(
      {
        error: domainErr.code,
        message: domainErr.message,
        requestId,
      },
      status as any,
    );
  }

  // Unexpected error
  console.error(`Unhandled error [${requestId}]:`, err);
  return c.json(
    {
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
    500,
  );
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT || "4000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Atherum API running on http://localhost:${info.port}`);
});

export default app;
