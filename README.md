# Atherum

**Collective Intelligence Engine** — synthetic social systems for predictive simulation and deliberative evaluation.

Atherum orchestrates multiple AI agents through structured deliberation rounds to produce collective verdicts on content, strategy, and decisions. One API call, ten perspectives.

## Engines

| Engine | What it does |
|--------|-------------|
| **Mirage** | Multi-agent swarm deliberation with convergence tracking |
| **OASIS** | Social media simulation (Twitter/Reddit dynamics) |
| **Atlas** | Knowledge graph construction from documents and data |
| **Scribe** | Intelligent report generation with tool-calling agents |

## Platform Capabilities

| Name | What it does |
|------|-------------|
| **Mnemosyne** | Persistent agent memory that evolves across sessions |
| **Strata** | Tiered context loading (L0/L1/L2) for efficient token use |
| **Aegis** | Cost governance — track and budget every LLM call |
| **Nexus** | Shared knowledge graphs as collective workspace memory |
| **Prometheus** | Skill acquisition — agents learn new capabilities mid-session |
| **Crucible** | Quality benchmarking and red-teaming of agent outputs |
| **Agora** | Human-in-the-loop — join agent panels as an equal participant |

## Products

Content Review Panels, Living Personas, Campaign Colosseum, War Room, Trend Forge, Echo Chamber, Consensus Engine, Sentinel, Replay, Symposium, Arena, Archetype, Augur.

## Quick Start

```bash
# Clone
git clone https://github.com/ZenderGoD/atherum.git
cd atherum

# Install
pnpm install

# Set up Convex backend
npx convex dev
# Follow prompts to create a project, then set env vars:
npx convex env set LLM_API_KEY "your-openrouter-key"
npx convex env set LLM_BASE_URL "https://openrouter.ai/api/v1"
npx convex env set LLM_MODEL_NAME "google/gemini-3.1-flash-lite-preview:nitro"

# Start the landing page (optional)
pnpm --filter @atherum/web dev
# → http://localhost:3100
```

The API is live as soon as Convex deploys — no server to start.

## API Usage

All endpoints are served by Convex at your deployment URL (e.g. `https://your-deployment.convex.site`).

### Submit a content review

```bash
curl -X POST https://your-deployment.convex.site/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "content_description": "Product photo of sneakers on concrete with dramatic lighting",
    "content_type": "image",
    "image_url": "https://example.com/sneaker.jpg",
    "agent_count": 10,
    "max_rounds": 3
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "review_id": "rev_abc123",
    "session_id": "sess_xyz"
  }
}
```

### Poll for results

```bash
curl https://your-deployment.convex.site/api/review/rev_abc123/status
```

Returns the full deliberation result including approval score, agent reactions, convergence data, key agreements, dissenting views, and agent journey tracking.

### Ask follow-up questions

After a review completes, ask follow-up questions with full deliberation context:

```bash
curl -X POST https://your-deployment.convex.site/api/review/rev_abc123/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What specific changes would make this image more compelling?"
  }'
```

Optionally target a specific agent:

```json
{
  "question": "Why did you rate the brand alignment so low?",
  "agent_id": "agent-uuid-here"
}
```

## Architecture

```
atherum/
├── convex/                # Convex backend (API + database + actions)
│   ├── schema.ts          # Database schema
│   ├── http.ts            # HTTP endpoints (POST/GET /api/review, /ask, /health)
│   ├── deliberate.ts      # Deliberation action (LLM calls, convergence, synthesis)
│   ├── ask.ts             # Follow-up question action
│   └── reviews.ts         # Queries and mutations
├── apps/
│   ├── web/               # Next.js landing page (port 3100)
│   └── oasis-worker/      # FastAPI Python worker for social simulation
├── packages/
│   ├── core/              # Shared types, IDs, errors, Result type
│   ├── mirage/            # Deliberation engine (convergence algorithm)
│   ├── personas/          # Persona generation + tiered context
│   ├── oasis-bridge/      # Typed HTTP client for OASIS worker
│   ├── orchestrator/      # Multi-engine workflow coordination
│   └── store/             # Convex client helper
├── docs/
│   ├── api-reference.md
│   ├── diagrams/
│   └── adr/               # Architecture Decision Records
├── scripts/
│   └── test-review.sh
└── infra/
    └── docker-compose.yml # OASIS worker only
```

## Tech Stack

- **Backend**: [Convex](https://convex.dev) — database, API, actions, scheduling
- **Web**: Next.js 15, Tailwind CSS v4
- **LLM**: OpenAI SDK via OpenRouter (any OpenAI-compatible provider)
- **Build**: pnpm workspaces + Turborepo
- **Simulation**: OASIS/CAMEL-AI (Python, separate worker)

## How It Works

1. **Submit** — POST your content description (and optional image URL) to `/api/review`
2. **Deliberate** — 10 AI agents with distinct personas and reasoning styles analyze your content through multiple rounds, debating and converging
3. **Converge** — TF-IDF convergence measurement tracks agreement. Deliberation stops early when agents reach consensus (threshold: 0.80)
4. **Verdict** — A synthesis produces: approval score (0-100), winning position, key agreements, dissenting views, minority report, and per-agent journey tracking
5. **Ask** — Follow up with questions. The full deliberation transcript is available as context for contextual answers

## Environment Variables

Set via `npx convex env set KEY VALUE`:

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | OpenRouter or OpenAI API key | required |
| `LLM_BASE_URL` | LLM provider base URL | `https://openrouter.ai/api/v1` |
| `LLM_MODEL_NAME` | Model for agent responses | `google/gemini-3.1-flash-lite-preview:nitro` |

## Part of the Zeus Ecosystem

Atherum powers the content review system in [IMAI Studio](https://imai.studio), an AI-powered platform for creating product visuals and marketing content.

## License

Apache 2.0 — see [LICENSE](LICENSE).
