# Atherum — Data Flow Diagrams

## 1. Content Review Panel (Primary IMAI Integration)

```
Client (IMAI)
    │
    │  POST /api/v1/products/content-review
    │  { content, reviewType, focusAreas }
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│                                                             │
│  1. Resolve workspace → load brand context                  │
│  2. Check workspace monthly budget                          │
│  3. Estimate cost → reject if over budget                   │
│                                                             │
│  ┌──────────────────────────────────────────────────┐       │
│  │          Persona Selection (personas pkg)         │       │
│  │                                                  │       │
│  │  a. Load global roster from Redis                │       │
│  │  b. Load workspace roster from Redis             │       │
│  │  c. Score personas by archetype relevance to     │       │
│  │     brand context + content type                 │       │
│  │  d. Select top N (3 for quick, 7 for deep)      │       │
│  │  e. If gaps: generate on-demand personas         │       │
│  │  f. Inject brand context into each persona's     │       │
│  │     L1 memory                                    │       │
│  │  g. Build PanelistContext[] with system prompts   │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │        Mirage Deliberation (mirage pkg)           │       │
│  │                                                  │       │
│  │  Round 1:                                        │       │
│  │    → All agents evaluate content concurrently    │       │
│  │    → Each produces: scores[], reasoning,         │       │
│  │      positionSummary, confidence                 │       │
│  │    → Convergence measured (TF-IDF or embedding)  │       │
│  │    → Anonymous summary generated                 │       │
│  │    → Cost recorded to Redis + Postgres           │       │
│  │    → SSE: agent.scored, round.completed          │       │
│  │                                                  │       │
│  │  Round 2..N:                                     │       │
│  │    → Each agent sees: original content +         │       │
│  │      anonymous summary + own prior response      │       │
│  │    → Agents can shift positions (tracked)        │       │
│  │    → Convergence measured again                  │       │
│  │    → If converged → early exit                   │       │
│  │    → If budget exceeded → force stop             │       │
│  │                                                  │       │
│  │  Outcome computation:                            │       │
│  │    → Aggregate weighted scores                   │       │
│  │    → Identify majority + minority clusters       │       │
│  │    → Build agent journey maps                    │       │
│  │    → Record votes                                │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │        Scribe Report Generation (scribe pkg)      │       │
│  │                                                  │       │
│  │  a. Plan report sections based on template       │       │
│  │  b. For each section:                            │       │
│  │     → ReACT agent queries deliberation outcome   │       │
│  │     → Agent calls tools (graph-query, data)      │       │
│  │     → Generates section markdown                 │       │
│  │     → SSE: section.completed                     │       │
│  │  c. Compile full report                          │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │        Post-Session (background jobs)             │       │
│  │                                                  │       │
│  │  a. Save episodic memory for each persona        │       │
│  │  b. Trigger procedural memory extraction         │       │
│  │  c. Update workspace spend counters              │       │
│  │  d. Persist final state from Redis → Postgres    │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
    │
    │  SSE stream: panel.assembled → agent.scored →
    │              round.completed → deliberation.done →
    │              report.section → review.completed
    │
    ▼
Client receives complete review with scores, reasoning, report
```


## 2. Living Personas (Persistent Interactive Panel)

```
Client
    │
    │  POST /api/v1/products/living-personas
    │  { workspaceId, panelConfig, initialTopic }
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│                                                             │
│  Phase 1: Panel Creation (one-time)                         │
│  ┌──────────────────────────────────────────────────┐       │
│  │  a. Generate workspace-specific personas          │       │
│  │     (custom archetypes matching brand audience)   │       │
│  │  b. Initialize L1 semantic memory with brand      │       │
│  │     context, competitor awareness, industry trends│       │
│  │  c. Store as persistent workspace personas        │       │
│  │     (no TTL, lives forever)                       │       │
│  │  d. Each persona gets a "focus group chair" name  │       │
│  │     and stable identity                           │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  Phase 2: Ongoing Sessions (repeated)                       │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │  a. Client sends new topic/content to existing    │       │
│  │     panel (same persona IDs every time)           │       │
│  │  b. Load L0 (current content) + L1 (accumulated   │       │
│  │     brand preferences from past sessions)         │       │
│  │  c. Run deliberation via Mirage                   │       │
│  │  d. After session: update L1 memory               │       │
│  │  e. Periodically: run L2 distillation             │       │
│  │     (personas genuinely learn and improve)        │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  Key difference from Content Review:                        │
│  - Personas are PERSISTENT across sessions                  │
│  - Memory accumulates — the panel gets smarter              │
│  - Identity is stable — clients recognize "their" panelists │
└─────────────────────────────────────────────────────────────┘
```


