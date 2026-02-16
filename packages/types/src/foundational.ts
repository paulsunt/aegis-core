/** Branded opaque identifier types for compile-time safety. */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type AgentId = Brand<string, "AgentId">;
export type SessionId = Brand<string, "SessionId">;
export type TraceId = Brand<string, "TraceId">;
export type SpanId = Brand<string, "SpanId">;
export type SkillId = Brand<string, "SkillId">;
export type EventId = Brand<string, "EventId">;
export type RunId = Brand<string, "RunId">;

/** ISO 8601 timestamp. */
export type Timestamp = string;
