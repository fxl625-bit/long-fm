import { createSign, randomUUID } from "node:crypto";
import { InMemoryTTLCache } from "@/lib/cache/in-memory-ttl-cache";
import { getNeteaseOfficialEnvStatus } from "@/lib/config/netease-official-env";
import type { MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail, ProviderStatus } from "@/lib/types/music";
import { buildNeteaseSongExternalUrl } from "@/lib/utils/external-links";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_GRACE_MS = 60_000;

type TokenPayload = {
  accessToken: string;
  expiresAt: number;
};

type NeteaseOfficialConfig = {
  appId: string;
  appSecret: string;
  privateKey: string;
  publicKey?: string;
  apiBaseUrl: string;
  timeoutMs: number;
  tokenPath: string;
  profilePath: string;
  playlistsPath: string;
  playlistDetailPath: string;
  likedSongsPath: string;
  searchPath: string;
  songDetailPath: string;
  playableUrlPath: string;
};

class ProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderError";
  }
}

function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function getString(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return fallback;
}

function getNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

function toEnergy(durationMs: number): MusicTrack["energyLevel"] {
  if (durationMs >= 280000) return "low";
  if (durationMs >= 240000) return "medium-low";
  if (durationMs >= 210000) return "medium";
  return "medium-high";
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export class NeteaseOfficialProvider implements MusicProvider {
  readonly providerName = "netease_official" as const;
  private readonly cache = new InMemoryTTLCache();
  private readonly config: NeteaseOfficialConfig;

  constructor(config?: Partial<NeteaseOfficialConfig>) {
    const officialEnv = getNeteaseOfficialEnvStatus();

    this.config = {
      appId: config?.appId ?? officialEnv.appId,
      appSecret: config?.appSecret ?? officialEnv.appSecret,
      privateKey: normalizePrivateKey(config?.privateKey ?? officialEnv.privateKey),
      publicKey: config?.publicKey ?? officialEnv.publicKey,
      apiBaseUrl: config?.apiBaseUrl ?? officialEnv.apiBaseUrl,
      timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      tokenPath: config?.tokenPath ?? officialEnv.tokenPath,
      profilePath: config?.profilePath ?? officialEnv.profilePath,
      playlistsPath: config?.playlistsPath ?? officialEnv.playlistsPath,
      playlistDetailPath: config?.playlistDetailPath ?? officialEnv.playlistDetailPath,
      likedSongsPath: config?.likedSongsPath ?? officialEnv.likedSongsPath,
      searchPath: config?.searchPath ?? officialEnv.searchPath,
      songDetailPath: config?.songDetailPath ?? officialEnv.songDetailPath,
      playableUrlPath: config?.playableUrlPath ?? officialEnv.playableUrlPath,
    };
  }

  getProviderStatus = async (): Promise<ProviderStatus> => {
    const health = await this.healthcheck();
    return {
      provider: this.providerName,
      status: health.status,
      message: health.message ?? "",
    };
  };

  async healthcheck(): Promise<MusicProviderHealth> {
    const officialEnv = getNeteaseOfficialEnvStatus();

    if (!officialEnv.enabled) {
      return {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: "网易云官方源未启用（NETEASE_OFFICIAL_ENABLED 不是 true）。",
      };
    }

    if (!officialEnv.configured) {
      return {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: `网易云官方配置不完整，缺少变量：${officialEnv.missingVariables.join(", ")}`,
      };
    }

    try {
      await this.getAccessToken();
      return {
        mode: this.providerName,
        available: true,
        status: "available",
        message: "网易云官方源可用。",
      };
    } catch (error) {
      return {
        mode: this.providerName,
        available: false,
        status: "degraded",
        message: error instanceof Error ? error.message : "网易云官方源连接失败。",
      };
    }
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    void input;
    return {
      ok: true,
      message: "Netease official provider uses app credentials on server side.",
    };
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const token = this.cache.get<TokenPayload>("netease_official:token");
      if (token && token.expiresAt - CACHE_GRACE_MS > Date.now()) {
        return token.accessToken;
      }
    }

    const tokenPayload = await this.fetchAccessToken();
    this.cache.set("netease_official:token", tokenPayload, Math.max(1_000, tokenPayload.expiresAt - Date.now()));
    return tokenPayload.accessToken;
  }

  async refreshAccessToken(): Promise<string> {
    return this.getAccessToken(true);
  }

  async getUserProfile(userToken?: string): Promise<MusicUserProfile> {
    const json = await this.request<Record<string, unknown>>(this.config.profilePath, {
      method: "GET",
      userToken,
    });

    const profile = (json.data as Record<string, unknown> | undefined) ?? json;

    return {
      id: getString(profile, ["id", "userId", "uid"], "official-user"),
      nickname: getString(profile, ["nickname", "name"], "网易云用户"),
      avatar: getString(profile, ["avatar", "avatarUrl", "avatar_url"]),
    };
  }

  async getUserPlaylists(userToken?: string): Promise<MusicPlaylist[]> {
    const json = await this.request<Record<string, unknown>>(this.config.playlistsPath, {
      method: "GET",
      userToken,
    });

    const list = asArray<Record<string, unknown>>((json.data as Record<string, unknown> | undefined)?.list ?? json.list ?? json.data);

    return list.map((item) => ({
      id: getString(item, ["id", "playlistId", "playlist_id"]),
      name: getString(item, ["name", "title"], "未命名歌单"),
      description: getString(item, ["description", "desc"]),
      coverUrl: getString(item, ["coverUrl", "cover", "coverImgUrl"]),
      isLikedPlaylist: Boolean(item.isLikedPlaylist ?? item.liked ?? item.specialType === 5),
      trackCount: getNumber(item, ["trackCount", "songCount", "song_count"]),
    }));
  }

  async getPlaylistDetail(playlistId: string, userToken?: string): Promise<PlaylistDetail> {
    const path = this.config.playlistDetailPath.replace("{playlistId}", encodeURIComponent(playlistId));
    const json = await this.request<Record<string, unknown>>(path, {
      method: "GET",
      userToken,
    });

    const detail = (json.data as Record<string, unknown> | undefined) ?? json;
    const tracks = asArray<Record<string, unknown>>(detail.tracks ?? detail.songs).map((item) => this.mapTrack(item));

    return {
      id: getString(detail, ["id", "playlistId", "playlist_id"], playlistId),
      name: getString(detail, ["name", "title"], "未命名歌单"),
      description: getString(detail, ["description", "desc"]),
      coverUrl: getString(detail, ["coverUrl", "cover", "coverImgUrl"]),
      isLikedPlaylist: Boolean(detail.isLikedPlaylist ?? detail.liked ?? detail.specialType === 5),
      trackCount: getNumber(detail, ["trackCount", "songCount", "song_count"], tracks.length),
      tracks,
    };
  }

  async getLikedSongs(userToken?: string): Promise<MusicTrack[]> {
    const json = await this.request<Record<string, unknown>>(this.config.likedSongsPath, {
      method: "GET",
      userToken,
    });

    const list = asArray<Record<string, unknown>>((json.data as Record<string, unknown> | undefined)?.songs ?? json.songs ?? json.data);
    return list.map((item) => this.mapTrack(item));
  }

  async searchSongs(query: string, userToken?: string): Promise<MusicTrack[]> {
    const json = await this.request<Record<string, unknown>>(this.config.searchPath, {
      method: "GET",
      userToken,
      query: { q: query, keyword: query, keywords: query },
    });

    const songs = asArray<Record<string, unknown>>(
      (json.data as Record<string, unknown> | undefined)?.songs ??
        (json.result as Record<string, unknown> | undefined)?.songs ??
        json.songs,
    );

    return songs.map((item) => this.mapTrack(item));
  }

  async getSongDetail(songId: string, userToken?: string): Promise<MusicTrack | null> {
    const path = this.config.songDetailPath.replace("{songId}", encodeURIComponent(songId));
    const json = await this.request<Record<string, unknown>>(path, {
      method: "GET",
      userToken,
    });

    const detail = (json.data as Record<string, unknown> | undefined) ?? json;
    if (!Object.keys(detail).length) {
      return null;
    }

    const track = this.mapTrack(detail);
    const playableUrl = await this.getPlayableUrl(track.id, userToken);

    if (playableUrl) {
      track.audioUrl = playableUrl;
      track.playableStatus = "playable";
    }

    return track;
  }

  async getLyrics(songId: string): Promise<string | null> {
    void songId;
    return null;
  }

  async getSongUrl(songId: string, userToken?: string): Promise<string | null> {
    return this.getPlayableUrl(songId, userToken);
  }

  async getPlayableUrl(songId: string, userToken?: string): Promise<string | null> {
    const path = this.config.playableUrlPath.replace("{songId}", encodeURIComponent(songId));

    try {
      const json = await this.request<Record<string, unknown>>(path, {
        method: "GET",
        userToken,
      });

      const data = (json.data as Record<string, unknown> | undefined) ?? json;
      return getString(data, ["url", "playUrl", "play_url"]) || null;
    } catch {
      return null;
    }
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string }> {
    return {
      id: `official-${Date.now()}`,
      name,
    };
  }

  async addTracksToPlaylist(_playlistId: string, _trackIds: string[]): Promise<{ success: boolean }> {
    void _playlistId;
    void _trackIds;
    return { success: false };
  }

  private async fetchAccessToken(): Promise<TokenPayload> {
    const timestamp = Date.now();
    const nonce = randomUUID().replace(/-/g, "");
    const payloadToSign = `appId=${this.config.appId}&timestamp=${timestamp}&nonce=${nonce}`;

    const signer = createSign("RSA-SHA256");
    signer.update(payloadToSign);
    signer.end();

    const signature = signer.sign(this.config.privateKey, "base64");

    const response = await this.request<Record<string, unknown>>(this.config.tokenPath, {
      method: "POST",
      authRequired: false,
      body: {
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        timestamp,
        nonce,
        signature,
        signType: "RSA",
        grantType: "client_credentials",
      },
    });

    const data = (response.data as Record<string, unknown> | undefined) ?? response;
    const accessToken = getString(data, ["accessToken", "access_token", "token"]);
    const expiresInSeconds = getNumber(data, ["expiresIn", "expires_in"], 7200);

    if (!accessToken) {
      throw new ProviderError("网易云官方 token 响应缺少 accessToken。", response);
    }

    return {
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
  }

  private mapTrack(item: Record<string, unknown>): MusicTrack {
    const songId = getString(item, ["id", "songId", "song_id"]);
    const durationMs = getNumber(item, ["durationMs", "duration", "dt"]);

    const artistsRaw = asArray<Record<string, unknown>>(item.artists ?? item.ar);
    const artist = artistsRaw.length
      ? artistsRaw.map((entry) => getString(entry, ["name", "artistName"], "未知歌手")).join(" / ")
      : getString(item, ["artist", "artistName"], "未知歌手");

    const album = (item.album as Record<string, unknown> | undefined) ?? (item.al as Record<string, unknown> | undefined) ?? {};

    return {
      id: songId,
      name: getString(item, ["name", "songName", "song_name"], "未命名歌曲"),
      artist,
      album: getString(album, ["name", "albumName", "album_name"]),
      duration: durationMs,
      durationMs,
      coverUrl: getString(album, ["coverUrl", "picUrl", "cover", "cover_url"]),
      audioUrl: undefined,
      externalUrl: buildNeteaseSongExternalUrl(songId),
      sourceType: "NETEASE_OFFICIAL",
      playableStatus: "metadata_only",
      energyLevel: toEnergy(durationMs),
      language: getString(item, ["language"], undefined),
      era: getString(item, ["era", "decade"], undefined),
      rawMeta: item,
    };
  }

  private async request<T extends Record<string, unknown>>(
    path: string,
    options: {
      method: "GET" | "POST";
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      authRequired?: boolean;
      userToken?: string;
    },
  ): Promise<T> {
    if (!this.config.apiBaseUrl) {
      throw new ProviderError("NETEASE_OFFICIAL_API_BASE_URL is not configured.");
    }

    const url = new URL(path, this.config.apiBaseUrl);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const authRequired = options.authRequired ?? true;
    const accessToken = authRequired ? options.userToken ?? (await this.getAccessToken()) : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          "X-App-Id": this.config.appId,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const json = text ? (JSON.parse(text) as T & { code?: number; message?: string; success?: boolean }) : ({} as T);

      if (!response.ok) {
        throw new ProviderError(`网易云官方请求失败: ${response.status}`);
      }

      if (typeof json.code === "number" && json.code >= 400) {
        throw new ProviderError(`网易云官方接口错误: ${json.code} ${json.message ?? ""}`);
      }

      if (json.success === false) {
        throw new ProviderError(`网易云官方接口返回失败: ${json.message ?? "unknown error"}`);
      }

      return json;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(`网易云官方请求异常: ${path}`, error);
    } finally {
      clearTimeout(timer);
    }
  }
}

