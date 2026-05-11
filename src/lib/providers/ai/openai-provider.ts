import OpenAI from "openai";
import type { AIJsonRequest, AIProvider, AITextRequest } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly providerName = "openai";

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  static fromEnv(): OpenAIProvider {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    return new OpenAIProvider(new OpenAI({ apiKey }), model);
  }

  async generateJson<T>(input: AIJsonRequest): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: input.temperature ?? 0.7,
      response_format: { type: "json_object" },
      messages: input.messages,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error(`AI JSON generation failed for schema: ${input.jsonSchemaName}`);
    }

    return JSON.parse(text) as T;
  }

  async generateText(input: AITextRequest): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: input.temperature ?? 0.7,
      messages: input.messages,
    });

    return completion.choices[0]?.message?.content ?? "";
  }
}

