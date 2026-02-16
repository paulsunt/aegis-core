import type { AgentId, SessionId, Timestamp } from "./foundational.js";
import type { ConversationMessage } from "./agent.js";

/**
 * Represents an ongoing conversation session between a user/parent
 * and an agent.
 */
export interface Session {
  readonly id: SessionId;
  readonly agentId: AgentId;
  readonly createdAt: Timestamp;
  readonly lastActiveAt: Timestamp;
  /** Parent session if this is a sub-agent session. */
  readonly parentSessionId?: SessionId;
  /** Spawn depth (0 = root). */
  readonly depth: number;
  readonly history: ConversationMessage[];
}

export interface SessionStore {
  create(agentId: AgentId, parentSessionId?: SessionId): Promise<Session>;
  get(id: SessionId): Promise<Session | undefined>;
  update(id: SessionId, patch: Partial<Pick<Session, "lastActiveAt" | "history">>): Promise<void>;
  delete(id: SessionId): Promise<void>;
  listByAgent(agentId: AgentId): Promise<Session[]>;
}
