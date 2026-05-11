import { NextResponse } from "next/server";
import { LXMusicProvider } from "@/lib/providers/music/lx-music-provider";

export async function GET() {
  try {
    const status = await new LXMusicProvider().getStatus();
    return NextResponse.json({
      ok: true,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to read LX Music status",
      },
      { status: 503 },
    );
  }
}
