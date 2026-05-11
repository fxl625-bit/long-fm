import OpenAI from "openai";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function safeParseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
    throw new Error("OpenAI returned non-JSON content.");
  }
}

export class OpenAIDJProvider {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly strongModel: string;
  private readonly ttsModel: string;
  private readonly ttsVoice: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    this.client = new OpenAI({ apiKey });
    this.defaultModel = process.env.OPENAI_DJ_MODEL ?? "gpt-4.1-mini";
    this.strongModel = process.env.OPENAI_DJ_STRONG_MODEL ?? "gpt-4.1";
    this.ttsModel = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
    this.ttsVoice = process.env.OPENAI_TTS_VOICE ?? "marin";
  }

  async generateJson<T>(messages: ChatMessage[], options?: { strong?: boolean; temperature?: number }): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: options?.strong ? this.strongModel : this.defaultModel,
      temperature: options?.temperature ?? 0.45,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw.trim()) {
      throw new Error("OpenAI returned empty content.");
    }
    return safeParseJson<T>(raw);
  }

  async generateText(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.defaultModel,
      temperature: options?.temperature ?? 0.6,
      messages,
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  async synthesizeSpeech(text: string): Promise<Buffer> {
    const response = await this.client.audio.speech.create({
      model: this.ttsModel,
      voice: this.ttsVoice as never,
      input: text,
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
