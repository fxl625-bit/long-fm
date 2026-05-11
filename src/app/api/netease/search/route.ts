import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return NextResponse.json(
        {
          ok: false,
          message: "q is required",
        },
        { status: 400 },
      );
    }

    const { providerSession } = await getCurrentNeteaseSession();
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
    const tracks = await client.searchSongs(q, cookie);
    const enriched = await Promise.all(
      tracks.slice(0, 12).map(async (track) => ({
        ...track,
        urlResult: await client.resolveSongUrl(track.id, track.rawMeta as Record<string, unknown> | undefined, cookie),
      })),
    );

    return NextResponse.json({
      ok: true,
      tracks: enriched,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to search NetEase songs",
      },
      { status: 500 },
    );
  }
}
