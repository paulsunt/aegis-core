import type { AgentId } from "./foundational.js";

/**
 * Controls which tools an agent may invoke.
 *
 * Resolution: explicit deny > explicit allow > inherited parent policy.
 * An empty `allow` array means NO tools permitted (not "all tools").
 * Use `["*"]` to allow all tools.
 */
export interface ToolPolicy {
  /** Tools this agent is permitted to use. `["*"]` = all. */
  readonly allow?: string[];
  /** Tools explicitly denied, overriding allow. */
  readonly deny?: string[];
}

/** The source that contributed a particular policy value. */
export interface ToolPolicySource {
  readonly origin: "agent-config" | "parent-grant" | "global-default";
  /** Human-readable config key path, e.g. "agents.myAgent.tools.allow" */
  readonly key: string;
}

/** Fully resolved policy with provenance tracking. */
export interface ToolPolicyResolved {
  readonly allow: string[];
  readonly deny: string[];
  readonly sources: {
    readonly allow: ToolPolicySource;
    readonly deny: ToolPolicySource;
  };
}

/**
 * Sandbox isolation level for an agent's execution environment.
 */
export type SandboxMode =
  /** No isolation. Agent runs in host process. Workspace path restrictions only. */
  | "none"
  /** Filesystem restricted to workspace directory. Network unrestricted. */
  | "workspace"
  /** Full container isolation (Docker). Ephemeral filesystem, host-only network. */
  | "container"
  /** Maximum restriction. Read-only workspace, no network, isolated process. */
  | "locked";

/** Filesystem access granted to the sandbox. */
export type WorkspaceAccess = "none" | "ro" | "rw";

/**
 * Complete sandbox configuration for an agent.
 */
export interface SandboxConfig {
  readonly mode: SandboxMode;
  readonly workspaceAccess: WorkspaceAccess;
  readonly workspaceRoot: string;
  /** Specific filesystem paths mounted into the sandbox (container mode). */
  readonly mounts?: ReadonlyArray<{
    readonly hostPath: string;
    readonly containerPath: string;
    readonly access: WorkspaceAccess;
  }>;
  /** Network restrictions (container mode). */
  readonly network?: {
    readonly mode: "none" | "host-only" | "full";
    readonly allowedHosts?: string[];
  };
  /** Docker-specific configuration (container mode only). */
  readonly docker?: {
    readonly image: string;
    readonly cpuLimit?: number;
    readonly memoryLimitMb?: number;
    readonly tmpfsSizeMb?: number;
  };
}

/**
 * Resource limits imposed on a spawned agent.
 */
export interface ResourceLimits {
  /** Maximum sub-agent spawn depth from this point. */
  readonly maxSpawnDepth: number;
  /** Maximum concurrent child agents. */
  readonly maxConcurrentChildren: number;
  /** Timeout for the agent's entire run, in milliseconds. */
  readonly runTimeoutMs: number;
  /** Maximum total tokens (input + output) the agent may consume. */
  readonly maxTokens?: number;
}

/**
 * The complete security context for an agent.
 * Assembled by the Security Policy Engine at spawn time.
 */
export interface SecurityContext {
  readonly toolPolicy: ToolPolicyResolved;
  readonly sandbox: SandboxConfig;
  readonly resourceLimits: ResourceLimits;
  /** The chain of agentIds from root to this agent (for audit). */
  readonly ancestorChain: ReadonlyArray<AgentId>;
}
