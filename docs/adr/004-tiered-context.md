# ADR-004: Tiered Context Loading for Agent Memory

## Status
Accepted

## Context
Personas accumulate memory over sessions. Loading full history into every LLM call is expensive (tokens) and counterproductive (dilutes focus). We need a strategy for what context to load and when.

## Decision
Three-tier context loading, inspired by human memory systems:

### L0 — Episodic (Always Loaded)
- Current session content and prompt
- This round's specific instructions
- The anonymous summary from the previous round
- Cost: ~500-1500 tokens

### L1 — Semantic (Loaded Per-Session)
- Brand preferences accumulated from past sessions with this workspace
- Recurring evaluation themes
- Recent distilled learnings (last 5)
- Cost: ~300-800 tokens

### L2 — Procedural (Loaded On-Demand)
- Full history of all learnings and skills
- Complete brand preference profiles
- Used only when the persona needs to "remember" something specific
- Loaded via a retrieval step: the agent's current context is used to query L2 memory

### Loading Strategy
1. Session starts: L0 (prompt) + L1 (semantic snapshot) are injected into the system prompt
2. During deliberation: only L0 changes (new round summaries)
3. On explicit need: agent can request L2 retrieval ("let me think about what I've seen from this brand before")
4. After session: L0 is archived, L1 is updated via procedural extraction

### Procedural Memory Extraction
After a session, a background job runs the persona through a "reflection" prompt:
- Input: the session transcript (what the persona said and decided)
- Output: distilled rules, updated skills, brand preference updates
- These are merged into L1/L2 memory

This is the mechanism by which personas "learn" and improve over time.

## Consequences

### What becomes easier
- Token costs are predictable and bounded
- Personas can have rich histories without overwhelming context windows
- Memory extraction creates genuine improvement (not just recall)

### What becomes harder
- L2 retrieval adds latency and cost when triggered
- Procedural extraction is an async background process (not instant)
- Memory consistency: if extraction fails, the persona loses learnings from that session

### Mitigation
- L2 retrieval is rare in practice — most sessions only need L0 + L1
- Extraction failures are retried and logged in the audit trail
- Episodic memories (L0) are always persisted, so extraction can be re-run
