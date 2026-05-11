import { NextResponse } from "next/server";
import { resolveNeteaseApiMode } from "@/lib/providers/netease/netease-api-mode";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { resolveOneSongUrlWithDiagnostics } from "@/lib/providers/netease/netease-url-diagnostics";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("id")?.trim();

    if (!songId) {
      return NextResponse.json(
        {
          ok: false,
          message: "id is required",
        },
        { status: 400 },
      );
    }

    const { providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim() ?? "";
    const client = new NeteaseClient();
    const result = await resolveOneSongUrlWithDiagnostics({
      songId,
      cookie,
      client,
      apiMode: resolveNeteaseApiMode(),
    });

    return NextResponse.json(result);
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
