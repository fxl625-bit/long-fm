import { NextResponse } from "next/server";
import { LXMusicProvider } from "@/lib/providers/music/lx-music-provider";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const volume = typeof body?.volume === "number" ? body.volume : Number(body?.volume);
    if (!Number.isFinite(volume)) {
      return NextResponse.json({ ok: false, message: "volume must be a number" }, { status: 400 });
    }
    await new LXMusicProvider().setVolume(volume);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to set LX Music volume",
      },
      { status: 503 },
    );
  }
}
