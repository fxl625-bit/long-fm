export type ProviderKind = "lx_music" | "netease_official" | "local" | "demo" | "netease_experimental" | "generic_api";
export type MusicSourceType = "LX_MUSIC" | "NETEASE_OFFICIAL" | "LOCAL" | "PUBLIC" | "DEMO" | "NETEASE_EXPERIMENTAL" | "GENERIC_API";
export type PlayableStatus =
  | "playable"
  | "external_only"
  | "metadata_only"
  | "unavailable"
  | "vip_only"
  | "no_url"
  | "copyright_unavailable"
  | "unknown";

export interface MusicUserProfile {
  id: string;
  nickname: string;
  avatar?: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration: number;
  durationMs?: number;
  coverUrl?: string;
  audioUrl?: string;
  externalUrl?: string;
  localPath?: string;
  sourceType?: MusicSourceType;
  playableStatus?: PlayableStatus;
  language?: string;
  era?: string;
  moodTags?: string[];
  styleTags?: string[];
  energyLevel?: "low" | "medium-low" | "medium" | "medium-high" | "high";
  lyrics?: string;
  playCount?: number;
  likedAt?: string;
  releasedYear?: number;
  rawMeta?: Record<string, unknown>;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  isLikedPlaylist?: boolean;
  trackCount?: number;
}

export interface PlaylistDetail extends MusicPlaylist {
  tracks: MusicTrack[];
}

export interface MusicProfileStructured {
  moods: string[];
  languages: string[];
  eras: string[];
  energy: "low" | "medium-low" | "medium" | "medium-high" | "high";
  scenes: string[];
  keywords: string[];
  topArtists: string[];
  repeatFavorites: string[];
  narrativePreference: string;
}

export interface MusicPersonaResult {
  structured: MusicProfileStructured;
  summaryText: string;
}

export interface ProgramTrackItem {
  trackId: string;
  position: number;
  reason: string;
  transition: string;
  section: "opening" | "build" | "lift" | "settle" | "outro";
}

export interface RadioProgramOutput {
  title: string;
  subtitle: string;
  vibeDescription: string;
  arrangementLogic: string;
  introText: string;
  outroText: string;
  hostTone: string;
  tracks: ProgramTrackItem[];
}

export type ProgramTweak =
  | "more_nostalgic"
  | "less_sad"
  | "more_rhythm"
  | "more_female_vocal"
  | "more_city_night"
  | "more_chinese"
  | "fit_work"
  | "fit_drive";

export interface ProgramGenerationRequest {
  userPrompt: string;
  playlistId?: string;
  desiredTrackCount?: number;
  tweak?: ProgramTweak;
}

export interface CandidateTrack extends MusicTrack {
  sourceReason: string;
  score: number;
}

export interface PlaybackQueueItem {
  track: MusicTrack;
  reason?: string;
  section?: "opening" | "build" | "lift" | "settle" | "outro";
}

export interface PlaybackSessionState {
  currentTrackId?: string;
  queue: PlaybackQueueItem[];
  currentIndex: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  source: MusicSourceType;
  updatedAt?: string;
}

export type PlaybackStatus = "idle" | "tuning" | "playing" | "speaking" | "paused" | "ended";

export type PlaybackState = {
  queue: MusicTrack[];
  currentIndex: number;
  currentTrack: MusicTrack | null;
  audioUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  status: PlaybackStatus;
};

export type ProviderStatus = {
  provider: ProviderKind;
  status: "available" | "degraded" | "metadata_only" | "unavailable";
  message: string;
};

export type LXPlayerStatus = {
  status: "playing" | "paused" | "error" | "stoped";
  title: string;
  artist: string;
  album: string;
  duration: number;
  progress: number;
  playbackRate: number;
  coverUrl?: string;
  lyricLineText?: string;
  lyric?: string;
  volume?: number;
  mute?: boolean;
};

export type TodayDJMode = "resume" | "today_recommendation" | "need_source" | "demo";

export type TodayDJPayload = {
  mode: TodayDJMode;
  title: string;
  reason: string;
  djLine: string;
  queue: PlaybackQueueItem[];
  currentTrack: MusicTrack | null;
  currentIndex: number;
  providerStatus: ProviderStatus;
};
