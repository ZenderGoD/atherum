# Contributing to Atherum

Thanks for your interest in contributing to Atherum. This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+ (for OASIS worker only)

### Setup

```bash
git clone https://github.com/ZenderGoD/atherum.git
cd atherum
pnpm install

# Set up Convex backend
npx convex dev
# Follow prompts to create a project

# Set LLM env vars in Convex
npx convex env set LLM_API_KEY "your-openrouter-key"
npx convex env set LLM_BASE_URL "https://openrouter.ai/api/v1"
npx convex env set LLM_MODEL_NAME "google/gemini-3.1-flash-lite-preview:nitro"
```

### Running locally

```bash
# Convex backend (watches for changes, auto-deploys)
npx convex dev

# Landing page (port 3100)
pnpm --filter @atherum/web dev

# Test a review via curl
curl -X POST https://your-deployment.convex.site/api/review \
  -H "Content-Type: application/json" \
  -d '{"content_description": "test image", "content_type": "image", "review_id": "test_001", "max_rounds": 2, "agent_count": 3}'
```

## Project Structure

```
convex/            → Convex backend (API, database, actions)
apps/web/          → Next.js marketing site
apps/oasis-worker/ → Python social simulation worker
packages/core/     → Shared types, IDs, errors
packages/mirage/   → Deliberation engine (convergence algorithm)
packages/personas/ → Persona generation + memory
packages/oasis-bridge/ → OASIS worker client
packages/orchestrator/ → Multi-engine workflows
packages/store/    → Convex client helper
```

## How to Contribute

### Picking an Issue

- Check [open issues](https://github.com/ZenderGoD/atherum/issues) for `good first issue` or `help wanted` labels
- Comment on the issue to let others know you're working on it
- If you have a new idea, open an issue first to discuss before writing code

### Making Changes

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Ensure all packages build: `pnpm build`
5. Test your changes: `bash scripts/test-review.sh 3 2`
6. Commit with a descriptive message (see Commit Convention below)
7. Push and open a PR

### Commit Convention

We use conventional commits:

```
feat: add new persona archetype for fashion reviewers
fix: handle empty LLM response in deliberation round
docs: update API reference with webhook retry info
chore: upgrade drizzle-orm to latest
refactor: extract convergence logic into pure functions
test: add unit tests for TF-IDF embedding
```

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Update relevant docs if you change behavior
- Add a clear description of what changed and why
- Link to the issue it addresses (if any)
- Ensure `pnpm build` passes

## Areas Where Help is Needed

### High Priority

- **Worker pool system** — Persistent agent workers instead of per-request spin-up
- **Multi-tenancy** — Workspace isolation, API key management
- **Batch reviews** — Submit multiple assets, get one consolidated report
- **Agent diversity** — More persona archetypes, better scoring rubrics
- **Streaming** — SSE for real-time deliberation progress

### Medium Priority

- **Atlas engine** — Knowledge graph construction (TypeScript)
- **Scribe engine** — Report generation with tool-calling agent
- **OASIS integration** — Wire up the Python social simulation worker
- **Dashboard** — Admin UI for managing workspaces and viewing analytics
- **Testing** — Unit tests for convergence algorithm, integration tests for API

### Always Welcome

- Bug fixes
- Documentation improvements
- Performance optimizations
- TypeScript type improvements
- New persona archetypes and evaluation rubrics

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` and narrow)
- Prefer `Result<T, E>` over throwing exceptions for domain errors
- Keep functions pure where possible
- Use branded types from `@atherum/core` for IDs

## Architecture Decisions

Check `docs/adr/` for Architecture Decision Records explaining key design choices:

- ADR-001: Monorepo structure
- ADR-002: Deliberation algorithm (parallel with anonymous summaries)
- ADR-003: OASIS as HTTP subprocess
- ADR-004: Tiered context loading
- ADR-005: Cost governance

## Questions?

Open a [discussion](https://github.com/ZenderGoD/atherum/discussions) or reach out in issues.
