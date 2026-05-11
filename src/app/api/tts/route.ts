import { TTSManager } from "@/lib/tts/tts-manager";
import { normalizeDJVoiceSettings } from "@/lib/tts/tts-settings";
import { isTTSProviderId } from "@/lib/tts/tts-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const provider = typeof body?.provider === "string" && isTTSProviderId(body.provider) ? body.provider : undefined;
  const defaults = normalizeDJVoiceSettings();
  const voice = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : defaults.voice;
  const rate = typeof body?.rate === "string" && body.rate.trim() ? body.rate.trim() : defaults.rate;
  const speed = typeof body?.speed === "number" ? body.speed : undefined;
  const pitch =
    typeof body?.pitch === "string" && body.pitch.trim()
      ? body.pitch.trim()
      : typeof body?.pitch === "number"
        ? body.pitch
        : defaults.pitch;
  const style =
    body?.style === "dj" ||
    body?.style === "calm" ||
    body?.style === "energetic" ||
    body?.style === "night" ||
    body?.style === "neutral" ||
    body?.style === "night_radio"
      ? body.style
      : "dj";

  if (!text) {
    return Response.json({ ok: false, message: "text is required" }, { status: 400 });
  }

  try {
    const manager = new TTSManager();
    const result = await manager.synthesize({
      text,
      provider,
      voice,
      rate,
      speed,
      pitch,
      style,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to synthesize speech",
      },
      { status: 503 },
    );
  }
}
