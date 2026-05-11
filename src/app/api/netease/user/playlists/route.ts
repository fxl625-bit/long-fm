import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";

export async function GET() {
  try {
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

    const playlists = await new NeteaseClient().getUserPlaylists(cookie);

    return NextResponse.json({
      ok: true,
      playlists,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch NetEase playlists",
      },
      { status: 500 },
    );
  }
}
