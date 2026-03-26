/**
 * Mirage — Convergence Measurement
 *
 * CLEAN-ROOM IMPLEMENTATION.
 *
 * Measures how much the agents agree with each other after each round.
 * Two methods:
 *   1. TF-IDF + Cosine Similarity — fast, works without embeddings
 *   2. Embedding Cosine Similarity — more accurate, requires embedding API
 *
 * The convergence score drives early exit and consensus detection.
 * Cluster identification uses agglomerative clustering on the pairwise
 * similarity matrix.
 */

import type {
  AgentResponse,
  ConvergenceMeasurement,
  PersonaId,
} from "@atherum/core";

// ---------------------------------------------------------------------------
// TF-IDF computation
// ---------------------------------------------------------------------------

interface TermFrequency {
  [term: string]: number;
}

/**
 * Tokenize and compute term frequency for a document.
 * Simple whitespace + lowering. Production would use a proper tokenizer
 * but this is sufficient for convergence tracking where we care about
 * relative similarity, not absolute accuracy.
 */
function computeTF(text: string): TermFrequency {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip short words

  const tf: TermFrequency = {};
  for (const word of words) {
    tf[word] = (tf[word] || 0) + 1;
  }

  // Normalize by document length
  const total = words.length || 1;
  for (const word of Object.keys(tf)) {
    tf[word] /= total;
  }

  return tf;
}

/**
 * Compute IDF across a corpus of documents.
 */
