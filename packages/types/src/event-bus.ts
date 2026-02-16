import type { AgentId, EventId, Timestamp } from "./foundational.js";
import type { TraceContext } from "./observability.js";

/**
 * Every message flowing through the Gateway is an `AegisEvent`.
 * Events are the universal communication primitive.
 *
 * @typeParam T - The topic-specific payload type.
 */
export interface AegisEvent<T = unknown> {
  readonly id: EventId;
  readonly topic: EventTopic;
  readonly payload: T;
  readonly traceCtx: TraceContext;
  readonly timestamp: Timestamp;
  /** Source agent. Absent for system/external events. */
  readonly sourceAgentId?: AgentId;
  /** Target agent. Absent for broadcast events. */
  readonly targetAgentId?: AgentId;
}

/**
 * Enumerated event topics.
 * Using a string union rather than a numeric enum for debuggability.
 */
export type EventTopic =
  // Lifecycle
  | "agent.turn"
  | "agent.complete"
  | "agent.error"
  // Tool calls
  | "tool.request"
  | "tool.result"
  // Sub-agent management
  | "spawn.request"
  | "spawn.started"
  | "spawn.complete"
  | "spawn.failed"
  | "spawn.timeout"
  // Skill system
  | "skill.discover"
  | "skill.discover.result"
  | "skill.load"
  | "skill.load.result"
  // System
  | "system.shutdown"
  | "system.health"
  | "system.policy.violation";

/**
 * Predicate for filtering which events a subscriber receives.
 */
export interface EventFilter {
  /** Match specific topics. If empty, matches all topics. */
  readonly topics?: EventTopic[];
  /** Only events originating from this agent. */
  readonly sourceAgentId?: AgentId;
  /** Only events targeted at this agent. */
  readonly targetAgentId?: AgentId;
  /** Custom predicate for advanced filtering. */
  readonly predicate?: (event: AegisEvent) => boolean;
}

/** Callback signature for event subscribers. */
export type EventHandler<T = unknown> = (event: AegisEvent<T>) => void | Promise<void>;

/** Returned when subscribing; used to unsubscribe. */
export interface Subscription {
  readonly id: string;
  unsubscribe(): void;
}

/**
 * The Event Bus interface — the heart of the Gateway.
 *
 * All inter-component communication flows through this bus.
 * The Gateway wraps this with security enforcement and tracing.
 */
export interface EventBus {
  /** Publish an event to all matching subscribers. */
  publish<T>(event: AegisEvent<T>): Promise<void>;

  /** Subscribe to events matching the filter. */
  subscribe<T>(filter: EventFilter, handler: EventHandler<T>): Subscription;

  /** Publish and wait for a single response event matching the reply filter. */
  request<TReq, TRes>(
    event: AegisEvent<TReq>,
    replyFilter: EventFilter,
    timeoutMs: number,
  ): Promise<AegisEvent<TRes>>;
}
