import Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";
import type {
  SessionStore,
  Session,
  SessionId,
  AgentId,
  Timestamp,
  ConversationMessage,
} from "@aegis/types";

/**
 * SQLite-backed implementation of SessionStore.
 *
 * Uses an append-only `events` table as the source of truth for
 * conversation history, and a `sessions` table for metadata.
 *
 * Design: history is reconstructed from the events ledger on load,
 * making this crash-recoverable by design.
 */
export class SQLiteSessionStore implements SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  /** Run schema migrations. Idempotent. */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'active',
        depth       INTEGER NOT NULL DEFAULT 0,
        parent_session_id TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        tool_call_id TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_session
        ON events(session_id, timestamp);
    `);
  }

  async create(
    agentId: AgentId,
    parentSessionId?: SessionId
  ): Promise<Session> {
    const id = uuidv7() as SessionId;
    const now = new Date().toISOString() as Timestamp;
    const depth = parentSessionId ? await this.getDepth(parentSessionId) + 1 : 0;

    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, status, depth, parent_session_id, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?)
    `).run(id, agentId, depth, parentSessionId ?? null, now, now);

    return {
      id,
      agentId,
      createdAt: now,
      lastActiveAt: now,
      parentSessionId,
      depth,
      history: [],
    };
  }

  async get(id: SessionId): Promise<Session | undefined> {
    const row = this.db.prepare(
      "SELECT * FROM sessions WHERE id = ?"
    ).get(id) as SessionRow | undefined;

    if (!row) return undefined;

    const events = this.db.prepare(
      "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(id) as EventRow[];

    const history: ConversationMessage[] = events.map((e) => ({
      role: e.role as ConversationMessage["role"],
      content: e.content,
      timestamp: e.timestamp as Timestamp,
      toolCallId: e.tool_call_id ?? undefined,
    }));

    return {
      id: row.id as SessionId,
      agentId: row.agent_id as AgentId,
      createdAt: row.created_at as Timestamp,
      lastActiveAt: row.updated_at as Timestamp,
      parentSessionId: row.parent_session_id
        ? (row.parent_session_id as SessionId)
        : undefined,
      depth: row.depth,
      history,
    };
  }

  async update(
    id: SessionId,
    patch: Partial<Pick<Session, "lastActiveAt" | "history">>
  ): Promise<void> {
    const now = new Date().toISOString();

    if (patch.lastActiveAt) {
      this.db.prepare(
        "UPDATE sessions SET updated_at = ? WHERE id = ?"
      ).run(patch.lastActiveAt, id);
    } else {
      this.db.prepare(
        "UPDATE sessions SET updated_at = ? WHERE id = ?"
      ).run(now, id);
    }

    // The interface says `history` is the full array.
    // We diff against existing events to find new ones.
    if (patch.history && patch.history.length > 0) {
      const existingCount = (
        this.db.prepare(
          "SELECT COUNT(*) as cnt FROM events WHERE session_id = ?"
        ).get(id) as { cnt: number }
      ).cnt;

      const newMessages = patch.history.slice(existingCount);
      const insert = this.db.prepare(`
        INSERT INTO events (id, session_id, role, content, timestamp, tool_call_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction(
        (msgs: ConversationMessage[]) => {
          for (const msg of msgs) {
            insert.run(
              uuidv7(),
              id,
              msg.role,
              msg.content,
              msg.timestamp,
              msg.toolCallId ?? null
            );
          }
        }
      );

      insertMany(newMessages);
    }
  }

  async delete(id: SessionId): Promise<void> {
    this.db.prepare("DELETE FROM events WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  async listByAgent(agentId: AgentId): Promise<Session[]> {
    const rows = this.db.prepare(
      "SELECT * FROM sessions WHERE agent_id = ? ORDER BY created_at DESC"
    ).all(agentId) as SessionRow[];

    const sessions: Session[] = [];
    for (const row of rows) {
      const session = await this.get(row.id as SessionId);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  private async getDepth(sessionId: SessionId): Promise<number> {
    const row = this.db.prepare(
      "SELECT depth FROM sessions WHERE id = ?"
    ).get(sessionId) as { depth: number } | undefined;
    return row?.depth ?? 0;
  }
}

// ─── Internal row types ─────────────────────────────────────────────

interface SessionRow {
  id: string;
  agent_id: string;
  status: string;
  depth: number;
  parent_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  tool_call_id: string | null;
}
