import type { AgentId, SessionId } from "./foundational.js";
import type { TraceContext } from "./observability.js";

/**
 * A tool call request emitted by an agent.
 * The Gateway intercepts this, checks it against the ToolPolicy,
 * and executes it in the appropriate sandbox.
 */
export interface ToolCallRequest {
  readonly callId: string;
  readonly agentId: AgentId;
  readonly sessionId: SessionId;
  readonly traceCtx: TraceContext;
  /** Tool name, e.g. "exec", "read_file", "write_file". */
  readonly tool: string;
  /** Tool-specific arguments. */
  readonly args: Record<string, unknown>;
}

/**
 * The result of a tool call, sent back to the requesting agent.
 */
export interface ToolCallResult {
  readonly callId: string;
  readonly agentId: AgentId;
  readonly sessionId: SessionId;
  readonly traceCtx: TraceContext;
  /** Whether the tool executed successfully. */
  readonly success: boolean;
  /** Tool output (stdout, file content, etc.). */
  readonly output?: string;
  /** Error message if `success` is false. */
  readonly error?: string;
  /** Execution duration in milliseconds. */
  readonly durationMs: number;
}
