import { TTSManager } from "@/lib/tts/tts-manager";
import type { TTSProviderId, TTSResult } from "@/lib/tts/tts-provider";

export type DJVoiceOutput = {
  mode: "audio" | "subtitle_only";
  subtitle: string;
  audioUrl?: string;
  provider: TTSProviderId;
};

export type DJVoiceDebugResult = {
  ok: true;
  mode: "audio" | "subtitle_only";
  provider: string;
  audioUrl?: string;
  durationMs?: number;
  text: string;
  cached?: boolean;
  error: null;
};

type TTSManagerLike = Pick<TTSManager, "synthesize">;

export async function synthesizeDJVoice(subtitle: string, manager: TTSManagerLike = new TTSManager()): Promise<DJVoiceDebugResult> {
  const result: TTSResult = await manager.synthesize({
    text: subtitle,
    style: "dj",
  });
  return {
    ok: true,
    mode: result.mode,
    provider: result.provider,
    audioUrl: result.audioUrl,
    durationMs: result.durationMs,
    text: subtitle.trim(),
    cached: result.cached,
    error: null,
  };
}

export async function renderDJVoice(subtitle: string): Promise<DJVoiceOutput> {
  const result = await synthesizeDJVoice(subtitle);
  return {
    mode: result.mode,
    subtitle,
    audioUrl: result.audioUrl,
    provider: result.provider as TTSProviderId,
  };
}
