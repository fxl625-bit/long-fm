import { readServerEnvVar } from "@/lib/config/server-env";
import { OpenAIDJProvider } from "@/lib/dj/openai-dj-provider";
import { TTSCache } from "./tts-cache";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "./tts-provider";

export const OPENAI_TTS_DEFAULT_VOICE = "marin";

const OPENAI_KNOWN_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin",
]);

function resolveOpenAIVoice(requested?: string): string {
  if (requested && OPENAI_KNOWN_VOICES.has(requested)) {
    return requested;
  }
  return readServerEnvVar("OPENAI_TTS_VOICE") ?? OPENAI_TTS_DEFAULT_VOICE;
}

function estimateDurationMs(text: string, speed = 1) {
  const charCount = text.trim().length;
  return Math.max(2200, Math.round((charCount * 260) / Math.max(speed, 0.6)));
}

export class OpenAITTSProvider implements TTSProvider {
  readonly id = "openai";
  private readonly cache: TTSCache;

  constructor(cache = new TTSCache()) {
    this.cache = cache;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(readServerEnvVar("OPENAI_API_KEY"));
  }

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: readServerEnvVar("OPENAI_TTS_VOICE") ?? OPENAI_TTS_DEFAULT_VOICE,
        name: "OpenAI Marin",
        locale: "zh-CN",
        gender: "neutral",
        provider: "openai",
      },
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const voice = resolveOpenAIVoice(request.voice);
    const identity = {
      provider: "openai" as const,
      voice,
      speed: request.speed ?? 1,
      pitch: request.pitch ?? 0,
      text: request.text,
    };
    const cached = await this.cache.get(identity);
    if (cached) {
      return {
        mode: "audio",
        audioUrl: cached.publicUrl,
        durationMs: cached.metadata.durationMs,
        text: request.text.trim(),
        provider: "openai",
        voice,
        cached: true,
      };
    }

    const provider = new OpenAIDJProvider();
    const buffer = await provider.synthesizeSpeech(request.text.trim());
    const entry = this.cache.resolve(identity);
    this.cache.writeAudio(entry.filePath, buffer);
    const durationMs = estimateDurationMs(request.text, request.speed ?? 1);
    this.cache.writeMetadata({
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: request.text.trim(),
      provider: "openai",
      voice,
      createdAt: new Date().toISOString(),
      durationMs,
    });

    return {
      mode: "audio",
      audioUrl: entry.publicUrl,
      durationMs,
      text: request.text.trim(),
      provider: "openai",
      voice,
      cached: false,
    };
  }
}
