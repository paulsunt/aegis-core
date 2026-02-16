import type { AgentId, SessionId, Timestamp, SkillId } from "./foundational.js";
import type { TraceContext, LogEntry } from "./observability.js";
import type { SecurityContext, ToolPolicy, SandboxConfig, ResourceLimits } from "./security.js";
import type { SkillMetadata, SkillRegistry } from "./skill.js";
import type { EventBus, EventTopic } from "./event-bus.js";
import type { ToolCallRequest, ToolCallResult } from "./tool.js";
import type { SpawnRequest, SpawnHandle } from "./spawn.js";

/**
 * Configuration for instantiating an agent.
 */
export interface AgentConfig {
  readonly id: AgentId;
  readonly name: string;
  /** The system prompt / persona instructions for this agent. */
  readonly systemPrompt: string;
  /** Model identifier (e.g. "claude-3.5-sonnet", "gpt-4o"). */
  readonly model: string;
  /** Tool policy (may be further restricted by parent at spawn time). */
  readonly toolPolicy: ToolPolicy;
  /** Sandbox defaults for this agent. */
  readonly sandbox: Partial<SandboxConfig>;
  /** Resource limits. */
  readonly resourceLimits: Partial<ResourceLimits>;
  /** Skill IDs this agent is pre-authorized to use. Empty = discover on demand. */
  readonly preloadedSkills?: SkillId[];
}

/**
 * Represents a single "turn" delivered to an agent.
 * This is the input an agent receives from the Gateway.
 */
export interface AgentTurn {
  readonly sessionId: SessionId;
  readonly traceCtx: TraceContext;
  readonly securityCtx: SecurityContext;
  /** The message or task description. */
  readonly message: string;
  /** Conversation history within this session (not cross-session). */
  readonly history: ReadonlyArray<ConversationMessage>;
  /** Skills available to this agent (L1 metadata only). */
  readonly availableSkills: ReadonlyArray<SkillMetadata>;
}

/** A single message in the conversation history. */
export interface ConversationMessage {
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string;
  readonly timestamp: Timestamp;
  /** If role is "tool", the tool call that produced this message. */
  readonly toolCallId?: string;
}

/**
 * The core Agent interface.
 *
 * Every agent — including the Orchestrator — implements this contract.
 * The Gateway interacts with agents exclusively through this interface.
 *
 * Agents are passive: they receive turns and emit events.
 * They do not call each other directly.
 */
export interface Agent {
  readonly id: AgentId;
  readonly config: AgentConfig;

  /**
   * Called once when the agent is first created.
   * Use for one-time initialization (loading persisted state, etc.).
   */
  initialize(ctx: AgentInitContext): Promise<void>;

  /**
   * Process a single turn.
   *
   * The agent may:
   * - Emit tool calls via `ctx.callTool()`
   * - Spawn sub-agents via `ctx.spawn()`
   * - Discover/load skills via `ctx.skills`
   * - Stream intermediate output via `ctx.emit()`
   *
   * The agent MUST return a final `AgentResponse` when done.
   */
  handleTurn(turn: AgentTurn, ctx: AgentTurnContext): Promise<AgentResponse>;

  /**
   * Called when the agent is being shut down.
   * Use for cleanup (persisting state, releasing resources).
   */
  shutdown(): Promise<void>;
}

/**
 * Context provided during agent initialization.
 */
export interface AgentInitContext {
  readonly bus: EventBus;
  readonly skills: SkillRegistry;
  readonly log: (entry: Omit<LogEntry, "timestamp" | "agentId">) => void;
}

/**
 * Context provided during a turn.
 * This is the agent's interface to the outside world.
 */
export interface AgentTurnContext {
  /** Execute a tool call. Blocks until the tool completes. */
  callTool(request: Omit<ToolCallRequest, "agentId" | "sessionId" | "traceCtx">): Promise<ToolCallResult>;

  /** Spawn a child agent. Returns a handle for lifecycle management. */
  spawn(request: Omit<SpawnRequest, "parentAgentId" | "parentSessionId" | "traceCtx">): Promise<SpawnHandle>;

  /** Skill discovery and loading. */
  readonly skills: SkillRegistry;

  /** Emit an intermediate event (e.g., streaming partial output). */
  emit<T>(topic: EventTopic, payload: T): Promise<void>;

  /** Structured logging bound to this turn's trace context. */
  readonly log: (entry: Omit<LogEntry, "timestamp" | "agentId" | "traceCtx">) => void;

  /** The resolved security context for this turn. */
  readonly security: SecurityContext;
}

/**
 * The final response from an agent after processing a turn.
 */
export interface AgentResponse {
  /** The agent's final message/output. */
  readonly message: string;
  /** Structured data to pass to the parent or user. */
  readonly data?: Record<string, unknown>;
  /** Whether the agent wants to continue the conversation. */
  readonly expectsFollowUp: boolean;
}
