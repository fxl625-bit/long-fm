import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseLyricProvider } from "@/lib/providers/netease/netease-lyric-provider";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("songId")?.trim() ?? "";
    if (!songId) {
      return NextResponse.json(
        {
          ok: false,
          message: "songId is required",
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

    const lyric = await new NeteaseLyricProvider().getLyric(songId, cookie);

    return NextResponse.json({
      ok: true,
      lyric,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch NetEase lyric",
      },
      { status: 500 },
    );
  }
}