## 3. War Room (Crisis Simulation)

```
Client
    │
    │  POST /api/v1/products/war-room
    │  { crisisScenario, platforms, duration72h, brandContext }
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
│                                                             │
│  Phase 1: Crisis Setup                                      │
│  ┌──────────────────────────────────────────────────┐       │
│  │  a. Generate crisis-relevant personas:            │       │
│  │     - Brand loyalists, critics, neutral observers │       │
│  │     - Journalists, influencers, competitors       │       │
│  │     - Regulators, affected parties                │       │
│  │  b. Build knowledge graph (Atlas) from:           │       │
│  │     - Crisis scenario description                 │       │
│  │     - Brand public information                    │       │
│  │     - Historical crisis precedents (web search)   │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  Phase 2: Multi-Platform Simulation (parallel)              │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │                                                  │       │
│  │  ┌──────────────┐    ┌──────────────┐           │       │
│  │  │ OASIS Twitter │    │ OASIS Reddit │           │       │
│  │  │ sim (72 vhrs) │    │ sim (72 vhrs)│           │       │
│  │  └──────┬───────┘    └──────┬───────┘           │       │
│  │         │                   │                    │       │
│  │         └───────┬───────────┘                    │       │
│  │                 │                                │       │
│  │    Progress streamed to client via SSE           │       │
│  │    Events: viral, echo-chamber, sentiment-shift  │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  Phase 3: Deliberation on Response Strategy                 │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │  a. Feed simulation results into Mirage           │       │
│  │  b. Crisis team personas debate response options: │       │
│  │     - Apologize immediately                       │       │
│  │     - Investigate then respond                    │       │
│  │     - No comment                                  │       │
│  │     - Proactive outreach                          │       │
│  │  c. Strategy: adversarial (devil's advocate       │       │
│  │     assigned)                                     │       │
│  │  d. For each response option: simulate public     │       │
│  │     reaction via OASIS (another 24 vhrs)          │       │
│  └──────────────────────────┬───────────────────────┘       │
│                             │                               │
│  Phase 4: Crisis Report                                     │
│  ┌──────────────────────────▼───────────────────────┐       │
│  │  Scribe generates comprehensive crisis assessment:│       │
│  │  - Simulation timeline of crisis propagation      │       │
│  │  - Sentiment analysis across platforms            │       │
│  │  - Response option scoring with simulated outcomes│       │
│  │  - Recommended action plan with confidence levels │       │
│  │  - Minority opinions and risk factors             │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
    │
    │  Output: Crisis assessment report with simulated outcomes
    │          for each response strategy
    ▼
```


