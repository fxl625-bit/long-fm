import type { LLMChatMessage, LLMJsonOptions, LLMProvider } from "./llm-provider";
import { safeParseJson } from "./llm-provider";

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type DeepSeekEnv = {
  DEEPSEEK_API_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
};

export type DeepSeekError = {
  type: "config_missing" | "api_error" | "invalid_json" | "empty_response";
  message: string;
};

export type DeepSeekChatJsonResult<T> = {
  ok: boolean;
  data?: T;
  rawText?: string;
  error?: DeepSeekError;
};

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export class DeepSeekClient implements LLMProvider {
  private readonly env: DeepSeekEnv;
  private readonly fetchImpl: typeof fetch;

  constructor(input: { env?: DeepSeekEnv; fetchImpl?: typeof fetch } = {}) {
    this.env = input.env ?? (process.env as DeepSeekEnv);
    const baseFetch = input.fetchImpl ?? fetch;
    this.fetchImpl = ((resource: RequestInfo | URL, init?: RequestInit) => baseFetch(resource, init)) as typeof fetch;
  }

  get model() {
    return this.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  }

  get baseUrl() {
    return trimTrailingSlash(this.env.DEEPSEEK_API_BASE_URL ?? "https://api.deepseek.com");
  }

  isConfigured() {
    return Boolean(this.env.DEEPSEEK_API_KEY);
  }

  async chatJson<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<DeepSeekChatJsonResult<T>> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        error: {
          type: "config_missing",
          message: "DEEPSEEK_API_KEY is not configured.",
        },
      };
    }

    let rawText = "";
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: input.userPrompt },
          ],
          temperature: input.temperature ?? 0.75,
          max_tokens: input.maxTokens ?? 1200,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        return {
          ok: false,
          error: {
            type: "api_error",
            message: `DeepSeek request failed: ${response.status}${message ? ` ${message}` : ""}`,
          },
        };
      }

      const payload = (await response.json()) as DeepSeekResponse;
      rawText = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (!rawText) {
        return {
          ok: false,
          error: {
            type: "empty_response",
            message: "DeepSeek returned empty content.",
          },
        };
      }

      try {
        return {
          ok: true,
          data: safeParseJson<T>(rawText),
          rawText,
        };
      } catch {
        return {
          ok: false,
          rawText,
          error: {
            type: "invalid_json",
            message: "DeepSeek returned non-JSON content.",
          },
        };
      }
    } catch (error) {
      return {
        ok: false,
        rawText: rawText || undefined,
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : "DeepSeek request failed.",
        },
      };
    }
  }

  async generateJson<T>(messages: LLMChatMessage[], options: LLMJsonOptions = {}) {
    const result = await this.chatJson<T>({
      systemPrompt: messages.find((message) => message.role === "system")?.content ?? "只输出 JSON。",
      userPrompt: messages.filter((message) => message.role !== "system").map((message) => message.content).join("\n\n"),
      temperature: options.temperature,
    });

    if (!result.ok || result.data == null) {
      throw new Error(result.error?.message ?? "DeepSeek generateJson failed.");
    }

    return result.data;
  }

  async generateText(messages: LLMChatMessage[], options: LLMJsonOptions = {}) {
    const result = await this.chatJson<Record<string, unknown>>({
      systemPrompt: messages.find((message) => message.role === "system")?.content ?? "只输出 JSON。",
      userPrompt: messages.filter((message) => message.role !== "system").map((message) => message.content).join("\n\n"),
      temperature: options.temperature,
    });

    if (!result.ok || !result.rawText) {
      throw new Error(result.error?.message ?? "DeepSeek generateText failed.");
    }

    return result.rawText;
  }
}
