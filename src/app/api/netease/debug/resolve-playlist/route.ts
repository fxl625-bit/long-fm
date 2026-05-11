import { NextResponse } from "next/server";
import { resolveNeteaseApiMode } from "@/lib/providers/netease/netease-api-mode";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { resolveOneSongUrlWithDiagnostics, type ResolveOneFailureReason } from "@/lib/providers/netease/netease-url-diagnostics";

function toAudioPrefix(url?: string | null) {
  return url ? url.slice(0, 96) : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get("playlistId")?.trim();
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") ?? "20") || 20));

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
    const cookie = providerSession?.cookie?.trim() ?? "";
    const client = new NeteaseClient();
    const detail = await client.getPlaylistDetail(playlistId, cookie);
    const tracks = detail.tracks.slice(0, limit);
    const apiMode = resolveNeteaseApiMode();
    const stats: Record<ResolveOneFailureReason, number> = {
      no_url: 0,
      vip_only: 0,
      copyright_unavailable: 0,
      cookie_missing: 0,
      api_error: 0,
      invalid_response: 0,
    };

    const results = [];
    for (const track of tracks) {
      const resolved = await resolveOneSongUrlWithDiagnostics({
        songId: track.id,
        cookie,
        client,
        apiMode,
      });
      results.push({
        track,
        resolved,
      });
      if (!resolved.final.playable && resolved.final.reason) {
        stats[resolved.final.reason] += 1;
      }
    }

    const playable = results.filter((item) => item.resolved.final.playable);
    const failed = results.filter((item) => !item.resolved.final.playable);

    return NextResponse.json({
      apiMode,
      playlistId,
      playlistName: detail.name,
      totalTested: results.length,
      playable: playable.length,
      failed: failed.length,
      stats,
      diagnosis:
        results.length === 0
          ? {
              hasCookie: Boolean(cookie),
              cookiePassedToSongUrl: Boolean(cookie),
              playlistTracksEmpty: true,
              allUrlsNull: false,
              apiPackageCompatibility: apiMode === "package" ? "package_mode" : "remote_mode",
            }
          : playable.length === 0
            ? {
                hasCookie: Boolean(cookie),
                cookiePassedToSongUrl: Boolean(cookie),
                playlistTracksEmpty: false,
                allUrlsNull: failed.every((item) => item.resolved.final.reason === "no_url"),
                apiPackageCompatibility: apiMode === "package" ? "package_mode" : "remote_mode",
              }
            : null,
      playableSamples: playable.slice(0, 8).map(({ track, resolved }) => ({
        id: track.id,
        title: track.name,
        artist: track.artist,
        audioUrlPrefix: toAudioPrefix(resolved.final.audioUrl),
      })),
      failedSamples: failed.slice(0, 8).map(({ track, resolved }) => ({
        id: track.id,
        title: track.name,
        artist: track.artist,
        reason: resolved.final.reason,
        attempts: resolved.attempts,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to resolve NetEase playlist",
      },
      { status: 500 },
    );
  }
}
