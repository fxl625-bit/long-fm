import { NextResponse } from "next/server";
import { TTSManager } from "@/lib/tts/tts-manager";
import { normalizeDJVoiceSettings } from "@/lib/tts/tts-settings";
import { isTTSProviderId } from "@/lib/tts/tts-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const defaults = normalizeDJVoiceSettings();
    const text = typeof body?.text === "string" && body.text.trim() ? body.text.trim() : "这里是 Auralia。声音已经切过来了。";
    const provider = typeof body?.provider === "string" && isTTSProviderId(body.provider) ? body.provider : undefined;
    const voice = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : defaults.voice;
    const rate = typeof body?.rate === "string" && body.rate.trim() ? body.rate.trim() : defaults.rate;
    const pitch =
      typeof body?.pitch === "string" && body.pitch.trim()
        ? body.pitch.trim()
        : typeof body?.pitch === "number"
          ? body.pitch
          : defaults.pitch;

    const manager = new TTSManager();
    const result = await manager.synthesize({
      text,
      provider,
      voice,
      rate,
      pitch,
      style: "night_radio",
    });

    return NextResponse.json({
      ok: true,
      ...result,
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "subtitle_only",
        provider: "subtitle_only",
        error: error instanceof Error ? error.message : "Failed to test TTS",
        message: error instanceof Error ? error.message : "Failed to test TTS",
      },
      { status: 500 },
    );
  }
}
