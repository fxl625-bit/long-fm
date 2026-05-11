import { readServerEnvVar } from "@/lib/config/server-env";
import { TTSCache } from "./tts-cache";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "./tts-provider";

export const VOLCENGINE_DEFAULT_VOICE = "zh_female_shuangkuaisisi_moon_bigtts";

const VOLCENGINE_KNOWN_VOICES: TTSVoice[] = [
  { id: "zh_female_shuangkuaisisi_moon_bigtts", name: "爽快思思", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_female_qingxinnuanyang_moon_bigtts", name: "清新暖阳", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_female_tianmeixiaoyuan_moon_bigtts", name: "甜美小源", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_male_xiaoqiandu_moon_bigtts", name: "小千度", locale: "zh-CN", gender: "male", provider: "volcengine" },
  { id: "zh_female_wenrouxiaoyu_moon_bigtts", name: "温柔小雨", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_male_wennuanqingnian_moon_bigtts", name: "温暖青年", locale: "zh-CN", gender: "male", provider: "volcengine" },
  { id: "zh_female_chenwenjingjing_moon_bigtts", name: "沉稳静静", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_male_zhixingchengshi_moon_bigtts", name: "知性城市", locale: "zh-CN", gender: "male", provider: "volcengine" },
  { id: "zh_female_xinxinyuedong_moon_bigtts", name: "心动悦动", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_female_jitangjiejie_moon_bigtts", name: "鸡汤姐姐", locale: "zh-CN", gender: "female", provider: "volcengine" },
  { id: "zh_male_shuochangdaren_moon_bigtts", name: "说唱达人", locale: "zh-CN", gender: "male", provider: "volcengine" },
  { id: "zh_female_dushunvxing_moon_bigtts", name: "都市女性", locale: "zh-CN", gender: "female", provider: "volcengine" },
];

const VOLCENGINE_KNOWN_VOICE_IDS = new Set(VOLCENGINE_KNOWN_VOICES.map((v) => v.id));

function resolveVolcengineVoice(requested?: string): string {
  if (requested && VOLCENGINE_KNOWN_VOICE_IDS.has(requested)) {
    return requested;
  }
  return readServerEnvVar("VOLCENGINE_TTS_VOICE") ?? VOLCENGINE_DEFAULT_VOICE;
}

function estimateDurationMs(text: string, speed = 1) {
  const charCount = text.trim().length;
  return Math.max(2200, Math.round((charCount * 260) / Math.max(speed, 0.6)));
}

export class VolcengineTTSProvider implements TTSProvider {
  readonly id = "volcengine";
  private readonly cache: TTSCache;

  constructor(cache = new TTSCache()) {
    this.cache = cache;
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = readServerEnvVar("VOLCENGINE_API_KEY");
    return Boolean(apiKey);
  }

  async listVoices(): Promise<TTSVoice[]> {
    return VOLCENGINE_KNOWN_VOICES;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const apiKey = readServerEnvVar("VOLCENGINE_API_KEY");
    if (!apiKey) {
      throw new Error("VOLCENGINE_API_KEY is not configured.");
    }

    const voice = resolveVolcengineVoice(request.voice);
    const speed = request.speed ?? 1;
    const speechRate = Math.round((speed - 1) * 100);

    const identity = {
      provider: "volcengine" as const,
      voice,
      speed,
      text: request.text,
    };
    const cached = await this.cache.get(identity);
    if (cached) {
      return {
        mode: "audio",
        audioUrl: cached.publicUrl,
        durationMs: cached.metadata.durationMs,
        text: request.text.trim(),
        provider: "volcengine",
        voice,
        cached: true,
      };
    }

    const resourceId = readServerEnvVar("VOLCENGINE_RESOURCE_ID") ?? "seed-tts-2.0";
    const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": resourceId,
      },
      body: JSON.stringify({
        user: { uid: "long-fm-dj" },
        req_params: {
          text: request.text.trim(),
          speaker: voice,
          audio_params: {
            format: "mp3",
            sample_rate: 24000,
            speech_rate: speechRate,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      throw new Error(`Volcengine TTS failed: ${response.status} ${errorText.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      throw new Error(`Volcengine TTS returned empty or too-small audio (${buffer.length} bytes)`);
    }

    const entry = this.cache.resolve(identity);
    this.cache.writeAudio(entry.filePath, buffer);
    const durationMs = estimateDurationMs(request.text, speed);
    this.cache.writeMetadata({
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: request.text.trim(),
      provider: "volcengine",
      voice,
      createdAt: new Date().toISOString(),
      durationMs,
    });

    return {
      mode: "audio",
      audioUrl: entry.publicUrl,
      durationMs,
      text: request.text.trim(),
      provider: "volcengine",
      voice,
      cached: false,
    };
  }
}
