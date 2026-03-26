# Atherum API Reference

Base URL: `http://localhost:3100/api/v1`

Auth: `Authorization: Bearer <api-key>`

All requests include workspace resolution from the API key.

---

## Engine Routes

### Deliberation (Mirage)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/deliberations` | Start a new deliberation session |
| GET | `/deliberations/:id` | Get session state |
| GET | `/deliberations/:id/rounds` | Get rounds with agent responses |
| GET | `/deliberations/:id/outcome` | Get final outcome (consensus map) |
| POST | `/deliberations/:id/stop` | Force-stop a running session |
| GET | `/deliberations/:id/audit` | Full audit trail |
| GET | `/deliberations/:id/stream` | SSE stream of progress |

### Simulation (OASIS)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulations` | Start a new simulation |
| GET | `/simulations/:id` | Get simulation state |
| GET | `/simulations/:id/progress` | SSE progress stream |
| GET | `/simulations/:id/result` | Get final result |
| POST | `/simulations/:id/stop` | Force-stop simulation |

### Knowledge Graphs (Atlas)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/knowledge/ingest` | Ingest documents into a graph |
| GET | `/knowledge/graphs` | List graphs for workspace |
| GET | `/knowledge/graphs/:id` | Get graph metadata + stats |
| POST | `/knowledge/graphs/:id/query` | Query a knowledge graph |
| DELETE | `/knowledge/graphs/:id` | Delete a graph |

### Reports (Scribe)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/reports` | Generate a new report |
| GET | `/reports/:id` | Get report with all sections |
| GET | `/reports/:id/stream` | SSE incremental generation |
| POST | `/reports/:id/chat` | Follow-up question |

### Personas

| Method | Path | Description |
|--------|------|-------------|
| GET | `/personas` | List personas (global + workspace) |
| GET | `/personas/:id` | Get persona with memory summary |
| POST | `/personas/generate` | Generate new personas |
| POST | `/personas/roster/refresh` | Trigger daily roster regen |
| GET | `/personas/:id/memory` | Get full memory (all tiers) |
| PUT | `/personas/:id/memory/distill` | Trigger procedural extraction |

---

## Product Routes

Products compose engines into complete workflows. All return 202 Accepted
with a stream URL for real-time progress.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/products/content-review` | Content review panel |
| GET | `/products/content-review/:id` | Get review results |
| GET | `/products/content-review/:id/stream` | SSE stream |
| POST | `/products/living-personas` | Create persistent panel |
| POST | `/products/living-personas/:panelId/session` | Run session with existing panel |
| POST | `/products/campaign-colosseum` | A/B test content variants |
| POST | `/products/war-room` | Crisis simulation (72h) |
| GET | `/products/war-room/:id/stream` | SSE stream |
| POST | `/products/trend-forge` | Predictive trend analysis |
| POST | `/products/echo-chamber` | Message propagation test |
| POST | `/products/consensus-engine` | Multi-perspective decision |
| POST | `/products/sentinel` | Start brand monitoring |
| GET | `/products/sentinel/:id` | Get monitoring results |
| POST | `/products/replay` | Scenario variant testing |

---

## Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/cost` | Cost dashboard |
| GET | `/admin/cost/:sessionId` | Session cost breakdown |
| GET | `/admin/roster` | Current global agent roster |
| GET | `/admin/health` | Detailed dependency health |
| GET | `/admin/workspaces` | List workspaces |
| POST | `/admin/workspaces` | Create workspace |
| PUT | `/admin/workspaces/:id` | Update workspace |

---

## SSE Event Types

All SSE streams use `text/event-stream` format. Events:

### Deliberation Stream
```
event: session.status
data: {"status": "running"}

event: round.started
data: {"roundNumber": 1}

event: agent.responded
data: {"personaId": "...", "roundNumber": 1, "positionSummary": "..."}

event: convergence.update
data: {"roundNumber": 1, "overallScore": 0.45, "clusters": [...]}

event: round.completed
data: {"roundNumber": 1, "convergence": 0.45}

event: session.completed
data: {"outcome": {...}}

event: cost.update
data: {"totalUsd": 1.23}

event: error
data: {"code": "BUDGET_EXCEEDED", "message": "..."}
```

### Report Stream
```
event: plan.ready
data: {"plan": {...}}

event: section.started
data: {"sectionIndex": 0, "title": "Executive Summary"}

event: section.chunk
data: {"sectionIndex": 0, "text": "partial content..."}

event: section.completed
data: {"sectionIndex": 0, "fullContent": "..."}

event: report.completed
data: {"reportId": "..."}
```

### Simulation Stream
```
event: progress
data: {"virtualHour": 12, "totalHours": 72, "metrics": {...}}

event: event.viral
data: {"postId": "...", "engagements": 5000, "hour": 12}

event: event.echo-chamber
data: {"clusterSize": 150, "topic": "...", "hour": 24}

event: completed
data: {"simulationId": "..."}
```

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "requestId": "uuid"
}
```

HTTP status codes:
- 400: Validation error
- 401: Missing/invalid auth
- 402: Budget exceeded
- 404: Resource not found
- 409: Conflict (e.g., simulation not complete)
- 422: Unprocessable (e.g., convergence failed)
- 429: Rate limited
- 500: Internal error
- 503: OASIS worker unavailable
