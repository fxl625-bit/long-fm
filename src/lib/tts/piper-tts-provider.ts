import { readServerEnvVar } from "@/lib/config/server-env";
import { TTSCache } from "./tts-cache";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "./tts-provider";

function estimateDurationMs(text: string, speed = 1) {
  const charCount = text.trim().length;
  return Math.max(2200, Math.round((charCount * 250) / Math.max(speed, 0.6)));
}

export class PiperTTSProvider implements TTSProvider {
  readonly id = "piper";
  private readonly baseUrl: string;
  private readonly cache: TTSCache;

  constructor(cache = new TTSCache()) {
    this.cache = cache;
    this.baseUrl = (readServerEnvVar("PIPER_TTS_BASE_URL") ?? "http://127.0.0.1:10200").replace(/\/+$/, "");
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/tts`, { method: "OPTIONS" });
      return response.ok || response.status === 405;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: "zh",
        name: "Piper Chinese",
        locale: "zh-CN",
        gender: "neutral",
        provider: "piper",
      },
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const voice = request.voice ?? "zh";
    const identity = {
      provider: "piper" as const,
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
        provider: "piper",
        voice,
        cached: true,
      };
    }

    const response = await fetch(`${this.baseUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text.trim(),
        voice,
      }),
    });
    if (!response.ok) {
      throw new Error(`Piper TTS failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const entry = this.cache.resolve(identity);
    this.cache.writeAudio(entry.filePath, buffer);
    const durationMs = estimateDurationMs(request.text, request.speed ?? 1);
    this.cache.writeMetadata({
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: request.text.trim(),
      provider: "piper",
      voice,
      createdAt: new Date().toISOString(),
      durationMs,
    });

    return {
      mode: "audio",
      audioUrl: entry.publicUrl,
      durationMs,
      text: request.text.trim(),
      provider: "piper",
      voice,
      cached: false,
    };
  }
}
