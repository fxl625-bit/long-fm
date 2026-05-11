import type { DJDecision, DJDirectingDecision, DJHostDebugState, DJProgramPlan, DJSpeakAttempt } from "@/lib/dj/dj-types";
import type { RadioSoulState } from "@/lib/dj/radio-soul-state";
import type { LXPlayerStatus } from "@/lib/types/music";

export type Track = {
  id: string;
  providerTrackId?: string;
  neteaseId?: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  audioUrl?: string;
  externalUrl?: string;
  durationMs?: number;
  sourceType: "local" | "public" | "netease" | "external" | "demo";
  playableStatus: "playable" | "metadata_only" | "external_only" | "unavailable";
  tags?: {
    mood?: string[];
    style?: string[];
    language?: string;
    era?: string;
    energy?: "low" | "medium" | "high";
    vocal?: "male" | "female" | "mixed" | "instrumental";
  };
  adjustedTag?: string;
};

export type QueuePatchResult = {
  applied: boolean;
  changed: boolean;
  mode: "replace_next" | "insert_after_current" | "reorder_upcoming" | "skip_now" | "none";
  resolvedTrackIds: string[];
  unresolvedTrackIds: string[];
  beforeUpcomingProviderIds: string[];
  afterUpcomingProviderIds: string[];
  beforeUpcomingInternalIds: string[];
  afterUpcomingInternalIds: string[];
  noopReason?: "no_patch" | "no_resolved_tracks" | "same_order" | "no_actual_change";
};

export type TimelineItem =
  | { type: "dj"; text: string; triggerTime: number }
  | { type: "track"; trackIndex: number };

export type RadioStatus =
  | "idle"
  | "login_required"
  | "loading_library"
  | "ready"
  | "tuning"
  | "locked"
  | "on_air"
  | "playing"
  | "speaking"
  | "paused"
  | "ended"
  | "need_lx"
  | "need_playable_tracks"
  | "need_source"
  | "error";

export type RadioState = {
  status: RadioStatus;
  unlockedByUser: boolean;

  queue: Track[];
  playableQueue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  queueVersion?: number;

  timeline: TimelineItem[];
  currentSubtitle: string;
  subtitleHistory: string[];

  isPlaying: boolean;
  isSpeaking: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  currentProgram?: DJProgramPlan;
  currentDecision?: DJDecision | DJDirectingDecision;

  providerStatus: {
    provider: string;
    status: string;
    message: string;
  };

  lxConnected?: boolean;
  sseConnected?: boolean;
  lxStatus?: LXPlayerStatus | null;
  ttsMode?: "edge_tts" | "kokoro" | "piper" | "openai" | "subtitle_only";
  ttsProvider?: string;
  ttsVoice?: string;
  ttsRate?: string;
  ttsPitch?: string;
  duckedVolume?: {
    before?: number;
    after?: number;
  };
  lastDJLine?: string;
  lastDJAudioUrl?: string;
  preparedOpeningSpeech?: string;
  resolvingProgress?: {
    current: number;
    total: number;
  };
  resolveStats?: {
    total: number;
    playable: number;
    noUrl: number;
    vipOnly: number;
    copyrightUnavailable: number;
    apiError: number;
    unknown: number;
  };
  lastSongUrlRawShape?: string;
  lastQueuePatchApplied?: boolean;
  lastQueuePatchBeforeIds?: string[];
  lastQueuePatchAfterIds?: string[];
  lastQueuePatchBeforeProviderIds?: string[];
  lastQueuePatchAfterProviderIds?: string[];
  lastQueuePatchBeforeInternalIds?: string[];
  lastQueuePatchAfterInternalIds?: string[];
  lastQueuePatchResolvedIds?: string[];
  lastQueuePatchUnresolvedIds?: string[];
  lastQueuePatchNoopReason?: QueuePatchResult["noopReason"];
  lastQueuePatchResult?: QueuePatchResult;
  lastSkipNowApplied?: boolean;
  lastSkippedFromTrackId?: string;
  lastSkippedToTrackId?: string;
  lastDecisionProvider?: string;
  lastDecisionUsedFallback?: boolean;
  lastDecisionFallbackReason?: string;
  lastDecisionRawPrompt?: string;
  lastDecisionRawResponse?: string;
  lastDecisionPromptType?: string;
  lastBlockedDJLines?: Array<{
    line: string;
    reason: string;
  }>;
  lastProgramPlanProvider?: string;
  lastProgramPlanUsedFallback?: boolean;
  lastProgramPlanError?: string;
  lastProgramPlanRawPrompt?: string;
  lastProgramPlanRawResponse?: string;
  lastProgramPlanQueueBeforeProviderIds?: string[];
  lastProgramPlanQueueAfterProviderIds?: string[];
  lastProgramPlanQueueChanged?: boolean;
  djBrainFallbackActive?: boolean;
  djHostDebug?: DJHostDebugState;
  djSpeakAttempts?: DJSpeakAttempt[];
  radioSoulState?: RadioSoulState;
  lastSpeakAt?: number | null;
  tracksSinceLastSpeak?: number;
  minutesSinceLastSpeak?: number;
  forcedSpeakTriggered?: boolean;
  lastSoulShiftReason?: string | null;

  djName: string;
  channelName: string;
  error?: string;
};
