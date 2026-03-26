/**
 * OASIS Bridge — TypeScript Client for the Python OASIS Worker
 *
 * The OASIS worker runs CAMEL-AI's OASIS framework as a separate Python process.
 * This bridge provides a typed client with circuit breaker, retry, and health checks.
 *
 * Communication: HTTP (not IPC). The Python worker exposes a FastAPI server.
 * This keeps the interface language-agnostic and allows the worker to run
 * in a separate container.
 *
 * Trade-off: HTTP adds ~1ms latency per call. For simulations that run for
 * minutes, this is negligible. The benefit is operational simplicity — the
 * Python worker is a standard HTTP service that can be scaled, monitored,
 * and replaced independently.
 */

import type {
  SimulationRequest,
  SimulationResult,
  SimulationProgress,
} from "@atherum/core";
import type { Result } from "@atherum/core";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OasisBridgeConfig {
  /** Base URL of the OASIS worker, e.g. "http://localhost:8100" */
  baseUrl: string;
  /** Request timeout in ms (default: 30000 for start, progress is streamed) */
  timeoutMs: number;
  /** Circuit breaker: consecutive failures before opening circuit */
  circuitBreakerThreshold: number;
  /** Circuit breaker: cooldown period in ms before half-open */
  circuitBreakerCooldownMs: number;
  /** Retry: max attempts for transient failures */
  maxRetries: number;
  /** Retry: base delay in ms (exponential backoff) */
  retryBaseDelayMs: number;
}

const DEFAULT_CONFIG: OasisBridgeConfig = {
  baseUrl: "http://localhost:8100",
  timeoutMs: 30_000,
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownMs: 60_000,
  maxRetries: 3,
  retryBaseDelayMs: 1_000,
};

// ---------------------------------------------------------------------------
// Circuit breaker state
// ---------------------------------------------------------------------------

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class OasisBridgeClient {
  private config: OasisBridgeConfig;
  private circuit: CircuitBreaker;

  constructor(config: Partial<OasisBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuit = {
      state: "CLOSED",
      failureCount: 0,
      lastFailureAt: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start a new simulation on the OASIS worker.
   * Returns immediately with a simulation ID. Use `streamProgress` to follow.
   */
  async startSimulation(
    request: SimulationRequest,
  ): Promise<Result<{ simulationId: string; accepted: boolean }>> {
    return this.post("/api/v1/simulations", request);
  }

  /**
   * Get simulation result (blocks until done or polls).
   */
  async getResult(simulationId: string): Promise<Result<SimulationResult>> {
    return this.get(`/api/v1/simulations/${simulationId}/result`);
  }

  /**
   * Stream progress events via SSE.
   * Returns an async iterator of SimulationProgress events.
   */
  async *streamProgress(
    simulationId: string,
  ): AsyncGenerator<SimulationProgress> {
    const url = `${this.config.baseUrl}/api/v1/simulations/${simulationId}/stream`;

    // In production, this would use EventSource or fetch with ReadableStream.
    // Skeleton implementation — actual SSE parsing would go here.
    const response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
    });

    if (!response.ok || !response.body) {
      throw new Error(`OASIS stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // last element may be incomplete

      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (dataLine) {
          const data = JSON.parse(dataLine.slice(6));
          yield data as SimulationProgress;
        }
      }
    }
  }

  /**
   * Stop a running simulation.
   */
  async stopSimulation(simulationId: string): Promise<Result<void>> {
    return this.post(`/api/v1/simulations/${simulationId}/stop`, {});
  }

  /**
   * Health check — is the OASIS worker reachable?
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // -------------------------------------------------------------------------
  // Internal HTTP + circuit breaker + retry
  // -------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<Result<T>> {
    return this.request("POST", path, body);
  }

  private async get<T>(path: string): Promise<Result<T>> {
    return this.request("GET", path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T>> {
    // Circuit breaker check
    if (this.circuit.state === "OPEN") {
      const elapsed = Date.now() - this.circuit.lastFailureAt;
      if (elapsed < this.config.circuitBreakerCooldownMs) {
        return {
          ok: false,
          error: {
            code: "OASIS_WORKER_ERROR" as const,
            engine: "oasis" as const,
            message: "Circuit breaker OPEN — OASIS worker unavailable",
            reason: "unreachable" as const,
          },
        };
      }
      // Try half-open
      this.circuit.state = "HALF_OPEN";
    }

    // Retry loop with exponential backoff
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (response.ok) {
          this.onSuccess();
          const data = await response.json();
          return { ok: true, value: data as T };
        }

        // Non-retryable HTTP errors
        if (response.status >= 400 && response.status < 500) {
          const errorBody = await response.text();
          return {
            ok: false,
            error: {
              code: "OASIS_WORKER_ERROR" as const,
              engine: "oasis" as const,
              message: `OASIS worker returned ${response.status}: ${errorBody}`,
              reason: "internal-error" as const,
              httpStatus: response.status,
            },
          };
        }

        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err;
      }

      // Backoff before retry (skip on last attempt)
      if (attempt < this.config.maxRetries) {
        const delay =
          this.config.retryBaseDelayMs * Math.pow(2, attempt) +
          Math.random() * 500; // jitter
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries failed
    this.onFailure();
    return {
      ok: false,
      error: {
        code: "OASIS_WORKER_ERROR" as const,
        engine: "oasis" as const,
        message: `OASIS worker unreachable after ${this.config.maxRetries + 1} attempts: ${lastError}`,
        reason: "unreachable" as const,
      },
    };
  }

  private onSuccess(): void {
    this.circuit.state = "CLOSED";
    this.circuit.failureCount = 0;
  }

  private onFailure(): void {
    this.circuit.failureCount++;
    this.circuit.lastFailureAt = Date.now();
    if (this.circuit.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuit.state = "OPEN";
    }
  }
}