function computeIDF(documents: TermFrequency[]): Record<string, number> {
  const docCount = documents.length;
  const documentFrequency: Record<string, number> = {};

  for (const doc of documents) {
    for (const term of Object.keys(doc)) {
      documentFrequency[term] = (documentFrequency[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, df] of Object.entries(documentFrequency)) {
    idf[term] = Math.log((docCount + 1) / (df + 1)) + 1; // smoothed IDF
  }

  return idf;
}

/**
 * Compute TF-IDF vector for a document given precomputed IDF.
 */
function tfidfVector(tf: TermFrequency, idf: Record<string, number>): Map<string, number> {
  const vector = new Map<string, number>();
  for (const [term, freq] of Object.entries(tf)) {
    vector.set(term, freq * (idf[term] || 0));
  }
  return vector;
}

/**
 * Cosine similarity between two sparse vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weight] of a) {
    normA += weight * weight;
    const bWeight = b.get(term);
    if (bWeight !== undefined) {
      dotProduct += weight * bWeight;
    }
  }

  for (const [, weight] of b) {
    normB += weight * weight;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Clustering — simple agglomerative (single-linkage)
// ---------------------------------------------------------------------------

interface Cluster {
  memberIds: PersonaId[];
  centroidSummary: string;
  internalCohesion: number;
}

/**
 * Agglomerative clustering on a similarity matrix.
 * Merges clusters until the minimum inter-cluster similarity drops below threshold.
 */
function clusterAgents(
  agentIds: PersonaId[],
  similarities: Map<string, number>, // key: "agentA|agentB"
  summaries: Map<string, string>,     // personaId -> positionSummary
  threshold: number = 0.5,
): Cluster[] {
  // Initialize: each agent is its own cluster
  let clusters: Array<{ members: PersonaId[] }> = agentIds.map((id) => ({
    members: [id],
  }));

  // Iteratively merge closest clusters
  while (clusters.length > 1) {
    let bestSim = -1;
    let bestI = 0;
    let bestJ = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average linkage
        let totalSim = 0;
        let pairs = 0;
        for (const a of clusters[i].members) {
          for (const b of clusters[j].members) {
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            totalSim += similarities.get(key) || 0;
            pairs++;
          }
        }
        const avgSim = pairs > 0 ? totalSim / pairs : 0;

        if (avgSim > bestSim) {
          bestSim = avgSim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop merging if best similarity is below threshold
    if (bestSim < threshold) break;

    // Merge bestI and bestJ
    clusters[bestI].members.push(...clusters[bestJ].members);
    clusters.splice(bestJ, 1);
  }

  // Compute cluster metadata
  return clusters.map((c) => {
    // Internal cohesion: average pairwise similarity within cluster
    let totalSim = 0;
    let pairs = 0;
    for (let i = 0; i < c.members.length; i++) {
      for (let j = i + 1; j < c.members.length; j++) {
        const key =
          c.members[i] < c.members[j]
            ? `${c.members[i]}|${c.members[j]}`
            : `${c.members[j]}|${c.members[i]}`;
        totalSim += similarities.get(key) || 0;
        pairs++;
      }
    }

    // Centroid summary: take the position of the most "central" member
    // (highest average similarity to all other members)
    let bestCentroid = c.members[0];
    let bestAvg = 0;
    for (const member of c.members) {
      let avg = 0;
      for (const other of c.members) {
        if (member === other) continue;
        const key = member < other ? `${member}|${other}` : `${other}|${member}`;
        avg += similarities.get(key) || 0;
      }
      avg /= Math.max(c.members.length - 1, 1);
      if (avg > bestAvg) {
        bestAvg = avg;
        bestCentroid = member;
      }
    }

    return {
      memberIds: c.members,
      centroidSummary: summaries.get(bestCentroid) || "",
      internalCohesion: pairs > 0 ? totalSim / pairs : 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Measure convergence across a set of agent responses using TF-IDF.
 *
 * This is the default method. For higher accuracy, embeddings can be
 * pre-computed on AgentResponse.positionEmbedding and passed through
 * the embedding-based variant.
 */
export function measureConvergenceTFIDF(
  responses: AgentResponse[],
  _priorMeasurements: ConvergenceMeasurement[],
): ConvergenceMeasurement {
  const documents = responses.map((r) => r.positionSummary);
  const termFreqs = documents.map(computeTF);
  const idf = computeIDF(termFreqs);
  const vectors = termFreqs.map((tf) => tfidfVector(tf, idf));

  // Compute pairwise similarities
  const pairwise: ConvergenceMeasurement["pairwiseSimilarities"] = [];
  const simMap = new Map<string, number>();
  const summaryMap = new Map<string, string>();

  for (const r of responses) {
    summaryMap.set(r.personaId, r.positionSummary);
  }

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      pairwise.push({
        agentA: responses[i].personaId,
        agentB: responses[j].personaId,
        similarity,
      });
      const key = responses[i].personaId < responses[j].personaId
        ? `${responses[i].personaId}|${responses[j].personaId}`
        : `${responses[j].personaId}|${responses[i].personaId}`;
      simMap.set(key, similarity);
    }
  }

  // Overall score: mean of all pairwise similarities
  const overallScore =
    pairwise.length > 0
      ? pairwise.reduce((sum, p) => sum + p.similarity, 0) / pairwise.length
      : 1; // single agent = perfect convergence

  // Cluster identification
  const clusters = clusterAgents(
    responses.map((r) => r.personaId),
    simMap,
    summaryMap,
  );

  return {
    roundNumber: 0, // caller sets this
    overallScore,
    pairwiseSimilarities: pairwise,
    clusters,
    method: "tfidf-cosine",
  };
}

/**
 * Measure convergence using pre-computed embeddings.
 * Falls back to TF-IDF if embeddings are not available.
 */
export function measureConvergenceEmbeddings(
  responses: AgentResponse[],
  priorMeasurements: ConvergenceMeasurement[],
): ConvergenceMeasurement {
  // Check if all responses have embeddings
  const allHaveEmbeddings = responses.every(
    (r) => r.positionEmbedding && r.positionEmbedding.length > 0,
  );

  if (!allHaveEmbeddings) {
    return measureConvergenceTFIDF(responses, priorMeasurements);
  }

  // Embedding-based cosine similarity
  const pairwise: ConvergenceMeasurement["pairwiseSimilarities"] = [];
  const simMap = new Map<string, number>();
  const summaryMap = new Map<string, string>();

  for (const r of responses) {
    summaryMap.set(r.personaId, r.positionSummary);
  }

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i].positionEmbedding!;
      const b = responses[j].positionEmbedding!;

      let dot = 0, normA = 0, normB = 0;
      for (let k = 0; k < a.length; k++) {
        dot += a[k] * b[k];
        normA += a[k] * a[k];
        normB += b[k] * b[k];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      const similarity = denom > 0 ? dot / denom : 0;

      pairwise.push({
        agentA: responses[i].personaId,
        agentB: responses[j].personaId,
        similarity,
      });
      const key = responses[i].personaId < responses[j].personaId
        ? `${responses[i].personaId}|${responses[j].personaId}`
        : `${responses[j].personaId}|${responses[i].personaId}`;
      simMap.set(key, similarity);
    }
  }

  const overallScore =
    pairwise.length > 0
      ? pairwise.reduce((sum, p) => sum + p.similarity, 0) / pairwise.length
      : 1;

  const clusters = clusterAgents(
    responses.map((r) => r.personaId),
    simMap,
    summaryMap,
  );

  return {
    roundNumber: 0,
    overallScore,
    pairwiseSimilarities: pairwise,
    clusters,
    method: "embedding-cosine",
  };
}
