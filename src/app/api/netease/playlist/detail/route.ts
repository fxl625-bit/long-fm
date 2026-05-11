import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { syncPlaylistByIdFromProvider } from "@/lib/repositories/music-sync-repository";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get("playlistId")?.trim() ?? "";
    const shouldSync = ["1", "true", "yes"].includes((searchParams.get("sync") ?? "").trim().toLowerCase());
    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId is required",
        },
        { status: 400 },
      );
    }

    const { user, providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim();
    if (!cookie) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          message: "NetEase login required",
        },
        { status: 401 },
      );
    }

    const client = new NeteaseClient();
    const detail = await client.getPlaylistDetail(playlistId, cookie);
    const syncSummary = shouldSync
      ? await syncPlaylistByIdFromProvider(user.id, client.provider, playlistId, cookie).catch(() => null)
      : null;

    return NextResponse.json({
      ok: true,
      playlist: detail,
      syncSummary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch NetEase playlist detail",
      },
      { status: 500 },
    );
  }
}
