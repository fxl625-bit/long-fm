export type LLMChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMJsonOptions = {
  model?: string;
  temperature?: number;
};

export type LLMProvider = {
  generateJson<T>(messages: LLMChatMessage[], options?: LLMJsonOptions): Promise<T>;
  generateText?(messages: LLMChatMessage[], options?: LLMJsonOptions): Promise<string>;
};

export function safeParseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
    throw new Error("LLM returned non-JSON content.");
  }
}
