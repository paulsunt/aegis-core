import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { v7 as uuidv7 } from "uuid";

import { InMemoryEventBus, createEvent, createTraceContext } from "@aegis/core";
import {
  AgentLoop,
  MockModelAdapter,
  type NativeToolRegistry,
} from "@aegis/runtime";
import { FileSystemSkillRegistry } from "@aegis/skills";
import { SQLiteSessionStore } from "@aegis/persistence";
import type { AgentId, AgentConfig, AegisEvent, SessionId } from "@aegis/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("State Recovery (Amnesia Test)", () => {
  let dbPath: string;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-amnesia-"));
    dbPath = path.join(tmpDir, "aegis.db");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Creates a full agent stack: bus, skills, agent loop with persistence.
   * Returns helpers to send messages and wait for replies.
   */
  function createAgentStack(store: SQLiteSessionStore) {
    const bus = new InMemoryEventBus();
    const skills = new FileSystemSkillRegistry();
    const nativeTools: NativeToolRegistry = {
      get() {
        return undefined;
      },
    };

    const config: AgentConfig = {
      id: "agent-logan" as AgentId,
      name: "LoganAgent",
      systemPrompt: "You are a helpful assistant.",
      model: "mock",
      toolPolicy: { allow: [] },
      sandbox: {},
      resourceLimits: {},
    };

    const agent = new AgentLoop({
      bus,
      model: new MockModelAdapter(),
      skills,
      config,
      nativeTools,
      sessionStore: store,
    });

    return { bus, agent, config };
  }

  /**
   * Send a message to the agent and wait for the reply.
   */
  async function sendAndWait(
    bus: InMemoryEventBus,
    message: string,
    agentId: string,
    sessionId: string
  ): Promise<string> {
    const trace = createTraceContext();

    const replyPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Agent timed out")),
        5000
      );
      bus.subscribe({ topics: ["agent.complete"] }, (event: AegisEvent) => {
        clearTimeout(timeout);
        resolve((event.payload as { message: string }).message);
      });
    });

    const turnEvent = createEvent(
      "agent.turn",
      { message, sessionId },
      trace,
      undefined,
      agentId
    );
    await bus.publish(turnEvent);

    return replyPromise;
  }

  it("should remember user name across gateway restarts", async () => {
    // === PHASE 1: First Gateway instance ===
    const store1 = new SQLiteSessionStore(dbPath);
    const session = await store1.create("agent-logan" as AgentId);
    const sessionId = session.id;

    const { bus: bus1, agent: agent1 } = createAgentStack(store1);
    await skills_index_and_start(agent1);

    // Send "My name is Logan"
    const reply1 = await sendAndWait(
      bus1,
      "My name is Logan",
      "agent-logan",
      sessionId
    );
    expect(reply1).toBe("Hello Logan");

    // Verify session was persisted
    const savedSession = await store1.get(sessionId);
    expect(savedSession).toBeDefined();
    expect(savedSession!.history.length).toBeGreaterThan(0);

    // === SIMULATE CRASH: Close store, destroy bus ===
    store1.close();

    // === PHASE 2: New Gateway instance, same DB ===
    const store2 = new SQLiteSessionStore(dbPath);
    const { bus: bus2, agent: agent2 } = createAgentStack(store2);
    await skills_index_and_start(agent2);

    // Send "What is my name?" with the SAME sessionId
    const reply2 = await sendAndWait(
      bus2,
      "What is my name?",
      "agent-logan",
      sessionId
    );
    expect(reply2).toBe("Your name is Logan");

    store2.close();
  });

  /** Helper to initialize skills and start the agent */
  async function skills_index_and_start(agent: AgentLoop) {
    // FileSystemSkillRegistry needs index() before use
    const skills = new FileSystemSkillRegistry();
    await skills.index([]);
    await agent.start();
  }
});
