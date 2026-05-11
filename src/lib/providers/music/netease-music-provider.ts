import { InMemoryTTLCache } from "@/lib/cache/in-memory-ttl-cache";
import { extractNeteaseAccount, extractNeteaseProfile } from "@/lib/providers/netease/netease-payload";
import type { MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail } from "@/lib/types/music";
import { buildNeteaseSongExternalUrl } from "@/lib/utils/external-links";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

const DEFAULT_TIMEOUT_MS = 8000;
const FIVE_MINUTES = 5 * 60 * 1000;
const NETEASE_PUBLIC_BASE_URL = "https://music.163.com";

class ProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderError";
  }
}

function toEnergy(duration: number): MusicTrack["energyLevel"] {
  if (duration >= 280000) return "low";
  if (duration >= 240000) return "medium-low";
  if (duration >= 210000) return "medium";
  return "medium-high";
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export class NeteaseMusicProvider implements MusicProvider {
  readonly providerName = "netease_experimental" as const;
  private readonly cache = new InMemoryTTLCache();

  constructor(
    private readonly config: {
      baseUrl: string;
      defaultCookie?: string;
      timeoutMs?: number;
    },
  ) {}

  async healthcheck(): Promise<MusicProviderHealth> {
    try {
      await this.request("/login/status");
      return {
        mode: this.providerName,
        available: true,
        status: "degraded",
        message: "网易云实验源可访问，稳定性取决于第三方接口。",
      };
    } catch (error) {
      return {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: error instanceof Error ? error.message : "网易云实验源不可用",
      };
    }
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    if (input.cookie) {
      return {
        ok: true,
        message: "Cookie 会话已接收。",
        session: { cookie: input.cookie },
      };
    }

    return {
      ok: false,
      message: "实验模式仅支持通过 Cookie 接入。",
    };
  }

  async getUserProfile(userToken?: string): Promise<MusicUserProfile> {
    const cacheKey = `netease:user:${userToken ?? "default"}`;
    const cached = this.cache.get<MusicUserProfile>(cacheKey);
    if (cached) return cached;

    const response = await this.request<Record<string, unknown>>("/login/status", { cookie: userToken });
    let profile = extractNeteaseProfile(response);
    const account = extractNeteaseAccount(response);

    if (!profile && account?.id) {
      const detail = await this.request<Record<string, unknown>>("/user/detail", {
        uid: account.id,
        cookie: userToken,
      });
      profile = extractNeteaseProfile(detail);
    }

    if (!profile && account?.id) {
      profile = {
        id: account.id,
        nickname: "NetEase User",
        avatar: undefined,
      };
    }

    if (!profile) {
      throw new ProviderError("Failed to resolve NetEase user identity: missing profile and account.id");
    }

    this.cache.set(cacheKey, profile, FIVE_MINUTES);
    return profile;
  }

  async getUserPlaylists(userToken?: string): Promise<MusicPlaylist[]> {
    const profile = await this.getUserProfile(userToken);
    const cacheKey = `netease:playlists:${profile.id}`;
    const cached = this.cache.get<MusicPlaylist[]>(cacheKey);
    if (cached) return cached;

    const response = await this.request<{ playlist?: Array<Record<string, unknown>> }>("/user/playlist", {
      uid: profile.id,
      cookie: userToken,
    });

    const playlists = (response.playlist ?? []).map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "未命名歌单"),
      description: String(item.description ?? ""),
      coverUrl: String(item.coverImgUrl ?? ""),
      isLikedPlaylist: Boolean(item.specialType === 5),
      trackCount: Number(item.trackCount ?? 0),
    }));

    this.cache.set(cacheKey, playlists, FIVE_MINUTES);
    return playlists;
  }

  async getPlaylistDetail(playlistId: string, userToken?: string): Promise<PlaylistDetail> {
    const cacheKey = `netease:playlist:${playlistId}`;
    const cached = this.cache.get<PlaylistDetail>(cacheKey);
    if (cached) return cached;

    const detail = await this.fetchPlaylistDetailWithFallback(playlistId, userToken);
    this.cache.set(cacheKey, detail, FIVE_MINUTES);
    return detail;
  }

  async getLikedSongs(userToken?: string): Promise<MusicTrack[]> {
    const profile = await this.getUserProfile(userToken);
    const likedIdsResp = await this.request<{ ids?: number[] }>("/likelist", {
      uid: profile.id,
      cookie: userToken,
    });
    const ids = likedIdsResp.ids ?? [];
    if (!ids.length) return [];

    const batch = ids.slice(0, 200).join(",");
    const details = await this.request<{ songs?: Array<Record<string, unknown>> }>("/song/detail", {
      ids: batch,
      cookie: userToken,
    });
    return (details.songs ?? []).map((item) => this.mapTrack(item));
  }

  async searchSongs(query: string, userToken?: string): Promise<MusicTrack[]> {
    const response = await this.request<{ result?: { songs?: Array<Record<string, unknown>> } }>("/cloudsearch", {
      keywords: query,
      type: 1,
      limit: 20,
      cookie: userToken,
    });
    return (response.result?.songs ?? []).map((item) => this.mapTrack(item));
  }

  async getSongDetail(songId: string, userToken?: string): Promise<MusicTrack | null> {
    const response = await this.request<{ songs?: Array<Record<string, unknown>> }>("/song/detail", {
      ids: songId,
      cookie: userToken,
    });
    const first = response.songs?.[0];
    return first ? this.mapTrack(first) : null;
  }

  async getLyrics(songId: string, userToken?: string): Promise<string | null> {
    const response = await this.request<{ lrc?: { lyric?: string } }>("/lyric", {
      id: songId,
      cookie: userToken,
    });
    return response.lrc?.lyric ?? null;
  }

  async getSongUrl(songId: string, userToken?: string): Promise<string | null> {
    const response = await this.request<{ data?: Array<{ url?: string | null }> }>("/song/url/v1", {
      id: songId,
      level: "standard",
      cookie: userToken,
    });
    return response.data?.[0]?.url ?? null;
  }

  async createPlaylist(name: string, userToken?: string): Promise<{ id: string; name: string }> {
    const response = await this.request<{ id?: number; playlist?: { id?: number; name?: string } }>("/playlist/create", {
      name,
      cookie: userToken,
    });
    const id = String(response.playlist?.id ?? response.id ?? "");
    if (!id) throw new ProviderError("创建歌单失败");
    return { id, name: response.playlist?.name ?? name };
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[], userToken?: string): Promise<{ success: boolean }> {
    if (!trackIds.length) return { success: true };
    await this.request("/playlist/tracks", {
      op: "add",
      pid: playlistId,
      tracks: trackIds.join(","),
      cookie: userToken,
    });
    return { success: true };
  }

  private async fetchPlaylistDetailWithFallback(playlistId: string, userToken?: string): Promise<PlaylistDetail> {
    try {
      const response = await this.request<{ playlist?: Record<string, unknown> }>("/playlist/detail", {
        id: playlistId,
        cookie: userToken,
      });

      const playlist = response.playlist;
      if (!playlist) {
        throw new ProviderError(`获取歌单详情失败: ${playlistId}`);
      }

      const tracksRaw = asArray<Record<string, unknown>>(playlist.tracks);
      const tracks = tracksRaw.map((item) => this.mapTrack(item));

      return {
        id: String(playlist.id ?? playlistId),
        name: String(playlist.name ?? "未命名歌单"),
        description: String(playlist.description ?? ""),
        coverUrl: String(playlist.coverImgUrl ?? ""),
        tracks,
        isLikedPlaylist: Boolean(playlist.specialType === 5),
        trackCount: Number(playlist.trackCount ?? tracks.length),
      };
    } catch {
      return this.fetchPlaylistDetailFromPublicApi(playlistId);
    }
  }

  private async fetchPlaylistDetailFromPublicApi(playlistId: string): Promise<PlaylistDetail> {
    const response = await this.requestPublic<{ playlist?: Record<string, unknown> }>("/api/v6/playlist/detail", {
      id: playlistId,
      s: 0,
    });

    const playlist = response.playlist;
    if (!playlist) {
      throw new ProviderError(`公共接口获取歌单失败: ${playlistId}`);
    }

    const rawTrackIds = asArray<Record<string, unknown> | number | string>(playlist.trackIds);
    const trackIds = rawTrackIds
      .map((item) => {
        if (typeof item === "number") return item;
        if (typeof item === "string") return toFiniteNumber(item);
        return toFiniteNumber(item.id);
      })
      .filter((id) => id > 0);

    const tracks: MusicTrack[] = [];
    const batchSize = 100;

    for (let index = 0; index < trackIds.length; index += batchSize) {
      const batch = trackIds.slice(index, index + batchSize);
      if (!batch.length) continue;

      const details = await this.requestPublic<{ songs?: Array<Record<string, unknown>> }>("/api/song/detail", {
        ids: `[${batch.join(",")}]`,
      });

      const songs = asArray<Record<string, unknown>>(details.songs);
      tracks.push(...songs.map((item) => this.mapTrack(item)));
    }

    if (!tracks.length) {
      const inlineTracks = asArray<Record<string, unknown>>(playlist.tracks);
      tracks.push(...inlineTracks.map((item) => this.mapTrack(item)));
    }

    return {
      id: String(playlist.id ?? playlistId),
      name: String(playlist.name ?? "未命名歌单"),
      description: String(playlist.description ?? ""),
      coverUrl: String(playlist.coverImgUrl ?? ""),
      tracks,
      isLikedPlaylist: Boolean(playlist.specialType === 5),
      trackCount: Number(playlist.trackCount ?? tracks.length),
    };
  }

  private mapTrack(item: Record<string, unknown>): MusicTrack {
    const artists = asArray<Record<string, unknown>>(item.ar).length
      ? asArray<Record<string, unknown>>(item.ar).map((artist) => String(artist.name ?? "")).filter(Boolean)
      : asArray<Record<string, unknown>>(item.artists).map((artist) => String(artist.name ?? "")).filter(Boolean);

    const album = ((item.al as Record<string, unknown> | undefined) ??
      (item.album as Record<string, unknown> | undefined) ??
      {}) as Record<string, unknown>;

    const duration = Number(item.dt ?? item.duration ?? 0);
    const songId = String(item.id ?? "");

    return {
      id: songId,
      name: String(item.name ?? "未命名歌曲"),
      artist: artists.join(" / ") || "未知歌手",
      album: String(album.name ?? ""),
      duration,
      durationMs: duration,
      coverUrl: String(album.picUrl ?? ""),
      audioUrl: undefined,
      externalUrl: buildNeteaseSongExternalUrl(songId),
      sourceType: "NETEASE_EXPERIMENTAL",
      playableStatus: "external_only",
      energyLevel: toEnergy(duration),
      rawMeta: {
        source: "netease_experimental",
        songId,
      },
    };
  }

  private async request<T extends Record<string, unknown>>(
    path: string,
    query: Record<string, unknown> = {},
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
          Cookie: String(query.cookie ?? this.config.defaultCookie ?? ""),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderError(`网易云请求失败: ${response.status}`);
      }

      const json = (await response.json()) as T & { code?: number; message?: string };
      if (typeof json.code === "number" && json.code >= 400) {
        throw new ProviderError(`网易云接口错误: ${json.code} ${json.message ?? ""}`);
      }

      return json;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`网易云请求异常: ${path}`, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestPublic<T extends Record<string, unknown>>(
    path: string,
    query: Record<string, unknown> = {},
  ): Promise<T> {
    const url = new URL(path, NETEASE_PUBLIC_BASE_URL);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Referer: "https://music.163.com/",
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderError(`网易云公共接口失败: ${response.status}`);
      }

      const json = (await response.json()) as T & { code?: number; message?: string };
      if (typeof json.code === "number" && json.code >= 400) {
        throw new ProviderError(`网易云公共接口错误: ${json.code} ${json.message ?? ""}`);
      }

      return json;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`网易云公共接口异常: ${path}`, error);
    } finally {
      clearTimeout(timer);
    }
  }
}


