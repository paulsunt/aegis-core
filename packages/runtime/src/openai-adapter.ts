
import type { ModelAdapter, ChatMessage, GenerationResult, ToolCall } from "./model-adapter.js";
import { v7 as uuidv7 } from "uuid";

/**
 * ModelAdapter for OpenAI API.
 * Uses the REST API directly.
 * Parses `TOOL: name {json}` from the output to support tool calling defined in System Prompt.
 */
export class OpenAIAdapter implements ModelAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(apiKey: string, model = "gpt-4o") {
    if (!apiKey) throw new Error("OpenAI API key is required");
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(messages: ChatMessage[]): Promise<GenerationResult> {
    const apiMessages = this.convertMessages(messages);

    const body = {
      model: this.model,
      messages: apiMessages,
      temperature: 0.7,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse Tool Calls
    const { text, toolCalls } = this.parseToolCalls(content);

    return { text, toolCalls };
  }

  private parseToolCalls(content: string): { text: string; toolCalls: ToolCall[] } {
    const toolRegex = /TOOL:\s*([a-zA-Z0-9_.]+)\s*(\{.*\})/g;
    const toolCalls: ToolCall[] = [];
    let text = content;

    let match;
    while ((match = toolRegex.exec(content)) !== null) {
      try {
        const [fullMatch, name, argsJson] = match;
        const args = JSON.parse(argsJson);
        toolCalls.push({
          id: uuidv7(),
          name,
          arguments: args,
        });
        // Remove the tool call line from the visible text
        text = text.replace(fullMatch, "").trim();
      } catch (e) {
        console.warn(`Failed to parse tool call: ${match[0]}`, e);
      }
    }

    return { text, toolCalls };
  }

  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map((m) => {
      let role = m.role;
      if (role === "tool") role = "user"; // OpenAI expects tool results as tool_role or user if not using native tools
      // Actually strictly speaking:
      // system -> system
      // user -> user
      // assistant -> assistant
      // tool -> (if using native tools) tool
      // BUT since we use "Text Protocol", we treat tool outputs as USER messages that say "[Tool Result] ..."
      
      let content = m.content;
      if (m.role === "tool") {
        content = `[Tool Result: ${m.name || "unknown"}] ${content}`;
      }

      return { role, content };
    });
  }
}
