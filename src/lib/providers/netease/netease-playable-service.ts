import { getCurrentNeteaseSession } from "./netease-auth";
import { NeteaseClient } from "./netease-client";
import { resolveOneSongUrlWithDiagnostics, type ResolveOneDiagnostics, type ResolveOneFailureReason } from "./netease-url-diagnostics";
import type { MusicTrack } from "@/lib/types/music";

export type NeteaseTrack = MusicTrack & {
  neteaseId: string;
  sourceType: "NETEASE_EXPERIMENTAL";
  playableStatus: "playable" | "vip_only" | "no_url" | "copyright_unavailable" | "unknown";
};

export type FailedTrack = {
  id: string;
  neteaseId: string;
  title: string;
  artist: string;
  reason: "no_url" | "vip_only" | "copyright_unavailable" | "api_error";
  raw?: unknown;
};

export type RadioTrack = {
  id: string;
  neteaseId: string;
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  durationMs?: number;
  audioUrl: string;
  sourceType: "netease";
  playableStatus: "playable";
};

export type BuildQueueResult = {
  playlistId: string;
  playlistName: string;
  tracksTotal: number;
  playableTracks: RadioTrack[];
  failedTracks: FailedTrack[];
  stats: {
    total: number;
    playable: number;
    failed: number;
    noUrl: number;
    vipOnly: number;
    copyrightUnavailable: number;
    apiError: number;
  };
};

type TrackLoaderResult = {
  playlistId: string;
  playlistName: string;
  tracks: NeteaseTrack[];
};

type ServiceOptions = {
  client?: NeteaseClient;
  cookieResolver?: () => Promise<string>;
  trackLoader?: (playlistId: string, limit?: number) => Promise<TrackLoaderResult>;
  resolver?: (track: NeteaseTrack, cookie: string, level: "standard" | "higher" | "exhigh") => Promise<ResolveOneDiagnostics>;
};

function mapToNeteaseTrack(track: MusicTrack): NeteaseTrack {
  return {
    ...track,
    neteaseId: String((track.rawMeta as Record<string, unknown> | undefined)?.providerTrackId ?? track.id),
    sourceType: "NETEASE_EXPERIMENTAL",
    playableStatus:
      track.playableStatus === "playable" ||
      track.playableStatus === "vip_only" ||
      track.playableStatus === "no_url" ||
      track.playableStatus === "copyright_unavailable" ||
      track.playableStatus === "unknown"
        ? track.playableStatus
        : "unknown",
  };
}

function mapFailedReason(reason: ResolveOneFailureReason | null): FailedTrack["reason"] {
  if (reason === "vip_only") return "vip_only";
  if (reason === "copyright_unavailable") return "copyright_unavailable";
  if (reason === "no_url") return "no_url";
  return "api_error";
}

function createStats(total: number): BuildQueueResult["stats"] {
  return {
    total,
    playable: 0,
    failed: 0,
    noUrl: 0,
    vipOnly: 0,
    copyrightUnavailable: 0,
    apiError: 0,
  };
}

function mapToRadioTrack(track: NeteaseTrack, audioUrl: string): RadioTrack {
  return {
    id: track.id,
    neteaseId: track.neteaseId,
    providerTrackId: track.neteaseId,
    title: track.name,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs ?? track.duration,
    audioUrl,
    sourceType: "netease",
    playableStatus: "playable",
  };
}

function isRadioTrack(track: RadioTrack | FailedTrack): track is RadioTrack {
  return "audioUrl" in track;
}

export class NeteasePlayableService {
  private readonly client: NeteaseClient;
  private readonly cookieResolver: () => Promise<string>;
  private readonly trackLoader: (playlistId: string, limit?: number) => Promise<TrackLoaderResult>;
  private readonly resolver: (track: NeteaseTrack, cookie: string, level: "standard" | "higher" | "exhigh") => Promise<ResolveOneDiagnostics>;

