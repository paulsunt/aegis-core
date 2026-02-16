
import { Telegraf } from "telegraf";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryEventBus, createEvent, createTraceContext } from "@aegis/core";
import {
  AgentLoop,
  OllamaAdapter,
  GeminiAdapter,
  OpenAIAdapter,
  type AgentConfig,
  type NativeToolRegistry,
  type NativeTool,
} from "@aegis/runtime";
import { FileSystemSkillRegistry, FsTool, PdfSkill } from "@aegis/skills";
import { SQLiteSessionStore } from "@aegis/persistence";
import type {
  AgentId,
  SessionId,
  AegisEvent,
} from "@aegis/types";

// ─── Configuration ──────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing in .env");
  process.exit(1);
}

// Check if Ollama is running? (Optional)

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
// Model Selection
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

let model;

if (OPENAI_API_KEY) {
  console.log("🧠 Using OpenAI Adapter (gpt-4o)");
  model = new OpenAIAdapter(OPENAI_API_KEY, "gpt-4o");
} else if (GEMINI_API_KEY) {
  console.log("🧠 Using Google Gemini Adapter");
  model = new GeminiAdapter(GEMINI_API_KEY, "gemini-1.5-flash");
} else {
  const ollamaModel = OLLAMA_MODEL || "llama3.2:latest";
  console.log(`🧠 Using Local Ollama Adapter (${ollamaModel})`);
  model = new OllamaAdapter(ollamaModel);
}

const fsTool = new FsTool(WORKSPACE_DIR);
const pdfSkill = new PdfSkill(WORKSPACE_DIR);

const nativeTools: NativeToolRegistry = {
  get(toolName: string): NativeTool | undefined {
    if (toolName === "pdf.read") {
      return {
        async execute(args: Record<string, unknown>) {
          return pdfSkill.read({ 
            path: args.path as string,
            pageRange: args.pageRange as string 
          });
        },
      };
    }
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

    if (toolName === "fs.list") {
      return {
        async execute(args: Record<string, unknown>) {
          return fsTool.list({ path: args.path as string });
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
  model: "gemini-1.5-flash",
  toolPolicy: { allow: ["fs.read", "fs.write", "fs.list", "document.read"] }, // Added document.read
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

// ─── Message Handling ───────────────────────────────────────────────

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

// Helper to transcribe audio file
async function transcribeAudio(fileLink: URL, mimeType: string): Promise<string> {
  const response = await fetch(fileLink.toString());
  const arrayBuffer = await response.arrayBuffer();
  
  const formData = new FormData();
  const audioBlob = new Blob([arrayBuffer], { type: mimeType });
  formData.append("file", audioBlob, "audio.ogg");
  formData.append("model", "whisper-1");

  console.log("🎤 Transcribing reply/message with OpenAI Whisper...");
  const transcriptionRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!transcriptionRes.ok) {
      const errText = await transcriptionRes.text();
      throw new Error(`OpenAI Whisper API error: ${transcriptionRes.status} ${errText}`);
  }

  const transcriptionData = await transcriptionRes.json() as { text: string };
  return transcriptionData.text;
}

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  let userText = ctx.message.text;
  const userName = ctx.from.first_name || "User";

  // Check for reply context
  const replyTo = ctx.message.reply_to_message;
  if (replyTo) {
    if ("text" in replyTo) {
      userText = `[User replied to message: "${replyTo.text}"]\n\n${userText}`;
    } else if ("voice" in replyTo || "audio" in replyTo) {
      try {
        const fileId = (replyTo as any).voice?.file_id || (replyTo as any).audio?.file_id;
        const mimeType = (replyTo as any).voice?.mime_type || (replyTo as any).audio?.mime_type || "audio/ogg";
        if (fileId) {
           const fileLink = await ctx.telegram.getFileLink(fileId);
           const transcribed = await transcribeAudio(fileLink, mimeType);
           userText = `[User replied to audio message with content: "${transcribed}"]\n\n${userText}`;
        }
      } catch (err) {
        console.error("Failed to transcribe replied audio:", err);
        userText = `[User replied to audio message (transcription failed)]\n\n${userText}`;
      }
    } else if ("document" in replyTo) {
       userText = `[User replied to a document: "${(replyTo as any).document.file_name}"]\n\n${userText}`;
    } else if ("photo" in replyTo) {
       userText = `[User replied to a photo]\n\n${userText}`;
    }
  }

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
// Handle voice and audio messages
bot.on(["voice", "audio"], async (ctx) => {
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || "User";
  const fileId = (ctx.message as any).voice?.file_id || (ctx.message as any).audio?.file_id;
  const mimeType = (ctx.message as any).voice?.mime_type || (ctx.message as any).audio?.mime_type || "audio/ogg";

  console.log(`🎤 [${userName}] Received voice/audio message (${mimeType})`);

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Transcribe
    const userText = await transcribeAudio(fileLink, mimeType);

    console.log(`🎤 Transcription: "${userText}"`);
    await ctx.reply(`🎤 *Транскрипция:* "${userText}"`, { parse_mode: "Markdown" });

    // NOW process as a text message
    if (!userText || userText.trim().length === 0) {
        return;
    }

    const sessionId = await getOrCreateSession(chatId);
    const trace = createTraceContext();
    
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
    console.error("❌ Error processing voice message:", err);
    await ctx.reply("Извините, не удалось обработать голосовое сообщение.");
  }
});

// Handle file uploads (document)
bot.on("document", async (ctx) => {
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || "User";
  const doc = ctx.message.document;
  const fileId = doc.file_id;
  const fileName = doc.file_name || "downloaded_file";
  const mimeType = doc.mime_type;

  console.log(`📂 [${userName}] Uploaded document: ${fileName} (${mimeType})`);

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.toString());
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save original file
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = path.join(WORKSPACE_DIR, safeName);
    
    // Ensure workspace exists
    const fs = await import("node:fs/promises");
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });

    // Save binary using Node FS
    await fs.writeFile(filePath, buffer);

    const sessionId = await getOrCreateSession(chatId);
    const trace = createTraceContext();
    
    // Notify agent about the file
    // We do NOT extract text here. We tell the agent about the file.
    // The Agent (if smart) will use `document.read` skill to read it.
    const message = `[User uploaded file: ${fileName} (MIME: ${mimeType}). Saved at: ${safeName}]`;

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
            resolve(`⚠️ Error: ${(event.payload as { error: string }).error}`);
          } else {
            resolve((event.payload as { message: string }).message);
          }
        }
      );
    });

    const turnEvent = createEvent(
      "agent.turn",
      { message, sessionId },
      trace,
      undefined,
      AGENT_ID as string
    );
    await bus.publish(turnEvent);

    const reply = await replyPromise;
    console.log(`🤖 [Aegis] ${reply.substring(0, 100)}...`);
    await ctx.reply(reply);

  } catch (err) {
    console.error("❌ Error processing document:", err);
    await ctx.reply("Ошибка при обработке файла.");
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
try {
  await bot.launch();
  console.log("🛑 Bot launch promise resolved (should not happen unless stopped)");
} catch (err) {
  console.error("❌ Fatal error in bot.launch():", err);
  process.exit(1);
}
console.log("🛑 End of script reached");

// Force keep-alive
setInterval(() => {}, 10000);
