import type { MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail } from "@/lib/types/music";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

export class GenericMusicApiProvider implements MusicProvider {
  readonly providerName = "generic_api" as const;

  async healthcheck(): Promise<MusicProviderHealth> {
    return {
      mode: this.providerName,
      available: false,
      status: "metadata_only",
      message: "Generic provider is a placeholder for future integrations.",
    };
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    void input;
    return {
      ok: false,
      message: "Generic provider is placeholder only.",
    };
  }

  async getUserProfile(): Promise<MusicUserProfile> {
    return {
      id: "generic-placeholder",
      nickname: "Generic API User",
    };
  }

  async getUserPlaylists(): Promise<MusicPlaylist[]> {
    return [];
  }

  async getPlaylistDetail(playlistId: string): Promise<PlaylistDetail> {
    throw new Error(`Generic provider playlist not found: ${playlistId}`);
  }

  async getLikedSongs(): Promise<MusicTrack[]> {
    return [];
  }

  async searchSongs(query: string): Promise<MusicTrack[]> {
    void query;
    return [];
  }

  async getSongDetail(songId: string): Promise<MusicTrack | null> {
    void songId;
    return null;
  }

  async getLyrics(songId: string): Promise<string | null> {
    void songId;
    return null;
  }

  async getSongUrl(songId: string): Promise<string | null> {
    void songId;
    return null;
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string }> {
    return { id: "generic-placeholder", name };
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    void playlistId;
    void trackIds;
    return { success: false };
  }
}
