import { NextResponse } from "next/server";
import { LXMusicProvider } from "@/lib/providers/music/lx-music-provider";

export async function POST() {
  try {
    await new LXMusicProvider().pause();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to pause LX Music",
      },
      { status: 503 },
    );
  }
}
