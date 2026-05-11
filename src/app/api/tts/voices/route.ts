import { NextResponse } from "next/server";
import { TTSManager } from "@/lib/tts/tts-manager";

export const runtime = "nodejs";

export async function GET() {
  try {
    const manager = new TTSManager();
    const summary = await manager.getStatus();
    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load TTS voices",
      },
      { status: 500 },
    );
  }
}
