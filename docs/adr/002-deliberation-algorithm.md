# ADR-002: Clean-Room Deliberation Algorithm

## Status
Accepted

## Context
Atherum's Mirage engine provides structured multi-agent deliberation. A prior system (MiroFish, AGPL-licensed) had a deliberation implementation. We must design a clean-room implementation with no MiroFish code reference.

The core problem: N agents with distinct personas must debate a subject over multiple rounds, with convergence tracking and consensus detection.

## Decision
The deliberation algorithm is a **state machine with round-based execution**:

### Round Execution
1. All agents respond **concurrently** within a round (no intra-round visibility)
2. Between rounds, an **anonymous summary** of all positions is generated
3. Each agent sees: (a) the original prompt, (b) the anonymous summary of the prior round, (c) their own previous response
4. Agents do NOT see other agents' individual responses — only the aggregated summary

This design choice prevents anchoring bias (where agents converge on the first speaker's position) and encourages genuine independent thinking.

### Convergence Measurement
Two methods, used based on availability:

**TF-IDF + Cosine Similarity (default)**
- Tokenize each agent's position summary
- Compute TF-IDF vectors across the corpus of positions
- Pairwise cosine similarity between all agents
- Overall convergence = mean of all pairwise similarities

**Embedding Cosine Similarity (preferred when available)**
- Embed each position summary via the LLM provider's embedding API
- Pairwise cosine similarity on embedding vectors
- Same aggregation as TF-IDF

### Consensus Detection
- After each round, convergence is measured
- If `overallScore >= config.convergenceThreshold`, declare consensus
- If `config.allowEarlyExit`, stop immediately
- Otherwise, continue until maxRounds

### Cluster Identification
- Agglomerative clustering (average linkage) on the pairwise similarity matrix
- Clusters merge until inter-cluster similarity drops below 0.5
- Clusters with 1 member represent dissenting positions

### Voting
- Supports weighted, equal, or ranked-choice voting
- Weights come from domain relevance (how well-matched this persona is to the content being evaluated)

### Subgroups (Advanced)
- Sessions can fork into subgroups (coalitions, side conversations)
- Each subgroup runs its own mini-deliberation in parallel
- Subgroups produce merge summaries that feed back into the main thread
- This enables concurrent exploration of different aspects of a complex decision

## Consequences

### What becomes easier
- Full audit trail — every response, convergence measurement, and vote is recorded
- Agent journey tracking — we can show how each agent's position evolved
- Minority reports — dissenting clusters are explicitly identified
- Reproducibility — same personas + prompt should produce similar (not identical) deliberations

### What becomes harder
- Anonymous summaries add LLM cost (one extra call per round)
- Convergence measurement via TF-IDF is noisy for short positions (embedding method is preferred)
- Subgroup management adds complexity — we defer it to v2

### Key Difference from Typical Approaches
Most multi-agent debate systems use sequential turns (agent A speaks, agent B responds). Our parallel-with-anonymous-summary approach is deliberately different because it produces more diverse perspectives and avoids the well-documented problem of agents anchoring on early speakers.
