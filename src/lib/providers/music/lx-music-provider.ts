import type { LXPlayerStatus, MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail } from "@/lib/types/music";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";
import { resolveLXMusicConfig } from "./lx-music-config";
import type { LXRawPlayerStatus } from "./lx-music-types";
import {
  buildLXPlayerPauseUrl,
  buildLXPlayerPlayUrl,
  buildLXSearchPlayUrl,
  buildLXSkipNextUrl,
  buildLXSkipPrevUrl,
  buildLXSonglistPlayUrl,
  openLXScheme,
} from "./lx-music-scheme";
import { createLXStatusSubscription } from "./lx-music-sse-client";

type FetchImpl = typeof fetch;

type LXMusicProviderConfig = {
  apiBaseUrl?: string;
  enabled?: boolean;
  useSSE?: boolean;
  fetchImpl?: FetchImpl;
};

export type LXConnectionState =
  | "unknown"
  | "api_unreachable"
  | "api_reachable_no_song"
  | "playing"
  | "paused"
  | "error";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveLXConnectionState(status?: LXPlayerStatus | null, requestFailed = false): LXConnectionState {
  if (requestFailed) {
    return "api_unreachable";
  }

  if (!status) {
    return "unknown";
  }

  const hasSong = Boolean(status.title.trim());
  if (status.status === "error") {
    return "error";
  }
  if (status.status === "playing" && hasSong) {
    return "playing";
  }
  if (status.status === "paused" && hasSong) {
    return "paused";
  }
  return "api_reachable_no_song";
}

export function getLXConnectionMessage(connectionState: LXConnectionState, status?: LXPlayerStatus | null) {
  switch (connectionState) {
    case "api_unreachable":
      return "LX Music 未连接，请启动客户端并开启开放 API。";
    case "api_reachable_no_song":
      return "LX 已连接，但当前没有歌曲。我可以先帮你找一首开场。";
    case "paused":
      return status?.title ? `当前暂停在《${status.title}》。可以继续收听。` : "LX 已连接，当前暂停。";
    case "playing":
      return status?.title ? `现在接上的是《${status.title}》。频道已经在播。` : "LX 正在播放。";
    case "error":
      return "LX Music 当前返回异常状态，请重试连接。";
    default:
      return "正在检查 LX Music 连接状态。";
  }
}

export function mapLXPlayerStatus(raw: LXRawPlayerStatus): LXPlayerStatus {
  return {
    status: raw.status === "playing" || raw.status === "paused" || raw.status === "error" ? raw.status : "stoped",
    title: raw.name?.trim() || "",
    artist: raw.singer?.trim() || "",
    album: raw.albumName?.trim() || "",
    duration: typeof raw.duration === "number" ? raw.duration : 0,
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    playbackRate: typeof raw.playbackRate === "number" ? raw.playbackRate : 1,
    coverUrl: raw.picUrl,
    lyricLineText: raw.lyricLineText,
    lyric: raw.lyric,
    volume: typeof raw.volume === "number" ? raw.volume : undefined,
    mute: typeof raw.mute === "boolean" ? raw.mute : undefined,
  };
}

