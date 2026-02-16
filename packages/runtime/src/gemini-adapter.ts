import type { ModelAdapter, ChatMessage, GenerationResult, ToolCall } from "./model-adapter.js";

/**
 * ModelAdapter for Google Gemini API.
 *
 * Uses the REST API directly (no SDK dependency) for maximum simplicity.
 * Supports Gemini Flash and other models via the `generateContent` endpoint.
 */
export class GeminiAdapter implements ModelAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("Gemini API key is required");
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(messages: ChatMessage[]): Promise<GenerationResult> {
    // Convert ChatMessage[] to Gemini API format
    const { systemInstruction, contents } = this.convertMessages(messages);

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;

    // Extract text from response
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      return { text: "I received an empty response." };
    }

    const textParts = candidate.content.parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("");

    return { text: textParts };
  }

  /**
   * Convert our ChatMessage[] format to Gemini API's contents[] format.
   *
   * Gemini uses:
   * - `systemInstruction` for system messages (separate from contents)
   * - `contents[].role` = "user" | "model"
   * - `contents[].parts[].text` for text content
   */
  private convertMessages(messages: ChatMessage[]): {
    systemInstruction: GeminiContent | null;
    contents: GeminiContent[];
  } {
    let systemInstruction: GeminiContent | null = null;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = {
          parts: [{ text: msg.content }],
        };
        continue;
      }

      if (msg.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text: msg.content || "(thinking...)" }],
        });
        continue;
      }

      if (msg.role === "tool") {
        // Tool results get appended as user messages in Gemini
        contents.push({
          role: "user",
          parts: [{ text: `[Tool Result: ${msg.name || "tool"}] ${msg.content}` }],
        });
        continue;
      }

      // Default: user message
      contents.push({
        role: "user",
        parts: [{ text: msg.content }],
      });
    }

    // Gemini requires at least one content entry
    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Hello" }],
      });
    }

    // Gemini requires alternating roles — merge consecutive same-role messages
    const merged = this.mergeConsecutiveRoles(contents);

    return { systemInstruction, contents: merged };
  }

  /**
   * Gemini API requires strictly alternating user/model roles.
   * If two consecutive messages have the same role, merge them.
   */
  private mergeConsecutiveRoles(contents: GeminiContent[]): GeminiContent[] {
    const result: GeminiContent[] = [];

    for (const content of contents) {
      const last = result[result.length - 1];
      if (last && last.role === content.role) {
        // Merge parts
        last.parts.push(...content.parts);
      } else {
        result.push({ ...content, parts: [...content.parts] });
      }
    }

    return result;
  }
}

// ─── Gemini API types ────────────────────────────────────────────────

interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
