import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import { NeteaseOfficialProvider } from "@/lib/providers/music/netease-official-provider";
import { NeteaseMusicProvider } from "@/lib/providers/music/netease-music-provider";
import { readServerEnvVar } from "@/lib/config/server-env";
import { NeteasePlayableService } from "@/lib/providers/netease/netease-playable-service";

function sortByTrackCount<T extends { trackCount?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.trackCount ?? 0) - (a.trackCount ?? 0));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(300, Number(body?.limit ?? "100") || 100));
    const maxPlaylists = Math.max(1, Math.min(10, Number(body?.maxPlaylists ?? "5") || 5));
    const level = body?.level === "higher" || body?.level === "exhigh" ? body.level : "standard";

    const provider = readServerEnvVar("MUSIC_PROVIDER") ?? "";
    const isOfficial = provider === "netease_official";
    const neteaseBaseUrl = readServerEnvVar("NETEASE_API_BASE_URL") ?? "http://localhost:3001";
    const neteaseCookie = readServerEnvVar("NETEASE_COOKIE") ?? "";

    const { providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim() || neteaseCookie;

    let playlistIds: string[] = [];

    if (isOfficial) {
      const official = new NeteaseOfficialProvider();
      try {
        const playlists = await official.getUserPlaylists();
        playlistIds = sortByTrackCount(playlists.filter((p) => !p.isLikedPlaylist))
          .slice(0, maxPlaylists)
          .map((p) => p.id);
        if (!playlistIds.length) {
          const liked = playlists.find((p) => p.isLikedPlaylist);
          if (liked) playlistIds = [liked.id];
        }
      } catch {
        const experimental = new NeteaseMusicProvider({ baseUrl: neteaseBaseUrl, defaultCookie: cookie });
        const playlists = await experimental.getUserPlaylists(cookie);
        playlistIds = sortByTrackCount(playlists.filter((p) => !p.isLikedPlaylist))
          .slice(0, maxPlaylists)
          .map((p) => p.id);
      }
    } else {
      const experimental = new NeteaseMusicProvider({ baseUrl: neteaseBaseUrl, defaultCookie: cookie });
      const playlists = await experimental.getUserPlaylists(cookie);
      playlistIds = sortByTrackCount(playlists.filter((p) => !p.isLikedPlaylist))
        .slice(0, maxPlaylists)
        .map((p) => p.id);
    }

    if (!playlistIds.length) {
      return NextResponse.json(
        { ok: false, message: "No playlists found. Please create or import playlists in NetEase Cloud Music." },
        { status: 404 },
      );
    }

    const service = new NeteasePlayableService();
    const result = await service.buildPlayableQueueFromIds(playlistIds, { limit, level });

    return NextResponse.json({
      ok: true,
      ...result,
      playlistCount: playlistIds.length,
      sourcePlaylistIds: playlistIds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to build NetEase library",
      },
      { status: 500 },
    );
  }
}
