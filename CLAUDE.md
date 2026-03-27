<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Project Context

Atherum is a collective intelligence engine. It orchestrates multiple AI agents through structured deliberation to produce collective verdicts.

### Key Architecture
- All backend logic lives in `convex/` — there is NO separate API server
- HTTP endpoints are in `convex/http.ts` (Convex HTTP actions)
- Deliberation engine is in `convex/deliberate.ts` (Node.js action)
- Agent definitions in `convex/agents.ts`
- The landing page is a separate Next.js app in `apps/web/`

### Deployed At
- API: `https://next-okapi-818.convex.site`
- Convex Dashboard: `https://dashboard.convex.dev/d/next-okapi-818`

### Testing
- `bash scripts/test-foundation.sh` — API validation, deliberation, edge cases, concurrency
- `bash scripts/test-properties.sh` — invariants (convergence range, score range, diversity)
- Always run tests after changes to `convex/deliberate.ts`

### Known Issues
- Concurrent multi-model reviews can timeout under load (free-tier model latency)
- Different content can produce identical approval scores (synthesis not differentiating enough)
- Embedding API may not be supported by all OpenRouter models (TF-IDF fallback activates)

### Design Principles
- No cards in UI — use typography, spacing, dividers
- Dark theme with warm monochrome + muted teal accent
- Apache 2.0 license — no copyleft dependencies
- Clean-room implementation — no MiroFish code (AGPL)
