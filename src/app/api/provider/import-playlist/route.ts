import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { createMusicProviderForMode, listProviderModesByPriority } from "@/lib/providers/music";
import { syncPlaylistByIdFromProvider } from "@/lib/repositories/music-sync-repository";
import { importPlaylistSchema } from "@/lib/types/api";
import type { ProviderKind } from "@/lib/types/music";

function normalizePlaylistId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const byQuery = url.searchParams.get("id");
    if (byQuery && /^\d+$/.test(byQuery)) {
      return byQuery;
    }
  } catch {
    // Accept non-URL forms below.
  }

  const queryMatch = trimmed.match(/[?&]id=(\d+)/);
  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  const digitsMatch = trimmed.match(/playlist(?:\/|.*?id=)(\d+)/i);
  if (digitsMatch?.[1]) {
    return digitsMatch[1];
  }

  return null;
}

function resolveModes(mode?: ProviderKind): ProviderKind[] {
  if (mode) {
    return [mode];
  }
  return listProviderModesByPriority();
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = importPlaylistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid import request",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const playlistId = normalizePlaylistId(parsed.data.playlistId);
    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId is invalid. Use numeric id or a playlist URL with id=...",
        },
        { status: 400 },
      );
    }

    const attempts: Array<{ mode: ProviderKind; message: string }> = [];

    for (const mode of resolveModes(parsed.data.mode)) {
      const provider = createMusicProviderForMode(mode);
      try {
        const summary = await syncPlaylistByIdFromProvider(user.id, provider, playlistId, parsed.data.providerToken);
        return NextResponse.json({
          ok: true,
          playlistId,
          provider: mode,
          summary,
          attempts,
        });
      } catch (error) {
        attempts.push({
          mode,
          message: error instanceof Error ? error.message : "Unknown provider error",
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        playlistId,
        message: "Failed to import playlist from all available providers.",
        attempts,
      },
      { status: 502 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to import playlist",
      },
      { status: 500 },
    );
  }
}
