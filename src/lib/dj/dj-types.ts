import type { Track } from "@/lib/radio/radio-types";
export type MusicPreference = {
  moods: string[];
  styles: string[];
  energy: "low" | "medium" | "high";
  languages: string[];
  notes: string;
};

export type UserMusicMemory = {
  topArtists: string[];
  topLanguages: string[];
  topEras: string[];
  inferredMoods: string[];
  inferredStyles: string[];
  energyProfile: "low" | "medium" | "high" | "mixed";
  familiarityPreference: "familiar_first" | "balanced" | "discovery_first";
  discoveryTolerance: "low" | "medium" | "high";
  avoidPatterns: string[];
  favoriteExamples: {
    title: string;
    artist: string;
    tags?: string[];
  }[];
  timeSlotPreferences: {
    morning?: MusicPreference;
    afternoon?: MusicPreference;
    evening?: MusicPreference;
    night?: MusicPreference;
    work?: MusicPreference;
    drive?: MusicPreference;
  };
  summary: string;
};

export type ListeningContext = {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  weekdayType: "workday" | "weekend";
  likelyScene: "work" | "commute" | "relax" | "focus" | "drive" | "sleep" | "unknown";
  energyTarget: "low" | "medium" | "high";
  recommendedMood: string[];
  reason: string;
};

export type DJHostingMoment = {
  id: string;
  type: "opening" | "track_intro" | "bridge" | "style_shift" | "time_context" | "outro";
  trigger:
    | { type: "on_channel_start" }
    | { type: "after_seconds"; seconds: number }
    | { type: "after_tracks"; count: number }
    | { type: "before_track"; index: number }
    | { type: "near_end" };
  lines: string[];
  beforeTrackId?: string;
  afterTrackId?: string;
  hostAngle?: string;
};

export type DJTalkBreakEvent = "opening" | "track_intro" | "bridge" | "user_tune" | "style_shift" | "time_context" | "outro";

export type DJHostState =
  | "idle"
  | "opening"
  | "track_intro_pending"
  | "track_intro_done"
  | "playing_music"
  | "bridge_pending"
  | "speaking"
  | "paused"
  | "ended";

export type DJHostGuardResult = {
  ok: boolean;
  safeLines: string[];
  blockedLines: Array<{ line: string; reason: string }>;
};

export type DJTalkBreakResult = {
  attemptedLines: string[];
  spokenLines: string[];
  blockedLines: Array<{ line: string; reason: string }>;
  guardResult?: DJHostGuardResult;
  pattern?: string;
};

export type DJSpeakAttempt = {
  id: string;
  event: DJTalkBreakEvent | "manual_test";
  createdAt: string;
  schedulerTriggered: boolean;
  deepseekCalled: boolean;
  deepseekUsedFallback: boolean;
  deepseekError?: string;
  rawLines: string[];
  qualityChecked: boolean;
  qualityPass: boolean;
  qualityFailures: string[];
  guardChecked: boolean;
  safeLines: string[];
  blockedLines: Array<{ line: string; reason: string }>;
  rewriteAttempted: boolean;
  rewriteLines: string[];
  rewritePass: boolean;
  rewriteFailures: string[];
  fallbackUsed: boolean;
  fallbackLines: string[];
  finalLines: string[];
  ttsCalled: boolean;
  ttsProvider?: string;
  ttsAudioUrl?: string;
  ttsError?: string;
  subtitleShown: boolean;
  queueEnqueued: boolean;
  queuePlayed: boolean;
  skippedReason?: string;
};

export type DJHostDebugState = {
  state: DJHostState;
  schedulerRunning: boolean;
  openingDone: boolean;
  openingLinesAttempted: string[];
  openingLinesSpoken: string[];
  openingBlockedLines: Array<{ line: string; reason: string }>;
  currentTrackIntroDoneTrackId: string | null;
  playedCount: number;
  lastBridgeAt: string | null;
  lastSpokenAt: string | null;
  lastTalkBreakEvent: DJTalkBreakEvent | null;
  lastTalkBreakPattern: string | null;
  lastGuardResult: DJHostGuardResult | null;
  lastBlockedLines: Array<{ line: string; reason: string }>;
  recentDJLines: string[];
  lastSchedulerEvent: DJTalkBreakEvent | null;
  eventTriggeredAt: string | null;
  pendingTalkBreaks: DJTalkBreakEvent[];
  lastTalkBreakFailed: boolean;
  lastTalkBreakFailureReason: string | null;
  consecutiveTalkFailures: number;
  lastSpeakAt: string | null;
  tracksSinceLastSpeak: number;
  minutesSinceLastSpeak: number;
  forcedSpeakTriggered: boolean;
};

export type DJProgramPlan = {
  title: string;
  intent: string;
  segments: {
    name: string;
    purpose: "warmup" | "main" | "shift" | "discovery" | "cooldown";
    targetMood: string[];
    targetEnergy: "low" | "medium" | "high";
    trackIds: string[];
    reason: string;
  }[];
  queueTrackIds: string[];
};

export type DJDecision = {
  shouldIntervene: boolean;
  interventionType:
    | "keep_flow"
    | "style_shift"
    | "energy_shift"
    | "language_shift"
    | "artist_break"
    | "discovery_insert"
    | "cooldown";
  reason: string;
  djLine: string;
  replacementTrackIds?: string[];
  insertAfterCurrent?: boolean;
};

export type DirectorMusicActionType = "none" | "skip" | "reorder" | "inject";

export type DirectorMusicAction = {
  type: DirectorMusicActionType;
  reason?: string;
  trackIds?: string[];
};

