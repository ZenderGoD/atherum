# ADR-005: Cost Governance — Track, Budget, Enforce

## Status
Accepted

## Context
Every Atherum operation calls LLM APIs. A single deliberation with 7 agents over 5 rounds could cost $2-10 depending on model choice. Without governance, a misconfigured session or runaway loop could generate unbounded costs.

## Decision
Three-level cost governance:

### Level 1: Event-Level Tracking
Every LLM call produces a `CostEvent` recorded in Postgres (append-only ledger):
- Workspace, session, engine, operation
- Provider, model, input/output tokens
- Computed cost in USD

Token-to-USD conversion uses a provider pricing table maintained in config, updated manually when providers change pricing.

### Level 2: Session-Level Budgets
Every session (deliberation, simulation, report) has a `costBudgetUsd`:
- Default comes from workspace config (`defaultSessionBudgetUsd`)
- Can be overridden per-request
- Checked after every LLM call via atomic Redis increment
- When budget is hit: `onExceed` strategy applies (stop, warn, or throttle)

The Redis accumulator is the source of truth for live budget checking (fast). Postgres is the source of truth for billing (durable). They are reconciled asynchronously.

### Level 3: Workspace-Level Monthly Budgets
Each workspace has a `monthlyBudgetUsd`:
- Accumulated in Redis (`workspaceMonthlyCost` key)
- Checked before each session starts (not after each LLM call — too expensive)
- If monthly budget exceeded: new sessions are rejected (HTTP 402)
- Reset on the configured day of month

### Cost Estimation
Before starting a session, we estimate cost:
- Deliberation: `agentCount * maxRounds * avgTokensPerResponse * modelPricePerToken`
- Simulation: `agentCount * durationHours * estimatedCallsPerHour * modelPrice`
- Report: `sectionCount * avgTokensPerSection * modelPrice`

Estimates are returned in the 202 response so clients can make informed decisions.

## Consequences

### What becomes easier
- Full cost attribution — know exactly which session, agent, round incurred cost
- Budget enforcement prevents runaway spending
- Cost dashboards for workspace admins

### What becomes harder
- Redis accumulator can drift from Postgres ledger if writes fail (reconciliation job handles this)
- Price table maintenance is manual
- Cost estimation is approximate (actual cost depends on LLM output length)
