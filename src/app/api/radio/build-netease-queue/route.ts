import { NextResponse } from "next/server";
import { NeteasePlayableService } from "@/lib/providers/netease/netease-playable-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const playlistId = typeof body?.playlistId === "string" ? body.playlistId.trim() : "";
    const limit = Math.max(1, Math.min(50, Number(body?.limit ?? "30") || 30));
    const level = body?.level === "higher" || body?.level === "exhigh" ? body.level : "standard";

    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId is required",
        },
        { status: 400 },
      );
    }

    const service = new NeteasePlayableService();
    const result = await service.buildPlayableQueue(playlistId, { limit, level });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to build NetEase playable queue",
      },
      { status: 500 },
    );
  }
}