async function parseMaybeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export class LXMusicProvider implements MusicProvider {
  readonly providerName = "lx_music" as const;
  readonly apiBaseUrl: string;
  readonly enabled: boolean;
  readonly useSSE: boolean;
  private readonly fetchImpl: FetchImpl;

  constructor(config: LXMusicProviderConfig = {}) {
    const defaults = resolveLXMusicConfig();
    this.apiBaseUrl = trimTrailingSlash(config.apiBaseUrl ?? defaults.apiBaseUrl);
    this.enabled = config.enabled ?? defaults.enabled;
    this.useSSE = config.useSSE ?? defaults.useSSE;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async healthcheck(): Promise<MusicProviderHealth> {
    if (!this.enabled) {
      return {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: "LX Music provider is disabled.",
      };
    }

    try {
      const status = await this.getStatus();
      const connectionState = resolveLXConnectionState(status);
      return {
        mode: this.providerName,
        available: connectionState !== "api_unreachable" && connectionState !== "error",
        status: connectionState === "api_reachable_no_song" ? "degraded" : connectionState === "playing" || connectionState === "paused" ? "available" : "degraded",
        message: getLXConnectionMessage(connectionState, status),
      };
    } catch (error) {
      return {
        mode: this.providerName,
        available: false,
        status: "degraded",
        message: error instanceof Error ? error.message : "LX Music is unreachable.",
      };
    }
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    void input;
    return { ok: true, message: "LX Music does not require web login." };
  }

  async getUserProfile(): Promise<MusicUserProfile> {
    throw new Error("LX Music is playback-only and does not expose user profile.");
  }

  async getUserPlaylists(): Promise<MusicPlaylist[]> {
    throw new Error("LX Music is playback-only and does not expose playlists.");
  }

  async getPlaylistDetail(): Promise<PlaylistDetail> {
    throw new Error("LX Music is playback-only and does not expose playlist details.");
  }

  async getLikedSongs(): Promise<MusicTrack[]> {
    throw new Error("LX Music is playback-only and does not expose liked songs.");
  }

  async searchSongs(): Promise<MusicTrack[]> {
    throw new Error("LX Music search is controlled through scheme URLs.");
  }

  async getSongDetail(): Promise<MusicTrack | null> {
    throw new Error("LX Music is playback-only and does not expose track detail.");
  }

  async getLyrics(): Promise<string | null> {
    return null;
  }

  async getSongUrl(): Promise<string | null> {
    return null;
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string }> {
    throw new Error(`LX Music cannot create playlist "${name}" through this integration.`);
  }

  async addTracksToPlaylist(): Promise<{ success: boolean }> {
    throw new Error("LX Music cannot add tracks through this integration.");
  }

  async getStatus(): Promise<LXPlayerStatus> {
    const json = await this.requestJson<LXRawPlayerStatus>("/status");
    return mapLXPlayerStatus(json);
  }

  subscribeStatus(onUpdate: (status: LXPlayerStatus) => void, onError?: () => void) {
    return createLXStatusSubscription(`${this.apiBaseUrl}/subscribe-player-status`, mapLXPlayerStatus, onUpdate, onError);
  }

  async play() {
    await this.request("/play");
  }

  async pause() {
    await this.request("/pause");
  }

  async next() {
    await this.request("/skip-next");
  }

  async previous() {
    await this.request("/skip-prev");
  }

  async seek(offset: number) {
    await this.request(`/seek?offset=${Math.max(0, Math.floor(offset))}`);
  }

  async setVolume(volume: number) {
    await this.request(`/volume?volume=${Math.max(0, Math.min(100, Math.floor(volume)))}`);
  }

  async mute(mute: boolean) {
    await this.request(`/mute?mute=${mute ? "true" : "false"}`);
  }

  searchPlay(name: string, singer?: string) {
    return openLXScheme(buildLXSearchPlayUrl(name, singer));
  }

  playerPlay() {
    return openLXScheme(buildLXPlayerPlayUrl());
  }

  playerPause() {
    return openLXScheme(buildLXPlayerPauseUrl());
  }

  skipNext() {
    return openLXScheme(buildLXSkipNextUrl());
  }

  skipPrev() {
    return openLXScheme(buildLXSkipPrevUrl());
  }

  openSonglist(source: string, idOrUrl: string) {
    return openLXScheme(buildLXSonglistPlayUrl(source, idOrUrl));
  }

  playSonglist(source: string, idOrUrl: string, index?: number) {
    const url = buildLXSonglistPlayUrl(source, idOrUrl);
    return openLXScheme(typeof index === "number" ? `${url}?index=${index}` : url);
  }

  private async request(path: string) {
    if (!this.enabled) {
      throw new Error("LX Music provider is disabled.");
    }
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`LX Music request failed: ${response.status}`);
    }
    return response;
  }

  private async requestJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    const payload = await parseMaybeJson(response);
    return payload as T;
  }
}