export type DJDirectorDecision = {
  shouldSpeak: boolean;
  speech: string;
  durationHintSec: number;
  insertAfterTracks: number;
  musicAction: DirectorMusicAction;
  energy: "low" | "mid" | "high";
};

export type DirectorResultErrorType = "config_missing" | "api_error" | "invalid_json" | "empty_response" | "invalid_payload";

export type DirectorResultError = {
  type: DirectorResultErrorType;
  message: string;
};

export type DirectorDecisionResult =
  | {
      ok: true;
      mode: "live";
      provider: "deepseek";
      configured: true;
      model: string;
      decision: DJDirectorDecision;
      rawPrompt?: string;
      rawResponse?: string;
      error: null;
    }
  | {
      ok: false;
      mode: "offline";
      provider: "deepseek" | "unknown";
      configured: boolean;
      model: string;
      decision: null;
      rawPrompt?: string;
      rawResponse?: string;
      error: DirectorResultError;
    };

export type DJMusicTalk = {
  currentSongAngle?: string;
  artistBackground?: string;
  albumContext?: string;
  moodNarrative?: string;
  transitionReason?: string;
};

export type DJDecisionMeta = {
  provider?: "deepseek" | "fallback" | "unknown";
  usedFallback?: boolean;
  fallbackReason?: string;
  rawResponse?: string;
  rawPrompt?: string;
  promptType?: string;
  queuePatchApplied?: boolean;
    scriptDebug?: {
    event?: string;
    provider?: string;
    usedFallback?: boolean;
    songBrief?: Record<string, unknown> | null;
    previousSongBrief?: Record<string, unknown> | null;
    nextSongBrief?: Record<string, unknown> | null;
    selectedTargetBriefs?: Array<Record<string, unknown>>;
    talkBreakPlan?: Record<string, unknown> | null;
    pattern?: string;
    patternStructure?: string;
    selectedIndex?: number;
    candidates?: Array<Record<string, unknown>>;
    lines?: string[];
    usedAnchors?: string[];
    usedFacts?: string[];
    usedAngles?: string[];
      guardResult?: DJHostGuardResult;
      attemptedLines?: string[];
      speech?: string;
      durationHintSec?: number;
      insertAfterTracks?: number;
      bypassedGuard?: boolean;
      rewriteAttempted?: boolean;
      rewriteLines?: string[];
      quality?: {
      pass: boolean;
      bannedHits: string[];
      anchorTypes: string[];
      reason: string;
      anchorCount?: number;
      radioLikenessScore?: number;
      radioFailures?: string[];
      radioStrengths?: string[];
    };
  };
};

export type DJDirectingDecision = {
  action:
    | "keep_flow"
    | "introduce_current"
    | "bridge_to_next"
    | "shift_style"
    | "raise_energy"
    | "lower_energy"
    | "insert_discovery"
    | "avoid_repetition"
    | "skip_to_next"
    | "user_tune"
    | "stop_talking";
  priority?: "low" | "normal" | "high";
  shouldSpeak?: boolean;
  reason: string;
  lines: string[];
  queuePatch?: {
    mode: "replace_next" | "insert_after_current" | "reorder_upcoming" | "skip_now";
    trackIds: string[];
    explanation?: string;
  };
  musicTalk?: DJMusicTalk;
  targetDirection?: {
    mood?: string[];
    energy?: "low" | "medium" | "high";
    language?: string;
    style?: string[];
  };
  meta?: DJDecisionMeta;
};

export type DJDirectorContext = {
  currentTrack: Track;
  nextTrack?: Track;
  recentTracks: Track[];
  upcomingTracks: Track[];
  playedCount: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  userMemory: UserMusicMemory;
  currentSegment: "warmup" | "main" | "shift" | "discovery" | "cooldown";
  userIntent?: string;
  musicState?: {
    isPlaying: boolean;
    isPaused: boolean;
    currentTime: number;
    duration: number;
  };
  recentLines?: string[];
  playableTrackPool?: Track[];
  forceSpeak?: boolean;
  tracksSinceLastSpeak?: number;
  minutesSinceLastSpeak?: number;
};

export type DJDirectorTrigger =
  | "opening"
  | "introduce_current"
  | "bridge_to_next"
  | "shift_style"
  | "raise_energy"
  | "lower_energy"
  | "insert_discovery"
  | "avoid_repetition"
  | "user_tune"
  | "time_context"
  | "music_paused"
  | "music_ended";

export type DJContextTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
};

export type DJContext = {
  event:
    | "channel_start"
    | "track_start"
    | "track_end"
    | "every_two_tracks"
    | "style_shift"
    | "user_tune"
    | "music_paused"
    | "music_ended";
  currentTrack: DJContextTrack | null;
  nextTrack?: DJContextTrack | null;
  recentTracks: DJContextTrack[];
  upcomingTracks: DJContextTrack[];
  playableTrackPool: DJContextTrack[];
  playedCount: number;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  userIntent?: string;
  musicState: {
    isPlaying: boolean;
    isPaused: boolean;
    currentTime: number;
    duration: number;
  };
  recentLines: string[];
};

export type PlanProgramInput = {
  memory: UserMusicMemory;
  context: ListeningContext;
  candidateTracks: Track[];
  recentPlayed: Track[];
  recentSkipped: Track[];
};

export type ActiveDecisionInput = {
  memory: UserMusicMemory;
  context: ListeningContext;
  recentTracks: Track[];
  upcomingTracks: Track[];
  candidateTracks: Track[];
  currentSegment?: string;
};