  constructor(options: ServiceOptions = {}) {
    this.client = options.client ?? new NeteaseClient();
    this.cookieResolver =
      options.cookieResolver ??
      (async () => {
        const { providerSession } = await getCurrentNeteaseSession();
        return providerSession?.cookie?.trim() ?? "";
      });
    this.trackLoader =
      options.trackLoader ??
      (async (playlistId: string, limit = 100) => {
        const cookie = await this.cookieResolver();
        if (!cookie) {
          throw new Error("NetEase cookie is missing");
        }
        const detail = await this.client.getPlaylistDetail(playlistId, cookie);
        return {
          playlistId: detail.id,
          playlistName: detail.name,
          tracks: detail.tracks.slice(0, limit).map(mapToNeteaseTrack),
        };
      });
    this.resolver =
      options.resolver ??
      (async (track, cookie, _level) => {
        void _level;
        return resolveOneSongUrlWithDiagnostics({
          songId: track.neteaseId,
          cookie,
          client: {
            getSongUrlV1Raw: (songId, requestCookie, requestLevel) =>
              this.client.getSongUrlV1Raw(songId, requestCookie, requestLevel),
            getSongUrlRaw: (songId, requestCookie, br) => this.client.getSongUrlRaw(songId, requestCookie, br),
            getSongDetail: (songId, requestCookie) => this.client.getSongDetail(songId, requestCookie),
          },
          apiMode: this.client.apiMode,
        });
      });
  }

  async getPlaylistTracks(playlistId: string, limit = 100): Promise<NeteaseTrack[]> {
    const detail = await this.trackLoader(playlistId, limit);
    return detail.tracks;
  }

  async resolveTrackUrl(track: NeteaseTrack, level: "standard" | "higher" | "exhigh" = "standard"): Promise<RadioTrack | FailedTrack> {
    const cookie = await this.cookieResolver();
    if (!cookie) {
      return {
        id: track.id,
        neteaseId: track.neteaseId,
        title: track.name,
        artist: track.artist,
        reason: "api_error",
      };
    }

    const result = await this.resolver(track, cookie, level);
    if (result.final.playable && result.final.audioUrl) {
      return mapToRadioTrack(track, result.final.audioUrl);
    }

    return {
      id: track.id,
      neteaseId: track.neteaseId,
      title: track.name,
      artist: track.artist,
      reason: mapFailedReason(result.final.reason),
      raw: result.debug.sampleRaw,
    };
  }

  async buildPlayableQueue(
    playlistId: string,
    options: {
      limit?: number;
      level?: "standard" | "higher" | "exhigh";
    } = {},
  ): Promise<BuildQueueResult> {
    return this.buildPlayableQueueFromIds([playlistId], options);
  }

  async buildPlayableQueueFromIds(
    playlistIds: string[],
    options: {
      limit?: number;
      level?: "standard" | "higher" | "exhigh";
    } = {},
  ): Promise<BuildQueueResult> {
    const limit = options.limit ?? 100;
    const perPlaylistLimit = Math.max(30, Math.ceil(limit / Math.max(1, playlistIds.length)));

    const allTracks: NeteaseTrack[] = [];
    const seenIds = new Set<string>();
    let playlistName = "";

    for (const pid of playlistIds) {
      const detail = await this.trackLoader(pid, perPlaylistLimit);
      if (!playlistName) playlistName = detail.playlistName;
      for (const track of detail.tracks) {
        const key = track.neteaseId || track.id;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        allTracks.push(track);
      }
    }

    // Shuffle for variety across playlists
    for (let i = allTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTracks[i], allTracks[j]] = [allTracks[j], allTracks[i]];
    }

    const selected = allTracks.slice(0, limit);
    const stats = createStats(selected.length);
    const playableTracks: RadioTrack[] = [];
    const failedTracks: FailedTrack[] = [];

    for (const track of selected) {
      const resolved = await this.resolveTrackUrl(track, options.level ?? "standard");
      if (isRadioTrack(resolved)) {
        playableTracks.push(resolved);
        stats.playable += 1;
        continue;
      }

      failedTracks.push(resolved);
      stats.failed += 1;
      if (resolved.reason === "no_url") stats.noUrl += 1;
      else if (resolved.reason === "vip_only") stats.vipOnly += 1;
      else if (resolved.reason === "copyright_unavailable") stats.copyrightUnavailable += 1;
      else stats.apiError += 1;
    }

    const nameSuffix = playlistIds.length > 1 ? ` +${playlistIds.length - 1} 个歌单` : "";
    return {
      playlistId: playlistIds[0],
      playlistName: playlistName ? `${playlistName}${nameSuffix}` : "多歌单合并",
      tracksTotal: selected.length,
      playableTracks,
      failedTracks,
      stats,
    };
  }
}
