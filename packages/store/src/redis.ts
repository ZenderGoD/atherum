/**
 * Atherum Store — Redis Cache Patterns
 *
 * Redis serves three purposes in Atherum:
 * 1. Agent roster cache — daily-generated personas with 24h TTL
 * 2. Session state cache — live deliberation state for SSE streaming
 * 3. Job queues — BullMQ for background job processing
 *
 * Key naming convention:
 *   atherum:{workspace_id}:{entity}:{id}:{sub}
 */

// ---------------------------------------------------------------------------
// Key patterns
// ---------------------------------------------------------------------------

export const RedisKeys = {
  /** Global agent roster — refreshed daily */
  globalRoster: () => "atherum:global:roster",

  /** Workspace-specific agent roster */
  workspaceRoster: (workspaceId: string) =>
    `atherum:ws:${workspaceId}:roster`,

  /** Individual persona cache (full object) */
  persona: (personaId: string) =>
    `atherum:persona:${personaId}`,

  /** Live session state (for SSE streaming) */
  sessionState: (sessionId: string) =>
    `atherum:session:${sessionId}:state`,

  /** Session SSE event stream (Redis Stream) */
  sessionEvents: (sessionId: string) =>
    `atherum:session:${sessionId}:events`,

  /** Simulation progress stream */
  simulationEvents: (simulationId: string) =>
    `atherum:simulation:${simulationId}:events`,

  /** Cost accumulator for a session (atomic increment) */
  sessionCost: (sessionId: string) =>
    `atherum:session:${sessionId}:cost`,

  /** Workspace monthly cost accumulator */
  workspaceMonthlyCost: (workspaceId: string, yearMonth: string) =>
    `atherum:ws:${workspaceId}:cost:${yearMonth}`,

  /** Rate limiter for persona generation */
  personaGenRateLimit: (workspaceId: string) =>
    `atherum:ws:${workspaceId}:persona-gen-rate`,
} as const;

// ---------------------------------------------------------------------------
// TTLs (in seconds)
// ---------------------------------------------------------------------------

export const RedisTTL = {
  /** Global roster: refreshed daily, keep for 25h (buffer for generation) */
  globalRoster: 25 * 60 * 60,

  /** Workspace roster: same as global */
  workspaceRoster: 25 * 60 * 60,

  /** Individual persona: 7 days (includes memory snapshots) */
  persona: 7 * 24 * 60 * 60,

  /** Session state: 24 hours after last update */
  sessionState: 24 * 60 * 60,

  /** Session events: 48 hours (for replay) */
  sessionEvents: 48 * 60 * 60,

  /** Monthly cost: 35 days (overlap for billing reconciliation) */
  monthlyCost: 35 * 24 * 60 * 60,
} as const;

// ---------------------------------------------------------------------------
// Cache patterns
// ---------------------------------------------------------------------------

/**
 * Agent roster caching strategy:
 *
 * 1. Daily cron job generates 10-20 global personas with web search grounding
 * 2. Personas are stored in Postgres (durable) AND Redis (fast reads)
 * 3. Redis stores the full persona object as JSON with 25h TTL
 * 4. When a product needs agents:
 *    a. Check Redis roster first (O(1) read)
 *    b. If miss, load from Postgres
 *    c. If neither has suitable personas, generate on-demand
 * 5. Workspace-specific personas are layered on top of the global roster
 *
 * The 25h TTL (vs 24h generation cycle) ensures there's always a roster
 * available even if the daily job runs a few minutes late.
 */

/**
 * Session state caching strategy:
 *
 * 1. When a deliberation starts, a Redis key is created with the session config
 * 2. After each round, the session state is updated atomically
 * 3. SSE handlers read from Redis (not Postgres) for low-latency streaming
 * 4. On session completion, final state is written to Postgres (durable)
 * 5. Redis key expires after 24h (client should have read results by then)
 *
 * This is a "write to Redis, read from Redis, persist to Postgres" pattern.
 * The trade-off: if Redis dies mid-session, we lose in-progress state.
 * The mitigation: sessions can be replayed from the audit log in Postgres.
 */
