import { prisma } from "@/lib/db/prisma";
import { NeteaseClient } from "./netease-client";
import { getNeteaseSessionForUser } from "./netease-auth";
import { syncLibraryFromProvider } from "@/lib/repositories/music-sync-repository";
import { ProviderType, type Track as DbTrack } from "@prisma/client";
import { resolvePlayableTracksWithNetease, summarizeResolveResult, type ResolveResult } from "./netease-playable-resolver";
import type { MusicTrack } from "@/lib/types/music";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";

function dedupeTracks(tracks: DbTrack[]) {
  const seen = new Set<string>();
  const output: DbTrack[] = [];
  for (const track of tracks) {
    const key = `${track.source}:${track.providerTrackId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(track);
  }
  return output;
}

async function resolveConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.all(chunk.map(worker))));
  }
  return results;
}

export function shouldRefreshNeteaseLibrary(input: {
  playlistCount: number;
  trackCount: number;
  likedPlaylistTrackCount: number;
}) {
  if (input.playlistCount <= 0) {
    return true;
  }

  if (input.trackCount <= 0) {
    return true;
  }

  return input.likedPlaylistTrackCount <= 0;
}

export class NeteasePlayerProvider {
  private lastResolveReport: ResolveResult | null = null;

  constructor(private readonly client = new NeteaseClient()) {}

  async ensureLibrarySynced(userId: string, cookie: string) {
    const [playlistCount, trackCount, likedPlaylist] = await Promise.all([
      prisma.playlist.count({
        where: {
          userId,
          source: ProviderType.NETEASE,
        },
      }),
      prisma.track.count({
        where: {
          source: ProviderType.NETEASE,
          playlists: {
            some: {
              playlist: {
                userId,
                source: ProviderType.NETEASE,
              },
            },
          },
        },
      }),
      prisma.playlist.findFirst({
        where: {
          userId,
          source: ProviderType.NETEASE,
          isLikedPlaylist: true,
        },
        select: {
          _count: {
            select: {
              tracks: true,
            },
          },
        },
      }),
    ]);

    const shouldSync = shouldRefreshNeteaseLibrary({
      playlistCount,
      trackCount,
      likedPlaylistTrackCount: likedPlaylist?._count.tracks ?? 0,
    });

    if (!shouldSync) {
      return null;
    }

    return syncLibraryFromProvider(userId, this.client.provider, cookie);
  }

  async buildPlayableTracksForUser(userId: string, limit = 48): Promise<MusicTrack[]> {
    const result = await this.buildPlayableTracksReportForUser(userId, limit);
    return result.playableTracks;
  }

  getLastResolveReport() {
    return this.lastResolveReport;
  }

  async buildPlayableTracksReportForUser(userId: string, limit = 48): Promise<ResolveResult> {
    const session = await getNeteaseSessionForUser(userId);
    const cookie = session?.cookie?.trim();
    if (!cookie) {
      const emptyReport: ResolveResult = {
        playableTracks: [],
        failedTracks: [],
        stats: {
          total: 0,
          playable: 0,
          noUrl: 0,
          vipOnly: 0,
          copyrightUnavailable: 0,
          apiError: 0,
          unknown: 0,
        },
        usedSearchFallback: false,
        progress: {
          current: 0,
          total: 0,
        },
      };
      this.lastResolveReport = emptyReport;
      return emptyReport;
    }

    await this.ensureLibrarySynced(userId, cookie);

    const playlists = await prisma.playlist.findMany({
      where: {
        userId,
        source: ProviderType.NETEASE,
      },
      include: {
        tracks: {
          include: {
            track: true,
          },
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
      orderBy: [{ isLikedPlaylist: "desc" }, { updatedAt: "desc" }],
      take: 4,
    });

    const candidateDbTracks = dedupeTracks(
      playlists.flatMap((playlist) => playlist.tracks.map((item) => item.track)).slice(0, Math.max(limit * 2, 80)),
    ).slice(0, limit);

    const candidateTracks = candidateDbTracks.map(mapDbTrackToMusicTrack);
    const resolverClient = {
      resolveSongUrl: (songId: string, songMeta?: Record<string, unknown>, requestCookie?: string) =>
        this.client.resolveSongUrl(songId, songMeta, requestCookie ?? cookie),
      searchSongs: (query: string, requestCookie?: string) => this.client.searchSongs(query, requestCookie ?? cookie),
    };
    const report = await resolvePlayableTracksWithNetease(candidateTracks, resolverClient, {
      cookie,
      allowSearchFallback: true,
    });

    await resolveConcurrent(candidateDbTracks, 6, async (dbTrack) => {
      const playable = report.playableTracks.find((track) => track.id === dbTrack.id || track.rawMeta?.replacementFor === dbTrack.id);
      const lyric =
        playable?.playableStatus === "playable" && playable.id === dbTrack.id
          ? await this.client.getLyrics(dbTrack.providerTrackId, cookie).catch(() => null)
          : null;

      await prisma.track.update({
        where: { id: dbTrack.id },
        data: {
          audioUrl: playable?.id === dbTrack.id ? playable.audioUrl : dbTrack.audioUrl,
          playableStatus: playable?.id === dbTrack.id ? playable.playableStatus : dbTrack.playableStatus,
          lyrics: lyric ?? dbTrack.lyrics,
          rawMeta: ((playable?.rawMeta as Record<string, unknown> | undefined) ?? (dbTrack.rawMeta as Record<string, unknown> | null) ?? undefined) as never,
        },
      });
      return null;
    });

    this.lastResolveReport = report;
    console.debug?.("[netease] resolve summary", summarizeResolveResult(report));
    return report;
  }
}
