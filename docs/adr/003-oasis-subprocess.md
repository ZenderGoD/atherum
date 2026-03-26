# ADR-003: OASIS as HTTP Subprocess, Not Embedded Python

## Status
Accepted

## Context
The OASIS social simulation framework (from CAMEL-AI) is Python-only. Atherum is TypeScript-first. We need a way to invoke OASIS from the TypeScript API.

Options considered:
1. **Embed Python via child_process** — spawn Python scripts from Node
2. **HTTP service** — run OASIS as a separate FastAPI server
3. **Message queue** — communicate via Redis/BullMQ
4. **Python-to-WASM** — compile OASIS to WebAssembly (infeasible)

## Decision
**HTTP service** (Option 2). The OASIS worker runs as a FastAPI server in its own container. The TypeScript `oasis-bridge` package provides a typed client.

### Why not child_process?
- No lifecycle management (crashes, restarts, health checks)
- Stdout/stderr parsing is fragile
- Cannot scale independently
- Harder to test in isolation

### Why not message queue?
- Adds operational complexity (queue infrastructure, dead letter handling)
- Simulations are long-running (minutes), not fire-and-forget
- SSE streaming of progress is more natural over HTTP

### Why HTTP?
- Standard, well-understood protocol
- FastAPI gives us automatic OpenAPI docs and validation
- The worker can be deployed, scaled, and monitored independently
- Circuit breaker pattern is straightforward over HTTP
- ~1ms latency overhead is negligible for minute-long simulations

## Consequences

### What becomes easier
- OASIS worker can be developed and tested independently (Python team, different CI)
- Worker can be scaled horizontally if simulation demand grows
- Health checks and circuit breakers protect the TS API from Python failures
- Clear contract boundary (Pydantic models mirror TypeScript types)

### What becomes harder
- Two containers to deploy and manage
- Network reliability between TS API and OASIS worker
- Schema drift between TypeScript and Python types (mitigated by shared JSON schemas)
