/**
 * Atherum Orchestrator — Workflow Base
 *
 * Products are implemented as workflows that compose engines.
 * This module provides the base workflow abstraction with:
 * - Step tracking and provenance
 * - Cost accumulation and budget enforcement
 * - Error handling with partial results
 * - Event emission for real-time streaming
 */

import type { WorkspaceId, SessionId } from "@atherum/core";
import type { Result } from "@atherum/core";

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export interface WorkflowStep<TInput, TOutput> {
  name: string;
  /** Human-readable description of what this step does */
  description: string;
  /** Which engine this step belongs to */
  engine: "mirage" | "atlas" | "scribe" | "oasis" | "personas" | "orchestrator";
  /** Execute the step */
  execute: (input: TInput, ctx: WorkflowContext) => Promise<Result<TOutput>>;
  /** Whether this step can be skipped on failure (graceful degradation) */
  optional?: boolean;
}

export interface WorkflowContext {
  workspaceId: WorkspaceId;
  sessionId: SessionId;
  /** Running cost accumulator */
  costUsd: number;
  /** Budget limit */
  budgetUsd: number;
  /** Add cost and check budget */
  addCost: (amount: number) => { exceeded: boolean; totalUsd: number };
  /** Emit an event for SSE streaming */
  emit: (event: string, data: unknown) => void;
  /** Record audit entry */
  audit: (event: string, payload: Record<string, unknown>) => Promise<void>;
  /** Abort signal — checked between steps */
  aborted: boolean;
}

// ---------------------------------------------------------------------------
// Workflow runner
// ---------------------------------------------------------------------------

export interface WorkflowResult<T> {
  /** Final output (may be partial if some steps failed) */
  output: T | null;
  /** Per-step results */
  steps: Array<{
    name: string;
    status: "completed" | "failed" | "skipped";
    durationMs: number;
    costUsd: number;
    error?: string;
  }>;
  totalCostUsd: number;
  totalDurationMs: number;
}

/**
 * Execute a linear workflow — steps run in sequence.
 * Each step's output is the next step's input.
 *
 * If a required step fails, the workflow stops and returns partial results.
 * If an optional step fails, it's skipped and the previous output passes through.
 */
export async function runWorkflow<T>(
  steps: Array<WorkflowStep<any, any>>,
  initialInput: unknown,
  ctx: WorkflowContext,
): Promise<WorkflowResult<T>> {
  const stepResults: WorkflowResult<T>["steps"] = [];
  const startTime = Date.now();
  let currentInput = initialInput;
  let lastOutput: unknown = null;

  for (const step of steps) {
    if (ctx.aborted) {
      stepResults.push({
        name: step.name,
        status: "skipped",
        durationMs: 0,
        costUsd: 0,
        error: "Workflow aborted",
      });
      continue;
    }

    const stepStart = Date.now();
    const costBefore = ctx.costUsd;

    ctx.emit("workflow.step.started", { step: step.name, engine: step.engine });
    await ctx.audit("workflow.step.started", {
      step: step.name,
      engine: step.engine,
    });

    const result = await step.execute(currentInput, ctx);
    const stepCost = ctx.costUsd - costBefore;
    const stepDuration = Date.now() - stepStart;

    if (result.ok) {
      lastOutput = result.value;
      currentInput = result.value; // chain output to next step's input

      stepResults.push({
        name: step.name,
        status: "completed",
        durationMs: stepDuration,
        costUsd: stepCost,
      });

      ctx.emit("workflow.step.completed", {
        step: step.name,
        durationMs: stepDuration,
        costUsd: stepCost,
      });
    } else {
      stepResults.push({
        name: step.name,
        status: "failed",
        durationMs: stepDuration,
        costUsd: stepCost,
        error: result.error.message,
      });

      ctx.emit("workflow.step.failed", {
        step: step.name,
        error: result.error.message,
      });

      if (!step.optional) {
        // Required step failed — stop workflow
        await ctx.audit("workflow.failed", {
          step: step.name,
          error: result.error.message,
        });
        break;
      }

      // Optional step failed — continue with previous output
      currentInput = lastOutput;
    }
  }

  return {
    output: lastOutput as T | null,
    steps: stepResults,
    totalCostUsd: ctx.costUsd,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Execute parallel workflows and merge results.
 * Used for products like War Room that run simulations in parallel.
 */
export async function runParallel<T>(
  branches: Array<{
    name: string;
    steps: Array<WorkflowStep<any, any>>;
    input: unknown;
  }>,
  ctx: WorkflowContext,
): Promise<Array<{ name: string; result: WorkflowResult<T> }>> {
  const results = await Promise.all(
    branches.map(async (branch) => ({
      name: branch.name,
      result: await runWorkflow<T>(branch.steps, branch.input, ctx),
    })),
  );
  return results;
}