## 4. Agent Generation and Caching Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Daily Cron Job (06:00 UTC)                      │
│                                                             │
│  1. Web search: current trends, cultural moments,           │
│     viral content, social discourse topics                   │
│  2. Generate 10-20 diverse base personas grounded in        │
│     current cultural context                                │
│  3. For each persona:                                       │
│     a. Generate demographics, psychographics                │
│     b. Generate evaluation framework + scoring rubrics      │
│     c. Compute baseline embedding (for drift detection)     │
│     d. Store in Postgres (durable)                          │
│     e. Cache in Redis with 25h TTL                          │
│  4. Update Redis global roster key                          │
│                                                             │
│  Global roster is the "standing army" — always available,   │
│  culturally current, ready for any workspace                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│            Per-Review Agent Selection                        │
│                                                             │
│  Input: content to review + workspace brand context         │
│                                                             │
│  1. Load global roster from Redis                           │
│  2. Load workspace roster from Redis (if exists)            │
│  3. Score each persona's relevance:                         │
│     - Archetype match to brand's target audience            │
│     - Evaluation framework fit for content type             │
│     - Diversity bonus (avoid all-similar panels)            │
│  4. Select top-N ensuring diversity across:                 │
│     - Demographics (age, location, occupation)              │
│     - Psychographics (personality spread)                   │
│     - Evaluation lens (different perspectives)              │
│  5. For each selected persona:                              │
│     a. Clone base persona                                   │
│     b. Inject workspace brand context into L1 memory        │
│     c. Load any existing workspace-specific memory          │
│     d. Build full system prompt with L0 + L1 context        │
│  6. If diversity gaps remain: generate 1-3 on-demand        │
│     personas targeted at the gap                            │
│                                                             │
│  Output: PanelistContext[] ready for Mirage                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│            Post-Session Memory Update                        │
│                                                             │
│  After every session where a persona participated:          │
│                                                             │
│  1. Create episodic memory entry:                           │
│     - Session summary                                       │
│     - Positions taken + confidence                          │
│     - Whether positions shifted                             │
│                                                             │
│  2. Queue procedural extraction job:                        │
│     - Feed session transcript to LLM                        │
│     - Extract: "what did this persona learn?"               │
│     - Output: new rules, updated skills, brand prefs        │
│     - Merge into semantic (L1) and procedural (L2) memory   │
│                                                             │
│  3. Consistency check:                                      │
│     - Compute current persona embedding                     │
│     - Compare to baseline embedding                         │
│     - If drift > 0.3: flag for review                       │
│     - Prevents personas from losing their identity          │
│                                                             │
│  4. Update Redis cache with new memory state                │
└─────────────────────────────────────────────────────────────┘
```


## 5. Error Handling and Retry Patterns

```
┌─────────────────────────────────────────────────────────────┐
│                Error Handling Strategy                        │
│                                                             │
│  Layer 1: LLM Call Level                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │  - Retry with exponential backoff (3 attempts)    │       │
│  │  - On 429 (rate limit): backoff with jitter       │       │
│  │  - On 500 (provider error): switch to fallback    │       │
│  │    model if configured                            │       │
│  │  - On timeout: retry once, then fail              │       │
│  │  - On invalid response (unparseable JSON):        │       │
│  │    retry with stricter prompt, then fail           │       │
│  │  - All failures recorded as CostEvent (tokens     │       │
│  │    were still consumed)                            │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  Layer 2: Agent Level                                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │  - If agent fails in a round: exclude from round  │       │
│  │    but keep in session                            │       │
│  │  - If agent fails 2 consecutive rounds: remove    │       │
│  │    from session, note in audit log                │       │
│  │  - If >50% of agents fail in a round: abort       │       │
│  │    session with ConvergenceFailedError            │       │
│  │  - Agent failures don't block other agents        │       │
│  │    (concurrent execution with individual catches) │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  Layer 3: Session Level                                     │
│  ┌──────────────────────────────────────────────────┐       │
│  │  - Budget exceeded: compute outcome from          │       │
│  │    available rounds (graceful degradation)        │       │
│  │  - Session timeout (30 min max): same as budget   │       │
│  │  - Infrastructure failure (Redis/Postgres down):  │       │
│  │    session marked as failed, can be replayed      │       │
│  │    from audit log when infra recovers             │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  Layer 4: OASIS Worker Level                                │
│  ┌──────────────────────────────────────────────────┐       │
│  │  - Circuit breaker: 5 failures → OPEN for 60s    │       │
│  │  - Retry: 3 attempts with exponential backoff     │       │
│  │  - If worker unreachable: return OasisWorkerError │       │
│  │    (client can retry later)                       │       │
│  │  - If simulation fails mid-run: return partial    │       │
│  │    results up to the failure point                │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  Layer 5: API Level                                         │
│  ┌──────────────────────────────────────────────────┐       │
│  │  - Domain errors (Result<T,E>) → appropriate HTTP │       │
│  │    status codes:                                  │       │
│  │    BUDGET_EXCEEDED → 402                          │       │
│  │    VALIDATION_ERROR → 400                         │       │
│  │    TENANT_ERROR (not-found) → 404                 │       │
│  │    TENANT_ERROR (rate-limited) → 429              │       │
│  │    OASIS_WORKER_ERROR → 503                       │       │
│  │    Everything else → 500                          │       │
│  │  - All errors include request ID for tracing      │       │
│  │  - All errors logged to audit trail               │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```
