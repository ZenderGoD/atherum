/**
 * Atherum Personas — Generator
 *
 * Generates culturally-grounded AI personas with evaluation frameworks.
 * Two modes:
 *   1. Daily roster: 10-20 diverse personas grounded in current trends
 *   2. On-demand: targeted personas matching specific constraints
 *
 * The generator uses web search to ground personas in current cultural
 * context, making them aware of trends, events, and discourse patterns.
 */

import type {
  Persona,
  PersonaGenerationRequest,
  PersonaGenerationResult,
  Demographics,
  Psychographics,
  EvaluationFramework,
  PersonaId,
} from "@atherum/core";
import type { Result } from "@atherum/core";

// ---------------------------------------------------------------------------
// Dependencies (injected)
// ---------------------------------------------------------------------------

export interface GeneratorDependencies {
  /** Call LLM for persona generation */
  llm: (systemPrompt: string, userPrompt: string) => Promise<{
    content: string;
    tokenUsage: { input: number; output: number };
  }>;
  /** Web search for trend grounding */
  webSearch: (query: string) => Promise<string[]>;
  /** Compute embedding for drift tracking */
  embed: (text: string) => Promise<number[]>;
  /** Record cost */
  recordCost: (tokens: { input: number; output: number }, model: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Archetype library — diverse base archetypes to sample from
// ---------------------------------------------------------------------------

const BASE_ARCHETYPES = [
  // Age/generation diversity
  "Gen-Z digital native",
  "Millennial creative professional",
  "Gen-X pragmatic consumer",
  "Baby Boomer traditional media consumer",

  // Cultural diversity
  "Urban streetwear enthusiast",
  "Suburban family-focused consumer",
  "Rural small-business owner",
  "International expat professional",

  // Professional diversity
  "Fashion industry insider",
  "Tech startup founder",
  "Healthcare worker",
  "Educator and lifelong learner",
  "Freelance creative",
  "Corporate marketing executive",

  // Engagement style diversity
  "Passionate community builder",
  "Skeptical critical thinker",
  "Trend-chasing early adopter",
  "Value-conscious deal seeker",
  "Luxury aspirational consumer",
  "Sustainability-focused activist",

  // Media consumption diversity
  "TikTok-first short-form consumer",
  "Podcast deep-dive listener",
  "Newsletter curator",
  "Reddit power user",
  "Instagram aesthetic curator",
  "YouTube long-form researcher",
];

// ---------------------------------------------------------------------------
// Generation prompts
// ---------------------------------------------------------------------------

function buildGenerationSystemPrompt(): string {
  return `You are a persona generator for a content evaluation system. You create detailed, culturally-grounded AI personas that can evaluate creative content from authentic perspectives.

Each persona must have:
1. A specific name, age, location, and occupation
2. A Big Five personality profile (each trait 0.0 to 1.0)
3. Cultural anchors — specific brands, communities, media they identify with
4. An evaluation framework — the lens through which they judge content
5. Scoring rubrics — specific dimensions they rate on (3-5 dimensions)
6. Known biases they tend to exhibit

CRITICAL: Personas must feel like real people, not stereotypes. Give them contradictions, specific tastes, and nuanced viewpoints. A Gen-Z streetwear enthusiast might also love classical music. A suburban mom might be a former punk musician.

Respond in valid JSON matching the provided schema.`;
}

function buildGenerationUserPrompt(
  archetype: string,
  trendContext: string[],
  constraints?: PersonaGenerationRequest["constraints"],
): string {
  let prompt = `Generate a persona based on this archetype: "${archetype}"

Current cultural context (from web search):
${trendContext.map((t) => `- ${t}`).join("\n")}
`;

  if (constraints?.requiredRubrics?.length) {
    prompt += `\nMust include these scoring dimensions: ${constraints.requiredRubrics.join(", ")}`;
  }

  if (constraints?.demographicFilters) {
    const filters = constraints.demographicFilters;
    if (filters.age) prompt += `\nAge: approximately ${filters.age}`;
    if (filters.location) prompt += `\nLocation: ${filters.location}`;
    if (filters.occupation) prompt += `\nOccupation: ${filters.occupation}`;
  }

  prompt += `

Respond with a JSON object:
{
  "name": "string",
  "archetype": "string (refined from input)",
  "demographics": {
    "age": number,
    "gender": "string",
    "location": "string",
    "occupation": "string",
    "incomeRange": "string",
    "education": "string"
  },
  "psychographics": {
    "personality": {
      "openness": 0.0-1.0,
      "conscientiousness": 0.0-1.0,
      "extraversion": 0.0-1.0,
      "agreeableness": 0.0-1.0,
      "neuroticism": 0.0-1.0
    },
    "values": ["string", ...],
    "culturalAnchors": ["string", ...],
    "mediaConsumptionStyle": "string"
  },
  "evaluation": {
    "lens": "string (e.g. 'authenticity seeker')",
    "rubrics": [
      {
        "dimension": "string",
        "description": "string",
        "weight": 0.0-1.0,
        "lowAnchor": "string",
        "highAnchor": "string"
      }
    ],
    "knownBiases": ["string", ...]
  }
}

Rubric weights must sum to 1.0. Include 3-5 rubric dimensions.`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate personas according to the request specification.
 */
export async function generatePersonas(
  request: PersonaGenerationRequest,
  deps: GeneratorDependencies,
): Promise<Result<PersonaGenerationResult>> {
  const startTime = Date.now();
  let totalCostTokens = { input: 0, output: 0 };

  // Step 1: Gather trend context via web search
  const trendQueries = request.trendContext || [
    "current social media trends today",
    "viral content this week",
    "cultural moments trending now",
  ];

  const trendResults = await Promise.all(
    trendQueries.map((q) => deps.webSearch(q)),
  );
  const trendContext = trendResults.flat().slice(0, 10);

  // Step 2: Select archetypes
  const archetypes = selectArchetypes(
    request.count,
    request.constraints?.archetypes,
  );

  // Step 3: Generate each persona
  const personas: Persona[] = [];
  const systemPrompt = buildGenerationSystemPrompt();

  for (const archetype of archetypes) {
    try {
      const userPrompt = buildGenerationUserPrompt(
        archetype,
        trendContext,
        request.constraints,
      );

      const response = await deps.llm(systemPrompt, userPrompt);
      totalCostTokens.input += response.tokenUsage.input;
      totalCostTokens.output += response.tokenUsage.output;

      // Parse the generated persona
      const parsed = JSON.parse(response.content);

      // Compute baseline embedding for drift detection
      const personaDescription = `${parsed.name}, ${parsed.archetype}. ${parsed.evaluation.lens}. Values: ${parsed.psychographics.values.join(", ")}`;
      const embedding = await deps.embed(personaDescription);

      const persona: Persona = {
        id: crypto.randomUUID() as PersonaId,
        workspaceId: request.workspaceId,
        name: parsed.name,
        archetype: parsed.archetype,
        demographics: parsed.demographics,
        psychographics: parsed.psychographics,
        evaluation: normalizeRubricWeights(parsed.evaluation),
        memory: {
          episodic: [],
          semantic: {
            brandPreferences: {},
            recurringThemes: [],
            lastDistilledAt: new Date(),
          },
          procedural: {
            learnings: [],
            acquiredSkills: [],
          },
        },
        provenance: {
          generatedAt: new Date(),
          generationMethod: request.workspaceId
            ? "workspace-custom"
            : "daily-roster",
          trendSignals: trendContext,
        },
        consistency: {
          baselineEmbedding: embedding,
          currentDrift: 0,
          lastCheckedAt: new Date(),
        },
      };

      personas.push(persona);
    } catch (error) {
      // Individual persona generation failure — continue with others
      console.error(`Failed to generate persona for archetype "${archetype}":`, error);
    }
  }

  // Record total cost
  await deps.recordCost(totalCostTokens, "default");

  if (personas.length === 0) {
    return {
      ok: false,
      error: {
        code: "PERSONA_GENERATION_FAILED",
        engine: "personas",
        message: `Failed to generate any personas (attempted ${request.count})`,
        requestedCount: request.count,
        generatedCount: 0,
      },
    };
  }

  return {
    ok: true,
    value: {
      personas,
      costUsd: 0, // computed by recordCost dependency
      generatedAt: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Select archetypes ensuring diversity. If specific archetypes are
 * requested, use those. Otherwise, sample from the base library
 * with maximum spread.
 */
function selectArchetypes(
  count: number,
  requested?: string[],
): string[] {
  if (requested && requested.length >= count) {
    return requested.slice(0, count);
  }

  const selected = requested ? [...requested] : [];
  const remaining = BASE_ARCHETYPES.filter(
    (a) => !selected.includes(a),
  );

  // Shuffle remaining for random diversity
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  while (selected.length < count && remaining.length > 0) {
    selected.push(remaining.pop()!);
  }

  return selected;
}

/**
 * Ensure rubric weights sum to 1.0.
 */
function normalizeRubricWeights(
  evaluation: EvaluationFramework,
): EvaluationFramework {
  const totalWeight = evaluation.rubrics.reduce(
    (sum, r) => sum + r.weight,
    0,
  );
  if (totalWeight === 0 || Math.abs(totalWeight - 1.0) < 0.001) {
    return evaluation;
  }
  return {
    ...evaluation,
    rubrics: evaluation.rubrics.map((r) => ({
      ...r,
      weight: r.weight / totalWeight,
    })),
  };
}
