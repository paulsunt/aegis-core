import type { ModelAdapter, ChatMessage, GenerationResult } from "./model-adapter.js";

/**
 * ModelAdapter for local Ollama instance.
 * Defaults to http://localhost:11434 and model "llama3.2".
 */
export class OllamaAdapter implements ModelAdapter {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(model = "llama3.2", baseUrl = "http://localhost:11434") {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async generate(messages: ChatMessage[]): Promise<GenerationResult> {
    const prompt = this.convertMessagesToPrompt(messages);
    
    // Use the /api/chat endpoint for structured messages (better for newer models)
    // or /api/generate for raw prompting. 
    // Most 8B models (Llama 3) support the chat endpoint well.
    const url = `${this.baseUrl}/api/chat`;
    
    // Debug: Log the system prompt content to see if it's correct
    const systemMsg = messages.find(m => m.role === "system");
    if (systemMsg) console.log("🔍 [OllamaAdapter] System Prompt:", systemMsg.content.substring(0, 100) + "...");

    const body = {
      model: this.model,
      messages: messages.map(m => ({
        role: m.role === "tool" ? "user" : m.role, // Ollama might not support 'tool' role yet depending on version, mapping to user usually works or system
        content: m.role === "tool" ? `[Tool Result: ${m.name}] ${m.content}` : m.content,
      })),
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      return { text: data.message.content };
    } catch (err) {
      console.error("Ollama connection failed:", err);
      throw err;
    }
  }

  /**
   * For older completion API (if needed). Not used in chat mode.
   */
  private convertMessagesToPrompt(messages: ChatMessage[]): string {
    return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n") + "\nASSISTANT:";
  }
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}
