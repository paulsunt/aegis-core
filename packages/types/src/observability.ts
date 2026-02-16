import type { AgentId, SpanId, Timestamp, TraceId } from "./foundational.js";

/**
 * Attached to every AegisEvent. Enables distributed tracing across
 * agent → sub-agent → tool-call boundaries.
 *
 * Compatible with OpenTelemetry W3C Trace Context.
 */
export interface TraceContext {
  /** Unique per top-level user request. All descendant spans share this. */
  readonly traceId: TraceId;
  /** Unique per event/operation. */
  readonly spanId: SpanId;
  /** The span that caused this event. Absent for root spans. */
  readonly parentSpanId?: SpanId;
}

/** Structured log entry emitted by any component. */
export interface LogEntry {
  readonly timestamp: Timestamp;
  readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly message: string;
  readonly traceCtx?: TraceContext;
  readonly agentId?: AgentId;
  readonly data?: Record<string, unknown>;
}
