import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";

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

    const client = new NeteaseClient();
    const detail = await client.getSongDetail(songId, cookie);
    const urlResult = await client.resolveSongUrl(songId, detail?.rawMeta as Record<string, unknown> | undefined, cookie);

    return NextResponse.json({
      ok: true,
      ...urlResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to resolve NetEase song url",
      },
      { status: 500 },
    );
  }
}
