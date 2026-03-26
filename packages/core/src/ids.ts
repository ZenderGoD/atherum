/**
 * Atherum Core — Branded ID Types
 *
 * Branded types prevent accidentally passing a PersonaId where a SessionId
 * is expected. At runtime these are just strings, but TypeScript catches
 * misuse at compile time.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type PersonaId = Brand<string, "PersonaId">;
export type SessionId = Brand<string, "SessionId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SimulationId = Brand<string, "SimulationId">;
export type KnowledgeGraphId = Brand<string, "KnowledgeGraphId">;
export type DocumentId = Brand<string, "DocumentId">;
export type ReportId = Brand<string, "ReportId">;
export type DeliberationRoundId = Brand<string, "DeliberationRoundId">;
export type SubgroupId = Brand<string, "SubgroupId">;
export type CostEventId = Brand<string, "CostEventId">;
export type AuditEntryId = Brand<string, "AuditEntryId">;

/**
 * Construct a branded ID from a raw string.
 * Use at system boundaries (API input, DB reads). Everywhere else,
 * pass the branded type directly.
 */
export function makeId<T extends string>(raw: string): Brand<string, T> {
  return raw as Brand<string, T>;
}
