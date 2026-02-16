/**
 * Simplified message types for the agent loop's internal history.
 * These are NOT the same as @aegis/types ConversationMessage
 * (which requires Timestamp, etc.). These are the raw messages
 * sent to the model adapter.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GenerationResult {
  text: string;
  toolCalls?: ToolCall[];
}

/**
 * Abstraction over the underlying LLM.
 * `generate()` receives the full conversation and returns the model's response.
 */
export interface ModelAdapter {
  generate(messages: ChatMessage[]): Promise<GenerationResult>;
}

/**
 * A mock model adapter for integration testing.
 * Pattern-matches on the conversation history to return pre-programmed responses.
 *
 * Supported patterns:
 * - "Write 'Hello Aegis' to hello.txt" → calls fs.write tool
 * - Tool result starting with "Wrote" → replies "Done"
 * - "My name is X" → replies "Hello X"
 * - "What is my name?" → scans history for "My name is X" → replies "Your name is X"
 */
export class MockModelAdapter implements ModelAdapter {
  async generate(messages: ChatMessage[]): Promise<GenerationResult> {
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const lastTool = [...messages]
      .reverse()
      .find((m) => m.role === "tool");

    // If the last message is a tool result starting with "Wrote", reply "Done"
    if (
      messages[messages.length - 1]?.role === "tool" &&
      lastTool?.content?.startsWith("Wrote")
    ) {
      return { text: "Done" };
    }

    // Pattern: write a file
    if (lastUser?.content?.includes("Write 'Hello Aegis'")) {
      return {
        text: "",
        toolCalls: [
          {
            id: "call_1",
            name: "fs.write",
            arguments: { path: "hello.txt", content: "Hello Aegis" },
          },
        ],
      };
    }

    // Pattern: "My name is X"
    const nameMatch = lastUser?.content?.match(/My name is (\w+)/i);
    if (nameMatch) {
      return { text: `Hello ${nameMatch[1]}` };
    }

    // Pattern: "What is my name?" — scan history for "My name is X"
    if (lastUser?.content?.match(/What is my name/i)) {
      // Search entire history for a user message containing "My name is ..."
      for (const msg of messages) {
        if (msg.role === "user") {
          const historyNameMatch = msg.content.match(/My name is (\w+)/i);
          if (historyNameMatch) {
            return { text: `Your name is ${historyNameMatch[1]}` };
          }
        }
      }
      return { text: "I don't know your name." };
    }

    return { text: "I don't know how to help with that." };
  }
}
