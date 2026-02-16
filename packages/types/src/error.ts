import type { AgentId, TraceId, SpanId } from "./foundational.js";
import type { TraceContext } from "./observability.js";

/**
 * Base error class for all Aegis errors.
 * Uses discriminated union pattern for exhaustive error handling.
 */
export type AegisErrorCode =
  | "POLICY_VIOLATION"      // Tool/sandbox policy check failed
  | "SPAWN_DEPTH_EXCEEDED"  // Max recursive depth reached
  | "SPAWN_LIMIT_EXCEEDED"  // Max concurrent children reached
  | "TIMEOUT"               // Operation exceeded time limit
  | "SANDBOX_ERROR"         // Container/sandbox setup or execution failure
  | "SKILL_NOT_FOUND"       // Requested skill does not exist
  | "SKILL_LOAD_ERROR"      // Skill YAML/Markdown parsing failure
  | "AGENT_NOT_FOUND"       // Referenced agent does not exist
  | "SESSION_NOT_FOUND"     // Referenced session does not exist
  | "TOOL_NOT_FOUND"        // Tool name not recognized
  | "TOOL_EXECUTION_ERROR"  // Tool ran but returned an error
  | "INTERNAL_ERROR";       // Unexpected system failure

export interface AegisError {
  readonly code: AegisErrorCode;
  readonly message: string;
  readonly traceCtx?: TraceContext;
  readonly agentId?: AgentId;
  /** The original error, if wrapping a lower-level failure. */
  readonly cause?: unknown;
}
