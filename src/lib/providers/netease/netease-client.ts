import { readServerEnvVar } from "@/lib/config/server-env";
import { NeteaseMusicProvider } from "@/lib/providers/music/netease-music-provider";
import type { MusicTrack, MusicUserProfile } from "@/lib/types/music";
import { extractNeteaseCookie } from "./netease-payload";
import { getNeteaseApiBaseUrl, getInstalledNeteaseApiPackage, resolveNeteaseApiMode, type NeteaseApiMode } from "./netease-api-mode";
import { extractSongUrl } from "./netease-playable-resolver";
import type { NeteaseQrSession, NeteaseQrStatus, NeteaseSongUrlResult } from "./netease-types";
import { classifyNeteaseSongPlayableStatus } from "./netease-url-resolver";

// Map URL paths to package function names
// e.g. /login/qr/key -> login_qr_key
function pathToFnName(path: string): string {
  return path.replace(/^\/+/, "").replace(/\//g, "_");
}

type PackageApiFn = (params?: Record<string, unknown>) => Promise<{
  status: number;
  body: Record<string, unknown>;
  cookie?: string;
}>;

export class NeteaseClient {
  readonly provider: NeteaseMusicProvider;
  readonly baseUrl: string;
  readonly apiMode: NeteaseApiMode;
  private pkgApi: Record<string, PackageApiFn> | null = null;

  constructor(baseUrl = getNeteaseApiBaseUrl()) {
    this.apiMode = resolveNeteaseApiMode();
    this.baseUrl = baseUrl;
    this.provider = new NeteaseMusicProvider({
      baseUrl,
      defaultCookie: readServerEnvVar("NETEASE_COOKIE"),
    });
    if (this.apiMode === "package") {
      const pkgName = getInstalledNeteaseApiPackage();
      if (pkgName) {
        try {
          this.pkgApi = require(pkgName) as Record<string, PackageApiFn>;
        } catch (e) {
          console.warn("[netease] Failed to load package, falling back to HTTP:", (e as Error).message);
        }
      }
    }
  }

  async createQrSession(): Promise<NeteaseQrSession> {
    const keyResult = await this.callApi("login_qr_key", {});
    const keyBody: Record<string, unknown> = (keyResult?.body ?? {}) as Record<string, unknown>;
    const keyData = (keyBody.data ?? keyBody) as Record<string, unknown>;
    const qrKey = (keyData.unikey as string) || "";
    if (!qrKey) throw new Error("Failed to create NetEase QR key");

    const qrResult = await this.callApi("login_qr_create", { key: qrKey, qrimg: true });
    const qrBody: Record<string, unknown> = (qrResult?.body ?? {}) as Record<string, unknown>;
    const qrData = (qrBody.data ?? qrBody) as Record<string, unknown>;
    const qrImageUrl = (qrData.qrimg as string) || "";
    if (!qrImageUrl) throw new Error("Failed to create NetEase QR image");

    return {
      qrKey,
      qrImageUrl,
      qrUrl: (qrData.qrurl as string) || "",
    };
  }

  async checkQrSession(qrKey: string): Promise<{ status: NeteaseQrStatus; cookie?: string; message?: string }> {
    const result = await this.callApi("login_qr_check", { key: qrKey, timestamp: Date.now() });
    const body: Record<string, unknown> = (result?.body ?? {}) as Record<string, unknown>;
    const code: number = (body.code ?? (body.data as Record<string, unknown> | undefined)?.code ?? 801) as number;

    const statusMap: Record<number, NeteaseQrStatus> = {
      800: "expired", 801: "pending", 802: "scanned", 803: "authorized",
    };

    return {
      status: statusMap[code] ?? "pending",
      cookie: (result?.cookie as string) || extractNeteaseCookie(body),
      message: (body.message ?? (body.data as Record<string, unknown> | undefined)?.message) as string | undefined,
    };
  }

  async getLoginProfile(cookie: string): Promise<MusicUserProfile> {
    return this.provider.getUserProfile(cookie);
  }

  async getLoginStatus(cookie: string): Promise<Record<string, unknown>> {
    const result = await this.callApi("login_status", { cookie });
    return (result?.body ?? {}) as Record<string, unknown>;
  }

  async getUserDetail(userId: string, cookie: string): Promise<Record<string, unknown>> {
    const result = await this.callApi("user_detail", { uid: userId, cookie });
    return (result?.body ?? {}) as Record<string, unknown>;
  }

  async getSongUrlV1Raw(songId: string, cookie: string, level: "standard" | "higher" | "exhigh" = "standard") {
    const result = await this.callApi("song_url_v1", { id: songId, level, cookie });
    return (result?.body ?? {}) as Record<string, unknown>;
  }

  async getSongUrlRaw(songId: string, cookie: string, br = 128000) {
    const result = await this.callApi("song_url", { id: songId, br, cookie });
    return (result?.body ?? {}) as Record<string, unknown>;
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

  // callApi uses the npm package directly when in "package" mode,
  // falling back to the HTTP sidecar only in "remote" mode.
  private async callApi(fnName: string, params: Record<string, unknown>): Promise<{
    body: Record<string, unknown>;
    cookie?: string;
  } | null> {
    if (this.pkgApi && typeof this.pkgApi[fnName] === "function") {
      try {
        const result = await this.pkgApi[fnName](params);
        return {
          body: (result.body ?? {}) as Record<string, unknown>,
          cookie: typeof result.cookie === "string" ? result.cookie : undefined,
        };
      } catch (error) {
        console.warn(`[netease] Package call ${fnName} failed:`, (error as Error).message);
        throw error; // Don't fallback to HTTP on Vercel - HTTP won't work either
      }
    }

    // If no package API available, try HTTP (local dev with sidecar)
    if (!this.pkgApi) {
      const path = "/" + fnName.replace(/_/g, "/");
      console.log(`[netease] No package API, using HTTP fallback for ${fnName}`);
      return this.requestViaHttp(path, params);
    }

    throw new Error(`NetEase API function not found: ${fnName}`);
  }

  private async requestViaHttp(path: string, query: Record<string, unknown>) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`NetEase API request failed: ${response.status}`);
    }

    const body = (await response.json()) as Record<string, unknown>;
    return { body };
  }
}

export function toNeteaseSongMeta(track: MusicTrack): Record<string, unknown> | undefined {
  return track.rawMeta && typeof track.rawMeta === "object" ? (track.rawMeta as Record<string, unknown>) : undefined;
}
