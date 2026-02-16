import type { SessionId } from "./foundational.js";
import type { SecurityContext, ToolPolicy, SandboxConfig, ResourceLimits } from "./security.js";
import type { EventBus } from "./event-bus.js";
import type { AgentConfig, AgentResponse } from "./agent.js";
import type { SkillRegistry } from "./skill.js";

/**
 * The Gateway is the entry point for all external requests.
 * It wraps the EventBus with security enforcement, agent lifecycle
 * management, and tracing.
 */
export interface Gateway {
  /** Start the gateway (bind HTTP, initialize agents, index skills). */
  start(config: GatewayConfig): Promise<void>;

  /** Graceful shutdown. */
  stop(): Promise<void>;

  /** Submit a user message and get the final response. */
  handleMessage(message: string, sessionId?: SessionId): Promise<AgentResponse>;

  /** Access the underlying event bus (for advanced integrations). */
  readonly bus: EventBus;

  /** Access registered agents. */
  readonly agents: AgentRegistry;

  /** Access the skill registry. */
  readonly skills: SkillRegistry;
}

export interface GatewayConfig {
  /** HTTP bind address. Default: "127.0.0.1" (loopback only). */
  readonly bind: string;
  readonly port: number;
  /** Directories to scan for skills. */
  readonly skillDirs: string[];
  /** Agent configurations. */
  readonly agents: AgentConfig[];
  /** Global security defaults. */
  readonly security: {
    readonly defaultToolPolicy: ToolPolicy;
    readonly defaultSandbox: SandboxConfig;
    readonly defaultResourceLimits: ResourceLimits;
    /** Maximum spawn depth for the entire system. */
    readonly maxSpawnDepth: number;
  };
  /** Tracing configuration. */
  readonly tracing: {
    readonly enabled: boolean;
    /** Export destination. "console" | "otlp" | "file" */
    readonly exporter: string;
    readonly endpoint?: string;
  };
}

/**
 * Manages the lifecycle of registered agents.
 */
export interface AgentRegistry {
  register(agent: AgentConfig): Promise<void>; // NOTE: AgentConfig or Agent instance? Interface said Agent but generic Agent interface is complex. Keeping generic for now.
  unregister(agentId: string): Promise<void>;
  get(agentId: string): unknown | undefined;
  list(): unknown[];
}
