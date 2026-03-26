/**
 * Atherum Core — Knowledge Graph Types (Atlas Engine)
 *
 * Atlas follows an ECL pipeline: Extract entities/relationships from documents,
 * Cognify them into an ontology with inference, Load into a graph store.
 */

import type { WorkspaceId, KnowledgeGraphId, DocumentId } from "../ids";

// ---------------------------------------------------------------------------
// ECL Pipeline — Extract, Cognify, Load
// ---------------------------------------------------------------------------

/** Input document to the pipeline */
export interface DocumentInput {
  id: DocumentId;
  workspaceId: WorkspaceId;
  source: "upload" | "url" | "api" | "deliberation-transcript";
  content: string;
  contentType: "text" | "html" | "markdown" | "json";
  metadata?: Record<string, unknown>;
}

/** Extract phase output */
export interface ExtractionResult {
  documentId: DocumentId;
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  /** Raw chunks used for extraction (preserved for provenance) */
  chunks: Array<{
    chunkIndex: number;
    text: string;
    entityIds: string[];
  }>;
  costUsd: number;
}

export interface ExtractedEntity {
  id: string; // deterministic hash of (type, name, workspaceId)
  name: string;
  type: EntityType;
  aliases: string[];
  description: string;
  attributes: Record<string, unknown>;
  /** Which document chunks this entity was found in */
  sourceChunks: number[];
  confidence: number; // 0..1
}

export type EntityType =
  | "person"
  | "organization"
  | "brand"
  | "product"
  | "concept"
  | "event"
  | "location"
  | "trend"
  | "audience-segment"
  | "content-piece"
  | "custom";

export interface ExtractedRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  label: string; // human-readable, e.g. "competes with", "targets audience"
  weight: number; // 0..1, strength of relationship
  attributes: Record<string, unknown>;
  sourceChunks: number[];
  confidence: number;
}

export type RelationshipType =
  | "is-a"
  | "part-of"
  | "related-to"
  | "competes-with"
  | "targets"
  | "created-by"
  | "influences"
  | "derived-from"
  | "temporal-before"
  | "temporal-after"
  | "custom";

/** Cognify phase — ontology generation and inference */
export interface CognifyResult {
  graphId: KnowledgeGraphId;
  /** Inferred entities not directly in source (graph completion) */
  inferredEntities: ExtractedEntity[];
  /** Inferred relationships (graph completion) */
  inferredRelationships: ExtractedRelationship[];
  /** Ontology — high-level structure of the knowledge domain */
  ontology: {
    categories: Array<{
      name: string;
      entityTypes: EntityType[];
      description: string;
    }>;
    hierarchies: Array<{
      parent: string;
      children: string[];
    }>;
  };
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Knowledge graph — the stored artifact
// ---------------------------------------------------------------------------

export interface KnowledgeGraph {
  id: KnowledgeGraphId;
  workspaceId: WorkspaceId;
  name: string;
  /** Source documents that contributed to this graph */
  documentIds: DocumentId[];
  /** Summary statistics */
  stats: {
    entityCount: number;
    relationshipCount: number;
    documentCount: number;
    lastUpdatedAt: Date;
  };
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Graph queries
// ---------------------------------------------------------------------------

export interface GraphQuery {
  graphId: KnowledgeGraphId;
  workspaceId: WorkspaceId;
  query: string; // natural language query
  /** Query strategy */
  strategy: "traversal" | "semantic-search" | "chain-of-thought" | "completion";
  /** Max entities to return */
  limit?: number;
}

export interface GraphQueryResult {
  query: string;
  strategy: string;
  /** Matched entities with their local subgraph */
  results: Array<{
    entity: ExtractedEntity;
    relevanceScore: number;
    connectedEntities: Array<{
      entity: ExtractedEntity;
      relationship: ExtractedRelationship;
      direction: "outgoing" | "incoming";
    }>;
  }>;
  /** If chain-of-thought, the reasoning steps */
  reasoning?: string[];
  costUsd: number;
}
