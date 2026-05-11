import type { MusicTrack, PlaybackQueueItem, PlaybackSessionState, PlaybackStatus, PlaybackState } from "@/lib/types/music";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPlayableAudioUrl(track: MusicTrack): boolean {
  if (!isNonEmptyString(track.audioUrl)) {
    return false;
  }

  const audioUrl = track.audioUrl.trim();
  if (audioUrl.startsWith("/")) {
    return true;
  }

  if (audioUrl.startsWith("blob:")) {
    return true;
  }

  try {
    const parsed = new URL(audioUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeTrack(track: MusicTrack): MusicTrack {
  return {
    ...track,
    audioUrl: isNonEmptyString(track.audioUrl) ? track.audioUrl.trim() : undefined,
    durationMs: track.durationMs ?? track.duration ?? 0,
    playableStatus: track.playableStatus ?? "unavailable",
  };
}

export function isPlayableQueueItem(item: PlaybackQueueItem): boolean {
  const track = normalizeTrack(item.track);
  return track.playableStatus === "playable" && hasPlayableAudioUrl(track);
}

export function buildPlayableQueue(queue: PlaybackQueueItem[]): PlaybackQueueItem[] {
  const seenAudioUrls = new Set<string>();
  const playable: PlaybackQueueItem[] = [];

  for (const item of queue) {
    const track = normalizeTrack(item.track);
    if (track.playableStatus !== "playable") {
      continue;
    }
    if (!hasPlayableAudioUrl(track) || !track.audioUrl) {
      continue;
    }
    if (seenAudioUrls.has(track.audioUrl)) {
      continue;
    }

    seenAudioUrls.add(track.audioUrl);
    playable.push({
      ...item,
      track,
    });
  }

  return playable;
}

function clampIndex(index: number, queueLength: number): number {
  if (!queueLength) {
    return 0;
  }
  return Math.max(0, Math.min(index, queueLength - 1));
}

function getTrackDurationMs(track: MusicTrack | null): number {
  if (!track) {
    return 0;
  }
  return Math.max(0, track.durationMs ?? track.duration ?? 0);
}

export function normalizeSessionQueue(session: PlaybackSessionState): PlaybackSessionState {
  const queue = buildPlayableQueue(session.queue);
  if (!queue.length) {
    return {
      ...session,
      currentTrackId: undefined,
      queue: [],
      currentIndex: 0,
      currentTime: 0,
      isPlaying: false,
    };
  }

  const currentIndex = clampIndex(session.currentIndex, queue.length);
  const currentTrack = queue[currentIndex]?.track;
  const currentTrackId = currentTrack?.id;
  const currentTime = session.currentTrackId === currentTrackId ? Math.max(0, session.currentTime) : 0;

  return {
    ...session,
    currentTrackId,
    queue,
    currentIndex,
    currentTime,
    isPlaying: session.isPlaying,
    source: currentTrack?.sourceType ?? session.source,
  };
}

export function toPlaybackState(session: PlaybackSessionState, status: PlaybackStatus = "idle"): PlaybackState {
  const normalized = normalizeSessionQueue(session);
  const currentTrack = normalized.queue[normalized.currentIndex]?.track ?? null;

  return {
    queue: normalized.queue.map((item) => item.track),
    currentIndex: normalized.currentIndex,
    currentTrack,
    audioUrl: currentTrack?.audioUrl ?? null,
    isPlaying: normalized.isPlaying,
    currentTime: normalized.currentTime,
    duration: getTrackDurationMs(currentTrack),
    status,
  };
}

export function playTrack(state: PlaybackState, index: number): PlaybackState {
  if (!state.queue.length) {
    return {
      ...state,
      currentIndex: 0,
      currentTrack: null,
      audioUrl: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      status: "idle",
    };
  }

  const currentIndex = clampIndex(index, state.queue.length);
  const currentTrack = state.queue[currentIndex] ?? null;

  return {
    ...state,
    currentIndex,
    currentTrack,
    audioUrl: currentTrack?.audioUrl ?? null,
    currentTime: 0,
    duration: getTrackDurationMs(currentTrack),
    isPlaying: true,
    status: "playing",
  };
}

export function nextTrack(state: PlaybackState): PlaybackState {
  if (!state.queue.length) {
    return {
      ...state,
      status: "idle",
      isPlaying: false,
      currentTrack: null,
      audioUrl: null,
      currentTime: 0,
      duration: 0,
      currentIndex: 0,
    };
  }

  if (state.currentIndex >= state.queue.length - 1) {
    return {
      ...state,
      status: "ended",
      isPlaying: false,
      currentTime: 0,
      duration: getTrackDurationMs(state.currentTrack),
    };
  }

  return playTrack(state, state.currentIndex + 1);
}

export function expectedAudioUrl(state: PlaybackState): string | null {
  return state.currentTrack?.audioUrl ?? null;
}

export function syncAudioSource(audio: { src: string }, state: PlaybackState): string | null {
  const nextAudioUrl = expectedAudioUrl(state);
  if (!nextAudioUrl) {
    return null;
  }
  if (audio.src !== nextAudioUrl) {
    audio.src = nextAudioUrl;
  }
  return nextAudioUrl;
}
