import { NextResponse } from "next/server";
import { synthesizeDJVoice } from "@/lib/dj/dj-voice-engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" && body.text.trim() ? body.text.trim() : "我已经连上你的网易云了，现在先帮你筛出能播放的歌。";

  try {
    const result = await synthesizeDJVoice(text);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: true,
      mode: "subtitle_only",
      provider: "subtitle_only",
      text,
      error: error instanceof Error ? error.message : "Failed to synthesize DJ voice",
    });
  }
}
