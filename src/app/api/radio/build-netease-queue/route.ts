import { NextResponse } from "next/server";
import { NeteasePlayableService } from "@/lib/providers/netease/netease-playable-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const playlistId = typeof body?.playlistId === "string" ? body.playlistId.trim() : "";
    const playlistIds: string[] = Array.isArray(body?.playlistIds)
      ? body.playlistIds.filter((id: unknown) => typeof id === "string" && id.trim())
      : [];
    const limit = Math.max(1, Math.min(300, Number(body?.limit ?? "100") || 100));
    const level = body?.level === "higher" || body?.level === "exhigh" ? body.level : "standard";

    const ids = playlistIds.length > 0 ? playlistIds : playlistId ? [playlistId] : [];

    if (!ids.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId or playlistIds is required",
        },
        { status: 400 },
      );
    }

    const service = new NeteasePlayableService();
    const result = await service.buildPlayableQueueFromIds(ids, { limit, level });

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
