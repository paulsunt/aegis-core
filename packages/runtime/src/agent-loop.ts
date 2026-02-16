import { v7 as uuidv7 } from "uuid";
import type {
  EventBus,
  AegisEvent,
  AgentConfig,
  SkillRegistry,
  TraceContext,
  SessionStore,
  Session,
  SessionId,
  ConversationMessage,
  Timestamp,
  EventId,
  SpanId,
} from "@aegis/types";
import type { ModelAdapter, ChatMessage } from "./model-adapter.js";
import { buildSystemPrompt } from "./prompt-builder.js";

/** A registry of native tool implementations. */
export interface NativeToolRegistry {
  get(toolName: string): NativeTool | undefined;
}

export interface NativeTool {
  execute(args: Record<string, unknown>): Promise<string>;
}

/**
 * Options for AgentLoop construction.
 * SessionStore is optional — without it the agent is ephemeral (Phase 3 behavior).
 */
export interface AgentLoopOptions {
  bus: EventBus;
  model: ModelAdapter;
  skills: SkillRegistry;
  config: AgentConfig;
  nativeTools: NativeToolRegistry;
  /** If provided, enables persistence across restarts. */
  sessionStore?: SessionStore;
}

/**
 * The core agent loop.
 *
 * Subscribes to events on the bus, runs the think→tool→think cycle,
 * and publishes results back onto the bus.
 *
 * When a SessionStore is provided, history is persisted after each message,
 * and hydrated from the store on subsequent turns with the same sessionId.
 */
export class AgentLoop {
  private history: ChatMessage[] = [];
  private readonly bus: EventBus;
  private readonly model: ModelAdapter;
  private readonly skills: SkillRegistry;
  private readonly config: AgentConfig;
  private readonly nativeTools: NativeToolRegistry;
  private readonly sessionStore?: SessionStore;
  private currentSessionId?: SessionId;

  /**
   * @param optsOrBus - Either an AgentLoopOptions object (new API) or EventBus (legacy Phase 3 API)
   */
  constructor(opts: AgentLoopOptions);
  /** @deprecated Use options object constructor. Backward-compatible for Phase 3 tests. */
  constructor(
    bus: EventBus,
    model: ModelAdapter,
    skills: SkillRegistry,
    config: AgentConfig,
    nativeTools: NativeToolRegistry
  );
  constructor(
    optsOrBus: AgentLoopOptions | EventBus,
    model?: ModelAdapter,
    skills?: SkillRegistry,
    config?: AgentConfig,
    nativeTools?: NativeToolRegistry
  ) {
    if ("bus" in optsOrBus && "model" in optsOrBus) {
      // Options object constructor
      const opts = optsOrBus as AgentLoopOptions;
      this.bus = opts.bus;
      this.model = opts.model;
      this.skills = opts.skills;
      this.config = opts.config;
      this.nativeTools = opts.nativeTools;
      this.sessionStore = opts.sessionStore;
    } else {
      // Legacy positional constructor
      this.bus = optsOrBus as EventBus;
      this.model = model!;
      this.skills = skills!;
      this.config = config!;
      this.nativeTools = nativeTools!;
    }
  }

  /** Start listening for agent.turn events targeted at this agent. */
  async start(): Promise<void> {
    // Build system prompt from skills
    const allSkills = this.skills.listAll();
    const systemPrompt = buildSystemPrompt(this.config, allSkills);
    this.history.push({ role: "system", content: systemPrompt });

    // Subscribe to turns
    this.bus.subscribe(
      { topics: ["agent.turn"], targetAgentId: this.config.id },
      async (event: AegisEvent) => {
        try {
          const payload = event.payload as {
            message: string;
            sessionId?: string;
          };
          await this.handleTurn(
            payload.message,
            event.traceCtx,
            payload.sessionId as SessionId | undefined
          );
        } catch (err) {
          console.error(`[AgentLoop] Error in handleTurn:`, err);
          // Publish error event so callers aren't left hanging
          await this.bus.publish(
            this.createEvent("agent.error", { error: String(err) }, event.traceCtx)
          );
        }
      }
    );

    console.log(`[AgentLoop] Agent "${this.config.name}" started.`);
  }

