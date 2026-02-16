import type { AgentId, RunId, SessionId } from "./foundational.js";
import type { TraceContext } from "./observability.js";
import type { AgentConfig } from "./agent.js";
import type { ToolPolicy, SandboxConfig } from "./security.js";

/**
 * Request to spawn a child agent.
 * Emitted by a parent agent via the Gateway.
 */
export interface SpawnRequest {
  readonly parentAgentId: AgentId;
  readonly parentSessionId: SessionId;
  readonly traceCtx: TraceContext;
  /** The task description for the child agent. */
  readonly task: string;
  /** Configuration for the child agent. Merged with defaults. */
  readonly childConfig: Partial<AgentConfig>;
  /**
   * Tool policy grant for the child.
   * Must be a subset of the parent's resolved policy (capability attenuation).
   */
  readonly toolPolicyGrant?: ToolPolicy;
  /** Sandbox override for the child. Defaults to parent's sandbox or stricter. */
  readonly sandboxOverride?: Partial<SandboxConfig>;
  /** What to do with the child's workspace after completion. */
  readonly cleanup: "delete" | "keep";
  /** Optional human-readable label for logging/tracing. */
  readonly label?: string;
  /** Timeout override for this specific child run. */
  readonly runTimeoutMs?: number;
}

/**
 * Handle returned to the parent after a successful spawn.
 * Used to monitor and control the child agent's lifecycle.
 */
export interface SpawnHandle {
  readonly runId: RunId;
  readonly childAgentId: AgentId;
  readonly childSessionId: SessionId;

  /**
   * Wait for the child to complete.
   * Resolves with the child's final output or rejects on timeout/error.
   */
  wait(timeoutMs?: number): Promise<SpawnResult>;

  /** Terminate the child agent immediately. */
  kill(reason?: string): Promise<void>;

  /** Check if the child is still running. */
  isActive(): boolean;
}

/**
 * The result of a completed child agent run.
 */
export interface SpawnResult {
  readonly runId: RunId;
  readonly childAgentId: AgentId;
  readonly outcome: SpawnOutcome;
  /** The child's final output message. */
  readonly result?: string;
  /** Error details if outcome is "error". */
  readonly error?: string;
  /** Total run duration in milliseconds. */
  readonly durationMs: number;
}

export type SpawnOutcome =
  | "completed"     // Normal completion
  | "error"         // Unrecoverable error
  | "timeout"       // Exceeded run timeout
  | "killed"        // Terminated by parent or system
  | "depth-limit";  // Exceeded max spawn depth
