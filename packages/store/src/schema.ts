/**
 * Atherum Store — Database Schema (Drizzle ORM)
 *
 * Storage strategy:
 *   - Postgres: Structured data (sessions, personas, workspaces, cost, audit)
 *   - Redis: Caches (agent roster, session state, job queues)
 *   - Neo4j/Zep: Knowledge graphs (Atlas engine)
 *
 * This file defines the Postgres schema. Redis and graph stores have
 * their own adapter interfaces.
 *
 * Multi-tenancy: All tables include workspace_id. Row-level isolation
 * is enforced at the repository layer, not the database layer (simpler
 * than RLS, good enough for a single-service architecture).
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  uuid,
  index,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sessionStatusEnum = pgEnum("session_status", [
  "configuring",
  "running",
  "converged",
  "completed",
  "budget-exceeded",
  "failed",
]);

export const personaGenerationMethodEnum = pgEnum("persona_generation_method", [
  "daily-roster",
  "workspace-custom",
  "on-demand",
]);

export const simulationStatusEnum = pgEnum("simulation_status", [
  "queued",
  "running",
  "completed",
  "budget-exceeded",
  "failed",
  "stopped",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "planning",
  "generating",
  "completed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  name: text("name").notNull(),
  brandContext: jsonb("brand_context").notNull().$type<{
    brandName: string;
    brandDescription: string;
    industry: string;
    targetAudiences: string[];
    voiceGuidelines?: string;
    competitors?: string[];
    customInstructions?: string;
  }>(),
  monthlyBudgetUsd: real("monthly_budget_usd").notNull().default(100),
  currentMonthSpendUsd: real("current_month_spend_usd").notNull().default(0),
  defaultSessionBudgetUsd: real("default_session_budget_usd").notNull().default(5),
  resetDayOfMonth: integer("reset_day_of_month").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export const personas = pgTable(
  "personas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    name: text("name").notNull(),
    archetype: text("archetype").notNull(),
    demographics: jsonb("demographics").notNull(),
    psychographics: jsonb("psychographics").notNull(),
    evaluation: jsonb("evaluation").notNull(),
    generationMethod: personaGenerationMethodEnum("generation_method").notNull(),
    trendSignals: jsonb("trend_signals").$type<string[]>().default([]),
    baselineEmbedding: jsonb("baseline_embedding").$type<number[]>(),
    currentDrift: real("current_drift").default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [
    index("idx_personas_workspace").on(table.workspaceId),
    index("idx_personas_archetype").on(table.archetype),
    index("idx_personas_active").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Persona Memory
// ---------------------------------------------------------------------------

export const personaEpisodicMemory = pgTable(
  "persona_episodic_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id),
    sessionId: uuid("session_id").notNull(),
    summary: text("summary").notNull(),
    positions: jsonb("positions").$type<
      Array<{ topic: string; stance: string; confidence: number }>
    >(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_episodic_persona").on(table.personaId),
    index("idx_episodic_session").on(table.sessionId),
  ],
);

export const personaSemanticMemory = pgTable("persona_semantic_memory", {
  personaId: uuid("persona_id")
    .primaryKey()
    .references(() => personas.id),
  brandPreferences: jsonb("brand_preferences").$type<Record<string, string>>().default({}),
  recurringThemes: jsonb("recurring_themes").$type<string[]>().default([]),
  lastDistilledAt: timestamp("last_distilled_at").notNull().defaultNow(),
});

export const personaProceduralMemory = pgTable("persona_procedural_memory", {
  personaId: uuid("persona_id")
    .primaryKey()
    .references(() => personas.id),
  learnings: jsonb("learnings").$type<
    Array<{ rule: string; derivedFrom: string[]; confidence: number }>
  >().default([]),
  acquiredSkills: jsonb("acquired_skills").$type<
    Array<{ skill: string; acquiredAt: string; proficiency: number }>
  >().default([]),
});

// ---------------------------------------------------------------------------
// Deliberation Sessions
// ---------------------------------------------------------------------------

export const deliberationSessions = pgTable(
  "deliberation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    config: jsonb("config").notNull(),
    prompt: jsonb("prompt").notNull(),
    status: sessionStatusEnum("status").notNull().default("configuring"),
    panelists: jsonb("panelists").notNull().$type<
      Array<{
        personaId: string;
        role: string;
        domainWeight: number;
      }>
    >(),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_sessions_workspace").on(table.workspaceId),
    index("idx_sessions_status").on(table.status),
  ],
);

export const deliberationRounds = pgTable(
  "deliberation_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => deliberationSessions.id),
    roundNumber: integer("round_number").notNull(),
    inputSummary: text("input_summary"),
    convergenceScore: real("convergence_score").notNull(),
    convergenceData: jsonb("convergence_data").notNull(),
    costUsd: real("cost_usd").notNull().default(0),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_rounds_session").on(table.sessionId),
  ],
);

export const agentResponses = pgTable(
  "agent_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => deliberationRounds.id),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id),
    reasoning: text("reasoning").notNull(),
    scores: jsonb("scores").$type<
      Array<{ dimension: string; score: number; justification: string }>
    >(),
    positionSummary: text("position_summary").notNull(),
    positionEmbedding: jsonb("position_embedding").$type<number[]>(),
    confidence: real("confidence").notNull(),
    positionShift: jsonb("position_shift").$type<{
      from: string;
      to: string;
      reason: string;
    }>(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_responses_round").on(table.roundId),
    index("idx_responses_persona").on(table.personaId),
  ],
);

export const deliberationOutcomes = pgTable("deliberation_outcomes", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => deliberationSessions.id),
  resolution: text("resolution").notNull(), // "consensus" | "majority" | "no-consensus" | "budget-stop"
  aggregatedScores: jsonb("aggregated_scores"),
  majoritySummary: text("majority_summary").notNull(),
  minorityReports: jsonb("minority_reports").notNull(),
  votes: jsonb("votes"),
  journeys: jsonb("journeys").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Simulations
// ---------------------------------------------------------------------------

export const simulations = pgTable(
  "simulations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    platform: text("platform").notNull(), // "twitter" | "reddit"
    config: jsonb("config").notNull(),
    seed: jsonb("seed").notNull(),
    status: simulationStatusEnum("status").notNull().default("queued"),
    result: jsonb("result"),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_simulations_workspace").on(table.workspaceId),
  ],
);

// ---------------------------------------------------------------------------
// Knowledge Graphs (metadata — actual graph in Neo4j/Zep)
// ---------------------------------------------------------------------------

export const knowledgeGraphs = pgTable(
  "knowledge_graphs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    entityCount: integer("entity_count").notNull().default(0),
    relationshipCount: integer("relationship_count").notNull().default(0),
    documentCount: integer("document_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_graphs_workspace").on(table.workspaceId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => knowledgeGraphs.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    source: text("source").notNull(),
    contentType: text("content_type").notNull(),
    metadata: jsonb("metadata"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_documents_graph").on(table.graphId),
  ],
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    template: text("template").notNull(),
    brief: text("brief").notNull(),
    plan: jsonb("plan"),
    status: reportStatusEnum("status").notNull().default("planning"),
    sections: jsonb("sections").$type<
      Array<{
        sectionIndex: number;
        title: string;
        content: string;
        status: string;
      }>
    >().default([]),
    agentTrace: jsonb("agent_trace").default([]),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_reports_workspace").on(table.workspaceId),
  ],
);

// ---------------------------------------------------------------------------
// Cost Events (append-only ledger)
// ---------------------------------------------------------------------------

export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sessionId: uuid("session_id"),
    engine: text("engine").notNull(),
    operation: text("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("idx_cost_workspace").on(table.workspaceId),
    index("idx_cost_session").on(table.sessionId),
    index("idx_cost_timestamp").on(table.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Audit Log (append-only)
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sessionId: uuid("session_id"),
    event: text("event").notNull(),
    actorType: text("actor_type").notNull(), // "system" | "persona" | "user"
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_workspace").on(table.workspaceId),
    index("idx_audit_session").on(table.sessionId),
    index("idx_audit_event").on(table.event),
    index("idx_audit_timestamp").on(table.timestamp),
  ],
);
