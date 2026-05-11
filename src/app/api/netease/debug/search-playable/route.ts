import { NextResponse } from "next/server";
import type { MusicTrack } from "@/lib/types/music";
import { resolveNeteaseApiMode } from "@/lib/providers/netease/netease-api-mode";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { resolveOneSongUrlWithDiagnostics } from "@/lib/providers/netease/netease-url-diagnostics";

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[\s\-_/()[\]{}.,!?'"`~:;]+/g, "");
}

function scoreTrack(queryTitle: string, queryArtist: string, track: MusicTrack) {
  const title = normalizeForMatch(queryTitle);
  const artist = normalizeForMatch(queryArtist);
  const candidateTitle = normalizeForMatch(track.name);
  const candidateArtist = normalizeForMatch(track.artist);
  let score = 0;
  if (title) {
    if (title === candidateTitle) score += 8;
    else if (candidateTitle.includes(title) || title.includes(candidateTitle)) score += 4;
  }
  if (artist) {
    if (artist === candidateArtist) score += 6;
    else if (candidateArtist.includes(artist) || artist.includes(candidateArtist)) score += 3;
  }
  return score;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const query = [title, artist].filter(Boolean).join(" ");

    if (!query) {
      return NextResponse.json(
        {
          ok: false,
          message: "title or artist is required",
        },
        { status: 400 },
      );
    }

    const { providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim() ?? "";
    const client = new NeteaseClient();
    const apiMode = resolveNeteaseApiMode();
    const searchResults = await client
      .searchSongs(query, cookie)
      .then((items) => items.sort((a, b) => scoreTrack(title, artist, b) - scoreTrack(title, artist, a)));
    const tried = [];

    for (const track of searchResults.slice(0, 10)) {
      const resolved = await resolveOneSongUrlWithDiagnostics({
        songId: track.id,
        cookie,
        client,
        apiMode,
      });
      tried.push({
        id: track.id,
        title: track.name,
        artist: track.artist,
        playable: resolved.final.playable,
        reason: resolved.final.reason,
        attempts: resolved.attempts,
      });

      if (resolved.final.playable && resolved.final.audioUrl) {
        return NextResponse.json({
          found: true,
          track: {
            id: track.id,
            title: track.name,
            artist: track.artist,
            audioUrl: resolved.final.audioUrl,
          },
          tried,
        });
      }
    }

    return NextResponse.json({
      found: false,
      track: null,
      tried,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to search a playable NetEase track",
      },
      { status: 500 },
    );
  }
}
