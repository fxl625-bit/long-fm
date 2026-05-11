import { readServerEnvVar } from "@/lib/config/server-env";
import type { ProviderKind } from "@/lib/types/music";
import { GenericMusicApiProvider } from "./generic-music-api-provider";
import { LocalAudioProvider } from "./local-audio-provider";
import { LXMusicProvider } from "./lx-music-provider";
import { MockMusicProvider } from "./mock-music-provider";
import { NeteaseOfficialProvider } from "./netease-official-provider";
import { NeteaseMusicProvider } from "./netease-music-provider";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

const PROVIDER_PRIORITY: ProviderKind[] = ["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"];

class CascadingMusicProvider implements MusicProvider {
  readonly providerName: ProviderKind;

  constructor(private readonly providers: MusicProvider[]) {
    this.providerName = providers[0]?.providerName ?? "demo";
  }

  async healthcheck(): Promise<MusicProviderHealth> {
    const results = await Promise.all(this.providers.map((provider) => provider.healthcheck()));
    const firstAvailable = results.find((item) => item.available);
    if (firstAvailable) {
      return firstAvailable;
    }

    return (
      results[0] ?? {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: "No music source available.",
      }
    );
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    return this.withFallback((provider) => provider.login(input));
  }

  async getUserProfile(userToken?: string) {
    return this.withFallback((provider) => provider.getUserProfile(userToken));
  }

  async getUserPlaylists(userToken?: string) {
    return this.withFallback((provider) => provider.getUserPlaylists(userToken));
  }

  async getPlaylistDetail(playlistId: string, userToken?: string) {
    return this.withFallback((provider) => provider.getPlaylistDetail(playlistId, userToken));
  }

  async getLikedSongs(userToken?: string) {
    return this.withFallback((provider) => provider.getLikedSongs(userToken));
  }

  async searchSongs(query: string, userToken?: string) {
    return this.withFallback((provider) => provider.searchSongs(query, userToken));
  }

  async getSongDetail(songId: string, userToken?: string) {
    return this.withFallback((provider) => provider.getSongDetail(songId, userToken));
  }

  async getLyrics(songId: string, userToken?: string) {
    return this.withFallback((provider) => provider.getLyrics(songId, userToken));
  }

  async getSongUrl(songId: string, userToken?: string) {
    return this.withFallback((provider) => provider.getSongUrl(songId, userToken));
  }

  async createPlaylist(name: string, userToken?: string) {
    return this.withFallback((provider) => provider.createPlaylist(name, userToken));
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[], userToken?: string) {
    return this.withFallback((provider) => provider.addTracksToPlaylist(playlistId, trackIds, userToken));
  }

  private async withFallback<T>(fn: (provider: MusicProvider) => Promise<T>): Promise<T> {
    let lastError: unknown = null;

    for (const provider of this.providers) {
      try {
        return await fn(provider);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error("All music providers failed.");
  }
}

export function createMusicProviderForMode(mode: ProviderKind): MusicProvider {
  if (mode === "lx_music") {
    return new LXMusicProvider();
  }

  if (mode === "netease_official") {
    return new NeteaseOfficialProvider();
  }

  if (mode === "local") {
    return new LocalAudioProvider(readServerEnvVar("LOCAL_AUDIO_DIR") ?? "");
  }

  if (mode === "netease_experimental") {
    return new NeteaseMusicProvider({
      baseUrl: readServerEnvVar("NETEASE_API_BASE_URL") ?? "http://localhost:3001",
      defaultCookie: readServerEnvVar("NETEASE_COOKIE"),
    });
  }

  if (mode === "generic_api") {
    return new GenericMusicApiProvider();
  }

  return new MockMusicProvider();
}

export function resolveMusicProviderMode(): ProviderKind {
  const mode = readServerEnvVar("MUSIC_PROVIDER") ?? "netease_experimental";
  if (mode === "lx_music" || mode === "netease_official" || mode === "local" || mode === "demo" || mode === "netease_experimental" || mode === "generic_api") {
    return mode;
  }
  return "netease_experimental";
}

export function listProviderModesByPriority(primary?: ProviderKind): ProviderKind[] {
  const first = primary ?? resolveMusicProviderMode();
  const ordered = [first, ...PROVIDER_PRIORITY.filter((item) => item !== first)];

  const fallbackEnv = readServerEnvVar("MUSIC_PROVIDER_FALLBACK");
  if (
    fallbackEnv === "lx_music" ||
    fallbackEnv === "netease_official" ||
    fallbackEnv === "local" ||
    fallbackEnv === "demo" ||
    fallbackEnv === "netease_experimental" ||
    fallbackEnv === "generic_api"
  ) {
    if (fallbackEnv === first) {
      return ordered;
    }
    return [first, fallbackEnv, ...ordered.filter((item) => item !== first && item !== fallbackEnv)];
  }

  return ordered;
}

export function createMusicProvider(): MusicProvider {
  const modes = listProviderModesByPriority();
  const providers = modes.map((mode) => createMusicProviderForMode(mode));
  return new CascadingMusicProvider(providers);
}

export { PROVIDER_PRIORITY };
export type { MusicProvider } from "./types";

