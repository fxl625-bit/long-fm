import { InMemoryTTLCache } from "@/lib/cache/in-memory-ttl-cache";
import {
  demoUser,
  getDemoPlaylistDetail,
  getDemoPlaylists,
  getDemoTrack,
  getDemoTracks,
  searchDemoTracks,
} from "@/lib/demo/music-data";
import type { MusicPlaylist, MusicTrack, PlaylistDetail } from "@/lib/types/music";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

const FIVE_MINUTES = 5 * 60 * 1000;

export class MockMusicProvider implements MusicProvider {
  readonly providerName = "demo" as const;
  private readonly cache = new InMemoryTTLCache();
  private readonly customPlaylists = new Map<string, PlaylistDetail>();

  async healthcheck(): Promise<MusicProviderHealth> {
    return {
      mode: this.providerName,
      available: true,
      status: "available",
      message: "Demo source is ready.",
    };
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    void input;
    return {
      ok: true,
      message: "Demo provider ready.",
      session: {
        accessToken: "demo-access-token",
      },
    };
  }

  async getUserProfile() {
    return demoUser;
  }

  async getUserPlaylists(): Promise<MusicPlaylist[]> {
    const key = "demo:playlists";
    const cached = this.cache.get<MusicPlaylist[]>(key);
    if (cached) {
      return cached;
    }

    const playlists = [...getDemoPlaylists(), ...Array.from(this.customPlaylists.values())];
    this.cache.set(key, playlists, FIVE_MINUTES);
    return playlists;
  }

  async getPlaylistDetail(playlistId: string): Promise<PlaylistDetail> {
    const key = `demo:playlist:${playlistId}`;
    const cached = this.cache.get<PlaylistDetail>(key);
    if (cached) {
      return cached;
    }

    const detail = this.customPlaylists.get(playlistId) ?? getDemoPlaylistDetail(playlistId);
    if (!detail) {
      throw new Error(`Demo playlist not found: ${playlistId}`);
    }

    this.cache.set(key, detail, FIVE_MINUTES);
    return detail;
  }

  async getLikedSongs(): Promise<MusicTrack[]> {
    const key = "demo:liked";
    const cached = this.cache.get<MusicTrack[]>(key);
    if (cached) {
      return cached;
    }

    const tracks = getDemoTracks();
    this.cache.set(key, tracks, FIVE_MINUTES);
    return tracks;
  }

  async searchSongs(query: string): Promise<MusicTrack[]> {
    return searchDemoTracks(query);
  }

  async getSongDetail(songId: string): Promise<MusicTrack | null> {
    return getDemoTrack(songId);
  }

  async getLyrics(songId: string): Promise<string | null> {
    const track = getDemoTrack(songId);
    if (!track) {
      return null;
    }
    return track.lyrics ?? `${track.name} - ${track.artist}\n(Demo mode does not include full lyrics yet)`;
  }

  async getSongUrl(songId: string): Promise<string | null> {
    const track = getDemoTrack(songId);
    if (!track) {
      return null;
    }
    return track.audioUrl ?? track.externalUrl ?? null;
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string }> {
    const id = `custom-${Date.now()}`;
    this.customPlaylists.set(id, {
      id,
      name,
      description: "用户创建的播放列表",
      tracks: [],
    });

    this.cache.clear();
    return { id, name };
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    const playlist = this.customPlaylists.get(playlistId);
    if (!playlist) {
      return { success: false };
    }

    const unique = Array.from(new Set(trackIds));
    playlist.tracks = unique.map((trackId) => getDemoTrack(trackId)).filter((track): track is MusicTrack => Boolean(track));

    this.customPlaylists.set(playlistId, playlist);
    this.cache.clear();
    return { success: true };
  }
}
