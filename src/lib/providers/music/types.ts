import type { MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail, ProviderKind } from "@/lib/types/music";

export interface MusicProviderLoginInput {
  phone?: string;
  email?: string;
  password?: string;
  cookie?: string;
}

export interface MusicProviderLoginResult {
  ok: boolean;
  message?: string;
  session?: {
    accessToken?: string;
    refreshToken?: string;
    cookie?: string;
    expiresAt?: string;
    raw?: Record<string, unknown>;
  };
}

export interface MusicProviderHealth {
  mode: ProviderKind;
  available: boolean;
  status: "available" | "degraded" | "metadata_only" | "unavailable";
  message?: string;
}

export interface MusicProvider {
  readonly providerName: ProviderKind;

  healthcheck(): Promise<MusicProviderHealth>;
  login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult>;
  getUserProfile(userToken?: string): Promise<MusicUserProfile>;
  getUserPlaylists(userToken?: string): Promise<MusicPlaylist[]>;
  getPlaylistDetail(playlistId: string, userToken?: string): Promise<PlaylistDetail>;
  getLikedSongs(userToken?: string): Promise<MusicTrack[]>;
  searchSongs(query: string, userToken?: string): Promise<MusicTrack[]>;
  getSongDetail(songId: string, userToken?: string): Promise<MusicTrack | null>;
  getLyrics(songId: string, userToken?: string): Promise<string | null>;
  getSongUrl(songId: string, userToken?: string): Promise<string | null>;
  createPlaylist(name: string, userToken?: string): Promise<{ id: string; name: string }>;
  addTracksToPlaylist(playlistId: string, trackIds: string[], userToken?: string): Promise<{ success: boolean }>;
}
