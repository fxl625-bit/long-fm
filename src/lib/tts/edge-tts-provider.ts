import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readServerEnvVar } from "@/lib/config/server-env";
import { TTSCache } from "./tts-cache";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "./tts-provider";

const execFileAsync = promisify(execFile);

export const EDGE_TTS_DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

const EDGE_ZH_VOICES: TTSVoice[] = [
  { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", locale: "zh-CN", gender: "female", provider: "edge_tts" },
  { id: "zh-CN-YunxiNeural", name: "Yunxi", locale: "zh-CN", gender: "male", provider: "edge_tts" },
  { id: "zh-CN-YunjianNeural", name: "Yunjian", locale: "zh-CN", gender: "male", provider: "edge_tts" },
  { id: "zh-CN-XiaoyiNeural", name: "Xiaoyi", locale: "zh-CN", gender: "female", provider: "edge_tts" },
  { id: "zh-CN-YunyangNeural", name: "Yunyang", locale: "zh-CN", gender: "male", provider: "edge_tts" },
  { id: "zh-CN-YunhaoNeural", name: "Yunhao", locale: "zh-CN", gender: "male", provider: "edge_tts" },
  { id: "zh-CN-XiaohanNeural", name: "Xiaohan", locale: "zh-CN", gender: "female", provider: "edge_tts" },
  { id: "zh-CN-XiaochenNeural", name: "Xiaochen", locale: "zh-CN", gender: "female", provider: "edge_tts" },
  { id: "zh-CN-XiaoyouNeural", name: "Xiaoyou", locale: "zh-CN", gender: "female", provider: "edge_tts" },
  { id: "zh-CN-XiaoshuangNeural", name: "Xiaoshuang", locale: "zh-CN", gender: "female", provider: "edge_tts" },
];

const EDGE_KNOWN_VOICE_IDS = new Set(EDGE_ZH_VOICES.map((v) => v.id));

function resolveEdgeVoice(requested?: string): string {
  if (requested && EDGE_KNOWN_VOICE_IDS.has(requested)) {
    return requested;
  }
  return readServerEnvVar("EDGE_TTS_VOICE") ?? EDGE_TTS_DEFAULT_VOICE;
}

type CommandCandidate = {
  command: string;
  args: string[];
};

function estimateDurationMs(text: string, speed = 1) {
  const charCount = text.trim().length;
  return Math.max(2400, Math.round((charCount * 255) / Math.max(speed, 0.6)));
}

function toEdgeRate(rate?: string, speed?: number) {
  if (typeof rate === "string" && rate.trim()) {
    return rate.trim();
  }
  if (typeof speed !== "number" || Number.isNaN(speed) || speed === 1) {
    return readServerEnvVar("EDGE_TTS_RATE") ?? "-5%";
  }

  const percent = Math.round((speed - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function toEdgePitch(pitch?: number | string) {
  if (typeof pitch === "string" && pitch.trim()) {
    return pitch.trim();
  }
  if (typeof pitch !== "number" || Number.isNaN(pitch) || pitch === 0) {
    return readServerEnvVar("EDGE_TTS_PITCH") ?? "+0Hz";
  }

  const hz = Math.round(pitch * 100);
  return `${hz >= 0 ? "+" : ""}${hz}Hz`;
}

export class EdgeTTSProvider implements TTSProvider {
  readonly id = "edge_tts";
  private readonly cache: TTSCache;
  private resolvedCandidate: Promise<CommandCandidate | null> | null = null;

  constructor(cache = new TTSCache()) {
    this.cache = cache;
  }

  async isAvailable(): Promise<boolean> {
    if (await this.getCommandCandidate()) return true;
    try {
      await import("edge-tts-universal");
      return true;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<TTSVoice[]> {
    return EDGE_ZH_VOICES;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const candidate = await this.getCommandCandidate();
    const voice = resolveEdgeVoice(request.voice);
    const speed = request.speed ?? 1;
    const rate = toEdgeRate(request.rate, speed);
    const pitch = toEdgePitch(request.pitch);
    const identity = {
      provider: "edge_tts" as const,
      voice,
      rate,
      speed,
      pitch,
      text: request.text,
    };
    const cached = await this.cache.get(identity);
    if (cached) {
      return {
        mode: "audio",
        audioUrl: cached.publicUrl,
        durationMs: cached.metadata.durationMs,
        text: request.text.trim(),
        provider: "edge_tts",
        voice,
        rate,
        pitch,
        cached: true,
      };
    }

    const entry = this.cache.resolve(identity);

    if (candidate) {
      try {
        await execFileAsync(
          candidate.command,
          [
            ...candidate.args,
            "--voice",
            voice,
            `--rate=${rate}`,
            `--pitch=${pitch}`,
            "--text",
            request.text.trim(),
            "--write-media",
            entry.filePath,
          ],
          { timeout: 45000, windowsHide: true },
        );
      } catch {
        // CLI failed, fall through to JS-native implementation
      }
    }

    // If CLI didn't produce output, use the JS-native package (works on Vercel)
    const { existsSync } = await import("node:fs");
    if (!existsSync(entry.filePath)) {
      const { EdgeTTS } = await import("edge-tts-universal");
      const tts = new EdgeTTS(request.text.trim(), voice, { rate, pitch, volume: "+0%" });
      const result = await tts.synthesize();
      const buffer = Buffer.from(await result.audio.arrayBuffer());
      this.cache.writeAudio(entry.filePath, buffer);
    }

    const durationMs = estimateDurationMs(request.text, speed);
    this.cache.writeMetadata({
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: request.text.trim(),
      provider: "edge_tts",
      voice,
      rate,
      pitch,
      createdAt: new Date().toISOString(),
      durationMs,
    });

    return {
      mode: "audio",
      audioUrl: entry.publicUrl,
      durationMs,
      text: request.text.trim(),
      provider: "edge_tts",
      voice,
      rate,
      pitch,
      cached: false,
    };
  }

  private async getCommandCandidate() {
    if (this.resolvedCandidate) {
      return this.resolvedCandidate;
    }

    this.resolvedCandidate = this.resolveCommandCandidate();
    return this.resolvedCandidate;
  }

  private async resolveCommandCandidate(): Promise<CommandCandidate | null> {
    const candidates: CommandCandidate[] = [
      { command: "edge-tts", args: [] },
      { command: "python", args: ["-m", "edge_tts"] },
      { command: "py", args: ["-m", "edge_tts"] },
    ];

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.command, [...candidate.args, "--help"], {
          timeout: 8000,
          windowsHide: true,
        });
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }
}
