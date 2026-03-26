/**
 * Atherum Core — Multi-Tenancy Types
 *
 * Every Atherum operation is scoped to a workspace. Workspaces provide
 * data isolation, cost budgets, and brand context injection.
 */

import type { WorkspaceId } from "../ids";

export interface Workspace {
  id: WorkspaceId;
  /** External identifier — maps to IMAI org slug or other client's ID */
  externalId: string;
  name: string;
  /** Brand context injected into persona customization */
  brandContext: BrandContext;
  /** Cost tracking and budgets */
  billing: WorkspaceBilling;
  createdAt: Date;
}

export interface BrandContext {
  /** Brand name and description */
  brandName: string;
  brandDescription: string;
  /** Industry / vertical */
  industry: string;
  /** Target audience descriptions */
  targetAudiences: string[];
  /** Brand voice guidelines */
  voiceGuidelines?: string;
  /** Competitor names (for comparative analysis) */
  competitors?: string[];
  /** Any custom instructions for agent behavior */
  customInstructions?: string;
}

export interface WorkspaceBilling {
  /** Monthly budget in USD */
  monthlyBudgetUsd: number;
  /** Current month spend */
  currentMonthSpendUsd: number;
  /** Per-session default budget */
  defaultSessionBudgetUsd: number;
  /** Billing period reset day (1-28) */
  resetDayOfMonth: number;
}
