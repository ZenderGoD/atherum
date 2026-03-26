# ADR-001: Modular Monorepo over Microservices

## Status
Accepted

## Context
Atherum has 4 engines (Mirage, Atlas, Scribe, OASIS) and 9 products that compose them. We need to decide whether to deploy each engine as an independent service or keep them in a single deployable with strong module boundaries.

The team is small (1-3 developers). Domain boundaries between engines are well-understood but products need to compose engines fluently (a content review uses Personas + Mirage + Scribe in sequence). Independently scaling individual engines is not yet a demonstrated need.

## Decision
We use a **pnpm monorepo with Turborepo** structured as a modular monolith:

- `packages/*` — engine libraries with clean public APIs and no cross-engine imports
- `apps/api` — single HTTP server that imports all engine packages
- `apps/oasis-worker` — Python subprocess (separate container, forced by language boundary)

Engines communicate via TypeScript function calls within the same process, not HTTP. The `orchestrator` package composes engines for product workflows.

The only exception is OASIS, which runs as a separate Python service because the CAMEL-AI framework is Python-only. The `oasis-bridge` package provides a typed HTTP client with circuit breaker.

## Consequences

### What becomes easier
- Single deployment (except OASIS worker)
- Engine composition is a function call, not an HTTP request
- Shared types via `@atherum/core` with compile-time safety
- Refactoring across engine boundaries is a single PR
- No distributed transaction problems

### What becomes harder
- Cannot independently scale engines (all engines share Node process resources)
- A bug in one engine can crash the whole API server
- Cannot use different languages for different engines (except OASIS which is already separate)

### Mitigation
- BullMQ jobs provide queue-based isolation for long-running work (deliberations, simulations, reports)
- If an engine needs independent scaling later, the clean package boundary makes extraction straightforward
- Process isolation for critical workloads can be added via worker threads or child processes without architectural changes
