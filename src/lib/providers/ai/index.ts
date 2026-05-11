import { MockAIProvider } from "./mock-ai-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./types";

export function createAIProvider(): AIProvider {
  try {
    return OpenAIProvider.fromEnv();
  } catch {
    return new MockAIProvider();
  }
}

export type { AIProvider } from "./types";

