import { Telegraf } from "telegraf";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryEventBus, createEvent, createTraceContext } from "@aegis/core";
import {
  AgentLoop,
  GeminiAdapter,
  type NativeToolRegistry,
  type NativeTool,
} from "@aegis/runtime";
import { FileSystemSkillRegistry, FsTool } from "@aegis/skills";
import { SQLiteSessionStore } from "@aegis/persistence";
import type {
  AgentId,
  AgentConfig,
  SessionId,
  AegisEvent,
} from "@aegis/types";

// ─── Configuration ──────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN environment variable is required.");
  console.error("   Get one from @BotFather on Telegram.");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY environment variable is required.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, "../data/aegis.db");
const WORKSPACE_DIR = path.resolve(__dirname, "../data/workspace");

// ─── Initialize Components ─────────────────────────────────────────

console.log("🛡️  Project Aegis — Telegram Bot starting...");

const bus = new InMemoryEventBus();
const skills = new FileSystemSkillRegistry();
await skills.index([]);

const sessionStore = new SQLiteSessionStore(DB_PATH);
const model = new GeminiAdapter(GEMINI_API_KEY);

const fsTool = new FsTool(WORKSPACE_DIR);
const nativeTools: NativeToolRegistry = {
  get(toolName: string): NativeTool | undefined {
    if (toolName === "fs.write") {
      return {
        async execute(args: Record<string, unknown>) {
          return fsTool.write({
            path: args.path as string,
            content: args.content as string,
          });
        },
      };
    }
    if (toolName === "fs.read") {
      return {
        async execute(args: Record<string, unknown>) {
          return fsTool.read({ path: args.path as string });
        },
      };
    }
    return undefined;
  },
};

const AGENT_ID = "aegis-telegram" as AgentId;

const agentConfig: AgentConfig = {
  id: AGENT_ID,
  name: "Aegis",
  systemPrompt: `You are Aegis, a friendly and helpful AI assistant. 
You communicate in the same language the user writes to you. 
If they write in Russian, you respond in Russian. If in English, respond in English.
Be concise but helpful. You have a warm personality.
You remember things the user tells you across messages.`,
  model: "gemini-2.0-flash",
  toolPolicy: { allow: ["fs.read", "fs.write"] },
  sandbox: {},
  resourceLimits: {},
};

const agent = new AgentLoop({
  bus,
  model,
  skills,
  config: agentConfig,
  nativeTools,
  sessionStore,
});

await agent.start();

// ─── Session Management ─────────────────────────────────────────────

/**
 * Map Telegram chat ID to Aegis session ID.
 * Creates a session on first message from each chat.
 */
const chatSessionMap = new Map<number, SessionId>();

async function getOrCreateSession(chatId: number): Promise<SessionId> {
  let sessionId = chatSessionMap.get(chatId);
  if (sessionId) return sessionId;

  // Check if session exists in DB for this chat
  const existingSessions = await sessionStore.listByAgent(AGENT_ID);
  // For simplicity, we store chatId in the session metadata via a convention:
  // We'll just create a new session per chat.
  const session = await sessionStore.create(AGENT_ID);
  chatSessionMap.set(chatId, session.id);
  return session.id;
}

// ─── Telegram Bot ───────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text;
  const userName = ctx.from.first_name || "User";

  console.log(`📩 [${userName}] ${userText}`);

  try {
    const sessionId = await getOrCreateSession(chatId);
    const trace = createTraceContext();

    // Wait for agent to complete
    const replyPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error("Agent timed out after 30s"));
      }, 30000);

      const sub = bus.subscribe(
        { topics: ["agent.complete", "agent.error"] },
        (event: AegisEvent) => {
          clearTimeout(timeout);
          sub.unsubscribe();
          if (event.topic === "agent.error") {
            resolve(
              `⚠️ Error: ${(event.payload as { error: string }).error}`
            );
          } else {
            resolve((event.payload as { message: string }).message);
          }
        }
      );
    });

    // Publish the turn
    const turnEvent = createEvent(
      "agent.turn",
      { message: userText, sessionId },
      trace,
      undefined,
      AGENT_ID as string
    );
    await bus.publish(turnEvent);

    // Wait for response
    const reply = await replyPromise;
    console.log(`🤖 [Aegis] ${reply.substring(0, 100)}...`);
    await ctx.reply(reply);
  } catch (err) {
    console.error("❌ Error processing message:", err);
    await ctx.reply("Извините, произошла ошибка. Попробуйте ещё раз.");
  }
});

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  bot.stop("SIGINT");
  sessionStore.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  sessionStore.close();
});

console.log("✅ Aegis Telegram Bot is ready! Waiting for messages...");
bot.launch();
