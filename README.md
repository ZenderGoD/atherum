# Atherum

**Collective Intelligence Engine** — synthetic social systems for predictive simulation and deliberative evaluation.

Atherum orchestrates multiple AI agents through structured deliberation rounds to produce collective verdicts on content, strategy, and decisions. One API call, ten perspectives.

## Engines

| Engine | What it does | Language |
|--------|-------------|----------|
| **Mirage** | Multi-agent swarm deliberation with convergence tracking | TypeScript |
| **OASIS** | Social media simulation (Twitter/Reddit dynamics) | Python |
| **Atlas** | Knowledge graph construction from documents and data | TypeScript |
| **Scribe** | Intelligent report generation with tool-calling agents | TypeScript |

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

# Configure
cp .env.example .env
# Edit .env with your OpenRouter API key

# Build all packages
pnpm build

# Start the API
pnpm --filter @atherum/api dev
# → http://localhost:4000

# Start the landing page
pnpm --filter @atherum/web dev
# → http://localhost:3100
```

## API Usage

### Submit a content review

```bash
curl -X POST http://localhost:4000/api/review \
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
    "session_id": "sess_xyz",
    "task_id": "task_789"
  }
}
```

### Poll for results

```bash
curl http://localhost:4000/api/review/rev_abc123/status
```

Returns the full deliberation result including approval score, agent reactions, convergence data, key agreements, dissenting views, and agent journey tracking.

## Architecture

```
atherum/
├── apps/
│   ├── api/          # Hono API server (port 4000)
│   ├── web/          # Next.js landing page (port 3100)
│   └── oasis-worker/ # FastAPI Python worker for social simulation
├── packages/
│   ├── core/         # Shared types, IDs, errors, Result type
│   ├── mirage/       # Deliberation engine + convergence algorithm
│   ├── personas/     # Persona generation + tiered context
│   ├── oasis-bridge/ # Typed HTTP client for OASIS worker
│   ├── orchestrator/ # Multi-engine workflow coordination
│   └── store/        # Drizzle ORM schema (Postgres) + Redis patterns
├── docs/
│   ├── api-reference.md
│   ├── diagrams/
│   └── adr/          # Architecture Decision Records
├── scripts/
│   └── test-review.sh
└── infra/
    └── docker-compose.yml
```

## Tech Stack

- **API**: Hono (TypeScript) on Node.js
- **Web**: Next.js 15, Tailwind CSS v4
- **Database**: Drizzle ORM + Postgres (planned), Redis for caching
- **LLM**: OpenAI SDK via OpenRouter (any OpenAI-compatible provider)
- **Build**: pnpm workspaces + Turborepo
- **Simulation**: OASIS/CAMEL-AI (Python, separate worker)

## Test

```bash
# Run a 3-agent, 2-round review test
bash scripts/test-review.sh 3 2

# Run a full 10-agent, 3-round review test
bash scripts/test-review.sh 10 3
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `LLM_API_KEY` | OpenRouter or OpenAI API key | required |
| `LLM_BASE_URL` | LLM provider base URL | `https://openrouter.ai/api/v1` |
| `LLM_MODEL_NAME` | Model for agent responses | `google/gemini-3.1-flash-lite-preview:nitro` |
| `DEFAULT_SESSION_BUDGET_USD` | Max spend per review session | `5.00` |

## Part of the Zeus Ecosystem

Atherum powers the content review system in [IMAI Studio](https://imai.studio), an AI-powered platform for creating product visuals and marketing content.

## License

Apache 2.0 — see [LICENSE](LICENSE).
