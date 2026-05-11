import { readServerEnvVar } from "@/lib/config/server-env";
import { NeteaseMusicProvider } from "@/lib/providers/music/netease-music-provider";
import type { MusicTrack, MusicUserProfile } from "@/lib/types/music";
import { extractNeteaseCookie } from "./netease-payload";
import { getNeteaseApiBaseUrl, resolveNeteaseApiMode, type NeteaseApiMode } from "./netease-api-mode";
import { extractSongUrl } from "./netease-playable-resolver";
import type { NeteaseQrSession, NeteaseQrStatus, NeteaseSongUrlResult } from "./netease-types";
import { classifyNeteaseSongPlayableStatus } from "./netease-url-resolver";

type QrCreateResponse = {
  data?: {
    unikey?: string;
    qrimg?: string;
    qrurl?: string;
  };
  unikey?: string;
  qrimg?: string;
  qrurl?: string;
};

type QrCheckResponse = {
  code?: number;
  cookie?: string;
  message?: string;
  data?: {
    cookie?: string;
  };
  body?: {
    cookie?: string;
  };
};

export class NeteaseClient {
  readonly provider: NeteaseMusicProvider;
  readonly baseUrl: string;
  readonly apiMode: NeteaseApiMode;

  constructor(baseUrl = getNeteaseApiBaseUrl()) {
    this.apiMode = resolveNeteaseApiMode();
    this.baseUrl = baseUrl;
    this.provider = new NeteaseMusicProvider({
      baseUrl,
      defaultCookie: readServerEnvVar("NETEASE_COOKIE"),
    });
  }

  async createQrSession(): Promise<NeteaseQrSession> {
    const keyPayload = await this.request<QrCreateResponse>("/login/qr/key", { timestamp: Date.now() });
    const qrKey = keyPayload.data?.unikey ?? keyPayload.unikey ?? "";
    if (!qrKey) {
      throw new Error("Failed to create NetEase QR key");
    }

    const qrPayload = await this.request<QrCreateResponse>("/login/qr/create", {
      key: qrKey,
      qrimg: true,
      timestamp: Date.now(),
    });

    const qrImageUrl = qrPayload.data?.qrimg ?? qrPayload.qrimg ?? "";
    const qrUrl = qrPayload.data?.qrurl ?? qrPayload.qrurl;
    if (!qrImageUrl) {
      throw new Error("Failed to create NetEase QR image");
    }

    return {
      qrKey,
      qrImageUrl,
      qrUrl,
    };
  }

  async checkQrSession(qrKey: string): Promise<{ status: NeteaseQrStatus; cookie?: string; message?: string }> {
    const response = await this.request<QrCheckResponse>("/login/qr/check", {
      key: qrKey,
      timestamp: Date.now(),
    });

    const statusMap: Record<number, NeteaseQrStatus> = {
      800: "expired",
      801: "pending",
      802: "scanned",
      803: "authorized",
    };

    return {
      status: statusMap[response.code ?? 801] ?? "pending",
      cookie: extractNeteaseCookie(response),
      message: response.message,
    };
  }

  async getLoginProfile(cookie: string): Promise<MusicUserProfile> {
    return this.provider.getUserProfile(cookie);
  }

  async getLoginStatus(cookie: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/login/status", { cookie });
  }

  async getUserDetail(userId: string, cookie: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/user/detail", {
      uid: userId,
      cookie,
    });
  }

  async getSongUrlV1Raw(songId: string, cookie: string, level: "standard" | "higher" | "exhigh" = "standard") {
    return this.request<Record<string, unknown>>("/song/url/v1", {
      id: songId,
      level,
      cookie,
    });
  }

  async getSongUrlRaw(songId: string, cookie: string, br = 128000) {
    return this.request<Record<string, unknown>>("/song/url", {
      id: songId,
      br,
      cookie,
    });
  }

  async getUserPlaylists(cookie: string) {
    return this.provider.getUserPlaylists(cookie);
  }

  async getPlaylistDetail(playlistId: string, cookie: string) {
    return this.provider.getPlaylistDetail(playlistId, cookie);
  }

  async getLikedSongs(cookie: string) {
    return this.provider.getLikedSongs(cookie);
  }

  async getLyrics(songId: string, cookie: string) {
    return this.provider.getLyrics(songId, cookie);
  }

  async searchSongs(query: string, cookie: string) {
    return this.provider.searchSongs(query, cookie);
  }

  async getSongDetail(songId: string, cookie: string) {
    return this.provider.getSongDetail(songId, cookie);
  }

  async resolveSongUrl(songId: string, songMeta: Record<string, unknown> | undefined, cookie: string): Promise<NeteaseSongUrlResult> {
    const attempts = [
      () => this.getSongUrlV1Raw(songId, cookie, "exhigh"),
      () => this.getSongUrlV1Raw(songId, cookie, "standard"),
      () => this.getSongUrlRaw(songId, cookie, 128000),
    ];

    let lastRaw: unknown = undefined;
    for (const attempt of attempts) {
      try {
        const raw = await attempt();
        lastRaw = raw;
        const candidate = extractSongUrl(raw);
        const classification = classifyNeteaseSongPlayableStatus({
          url: candidate?.url,
          songMeta,
          raw: candidate?.raw ?? raw,
        });

        if (classification.playableStatus === "playable" && candidate?.url) {
          return {
            songId,
            url: candidate.url,
            br: candidate.br,
            type: candidate.type,
            playableStatus: "playable",
            reason: classification.reason,
            raw,
          };
        }
      } catch (error) {
        lastRaw = {
          error: error instanceof Error ? error.message : "unknown",
        };
      }
    }

    const classification = classifyNeteaseSongPlayableStatus({
      url: undefined,
      songMeta,
      raw: lastRaw,
    });

    return {
      songId,
      playableStatus: classification.playableStatus,
      reason: classification.reason,
      raw: lastRaw,
    };
  }

  private async request<T extends Record<string, unknown>>(path: string, query: Record<string, unknown>) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`NetEase API request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

export function toNeteaseSongMeta(track: MusicTrack): Record<string, unknown> | undefined {
  return track.rawMeta && typeof track.rawMeta === "object" ? (track.rawMeta as Record<string, unknown>) : undefined;
}