  private async handleTurn(
    message: string,
    trace: TraceContext,
    sessionId?: SessionId
  ): Promise<void> {
    // Hydrate from store if available and this is a new session for this agent
    if (this.sessionStore && sessionId) {
      await this.hydrateFromSession(sessionId);
      this.currentSessionId = sessionId;
    }

    this.history.push({ role: "user", content: message });
    await this.persistMessage({ role: "user", content: message });
    await this.runLoop(trace);
  }

  /**
   * Load conversation history from SessionStore and prepend to internal history.
   * Only hydrates if we haven't already loaded this session.
   */
  private async hydrateFromSession(sessionId: SessionId): Promise<void> {
    if (this.currentSessionId === sessionId) return; // Already hydrated

    const session = await this.sessionStore!.get(sessionId);
    if (!session || session.history.length === 0) return;

    // Convert ConversationMessage[] → ChatMessage[]
    // Keep the system prompt (history[0]) and append stored history before current messages
    const systemPrompt = this.history[0]; // Always exists (set in start())
    const storedMessages: ChatMessage[] = session.history.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCallId: msg.toolCallId,
    }));

    this.history = [systemPrompt, ...storedMessages];
  }

  /** Persist a message to the SessionStore if available. */
  private async persistMessage(
    msg: { role: ConversationMessage["role"]; content: string; toolCallId?: string }
  ): Promise<void> {
    if (!this.sessionStore || !this.currentSessionId) return;

    const session = await this.sessionStore.get(this.currentSessionId);
    if (!session) return;

    const conversationMsg: ConversationMessage = {
      role: msg.role,
      content: msg.content,
      timestamp: new Date().toISOString() as Timestamp,
      toolCallId: msg.toolCallId,
    };

    await this.sessionStore.update(this.currentSessionId, {
      history: [...session.history, conversationMsg],
    });
  }

  private async runLoop(trace: TraceContext): Promise<void> {
    const MAX_ITERATIONS = 10;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await this.model.generate(this.history);

      // Handle text output
      if (result.text) {
        this.history.push({ role: "assistant", content: result.text });
        await this.persistMessage({ role: "assistant", content: result.text });
      }

      // If no tool calls → done, publish final message
      if (!result.toolCalls || result.toolCalls.length === 0) {
        await this.bus.publish(
          this.createEvent("agent.complete", { message: result.text }, trace)
        );
        return;
      }

      // Handle tool calls
      this.history.push({
        role: "assistant",
        content: "",
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const output = await this.executeTool(call.name, call.arguments);
        this.history.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: typeof output === "string" ? output : JSON.stringify(output),
        });
        await this.persistMessage({
          role: "tool",
          content:
            typeof output === "string" ? output : JSON.stringify(output),
          toolCallId: call.id,
        });
      }
      // Loop continues so model can see tool results
    }

    // If we hit max iterations, publish error
    await this.bus.publish(
      this.createEvent("agent.error", { error: "Max iterations reached" }, trace)
    );
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const tool = this.nativeTools.get(name);
    if (!tool) {
      return `Error: Tool "${name}" not found`;
    }
    try {
      return await tool.execute(args);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }

  private createEvent<T>(
    topic: "agent.complete" | "agent.error",
    payload: T,
    trace: TraceContext
  ): AegisEvent<T> {
    return {
      id: uuidv7() as EventId,
      topic,
      payload,
      traceCtx: {
        traceId: trace.traceId,
        spanId: uuidv7() as SpanId,
        parentSpanId: trace.spanId,
      },
      timestamp: new Date().toISOString(),
      sourceAgentId: this.config.id,
    };
  }
}
