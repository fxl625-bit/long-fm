import { NextResponse } from "next/server";
import { getLXConnectionMessage, resolveLXConnectionState, LXMusicProvider } from "@/lib/providers/music/lx-music-provider";

export async function GET() {
  try {
    const status = await new LXMusicProvider().getStatus();
    const state = resolveLXConnectionState(status);
    return NextResponse.json({
      connected: state !== "api_unreachable",
      state,
      status,
      message: getLXConnectionMessage(state, status),
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        state: "api_unreachable",
        message: error instanceof Error ? error.message : "Failed to check LX Music health",
      },
      { status: 503 },
    );
  }
}
