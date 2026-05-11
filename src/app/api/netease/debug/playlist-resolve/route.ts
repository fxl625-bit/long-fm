import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { resolvePlayableTracksWithNetease } from "@/lib/providers/netease/netease-playable-resolver";

function toAudioPrefix(url?: string) {
  if (!url) return null;
  return url.slice(0, 72);
}

function toRawCode(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (record.raw && typeof record.raw === "object" && typeof (record.raw as Record<string, unknown>).code === "number") {
    return (record.raw as Record<string, unknown>).code as number;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get("playlistId")?.trim();
    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId is required",
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
    const detail = await client.getPlaylistDetail(playlistId, cookie);
    const resolverClient = {
      resolveSongUrl: (songId: string, songMeta?: Record<string, unknown>, requestCookie?: string) =>
        client.resolveSongUrl(songId, songMeta, requestCookie ?? cookie),
      searchSongs: (query: string, requestCookie?: string) => client.searchSongs(query, requestCookie ?? cookie),
    };
    const result = await resolvePlayableTracksWithNetease(detail.tracks, resolverClient, {
      cookie,
      allowSearchFallback: true,
    });

    return NextResponse.json({
      ok: true,
      playlistId,
      playlistName: detail.name,
      total: result.stats.total,
      stats: {
        playable: result.stats.playable,
        noUrl: result.stats.noUrl,
        vipOnly: result.stats.vipOnly,
        copyrightUnavailable: result.stats.copyrightUnavailable,
        apiError: result.stats.apiError,
        unknown: result.stats.unknown,
      },
      progress: result.progress,
      usedSearchFallback: result.usedSearchFallback,
      lastSongUrlRawShape: result.lastSongUrlRawShape ?? null,
      samplePlayable: result.playableTracks.slice(0, 5).map((track) => ({
        title: track.name,
        artist: track.artist,
        audioUrlPrefix: toAudioPrefix(track.audioUrl),
        replacementSource: track.rawMeta?.replacementSource ?? null,
      })),
      sampleFailed: result.failedTracks.slice(0, 8).map((track) => ({
        title: track.title,
        artist: track.artist,
        reason: track.reason,
        rawCode: toRawCode(track.raw),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to debug NetEase playlist resolution",
      },
      { status: 500 },
    );
  }
}
