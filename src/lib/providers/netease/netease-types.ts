import type { MusicTrack, MusicUserProfile } from "@/lib/types/music";

export type NeteaseQrStatus = "pending" | "scanned" | "authorized" | "expired";

export type NeteaseQrSession = {
  qrKey: string;
  qrImageUrl: string;
  qrUrl?: string;
};

export type NeteaseSessionPayload = {
  cookie: string;
  raw?: Record<string, unknown>;
};

export type NeteaseLoginState = "login_required" | "logged_in";

export type NeteaseStatusPayload = {
  authenticated: boolean;
  loginState: NeteaseLoginState;
  message: string;
  profile?: MusicUserProfile;
  likedPlaylistId?: string;
  playlistsCount?: number;
  playableTrackCount?: number;
  syncSummary?: {
    playlistCount: number;
    likedSongCount: number;
  };
};

export type NeteaseTrack = MusicTrack & {
  neteaseId: string;
  sourceType: "NETEASE_EXPERIMENTAL";
  playableStatus: "playable" | "vip_only" | "no_url" | "copyright_unavailable" | "unknown";
};

export type NeteaseSongUrlResult = {
  songId: string;
  url?: string;
  br?: number;
  type?: string;
  playableStatus: "playable" | "vip_only" | "no_url" | "copyright_unavailable" | "unknown";
  reason?: string;
  raw?: unknown;
};
