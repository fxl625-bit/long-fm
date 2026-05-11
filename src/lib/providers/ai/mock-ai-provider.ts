import type { AIJsonRequest, AIProvider, AITextRequest } from "./types";

export class MockAIProvider implements AIProvider {
  readonly providerName = "mock";

  async generateJson<T>(input: AIJsonRequest): Promise<T> {
    void input;
    throw new Error("MockAIProvider.generateJson should be bypassed by deterministic fallbacks.");
  }

  async generateText(input: AITextRequest): Promise<string> {
    const userPrompt = input.messages[input.messages.length - 1]?.content ?? "";
    return `这组队列会先稳住，再慢慢推进。\n\n${userPrompt.slice(0, 80)}`;
  }
}
