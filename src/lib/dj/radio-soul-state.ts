import type { Track } from "@/lib/radio/radio-types";

export type RadioSoulState = {
  moodAxis: "hushed" | "warm" | "adrift" | "tense" | "bright";
  intimacy: number;
  motion: number;
  strangeness: number;
  confidence: number;
  tracksSinceLastSpeak: number;
  minutesSinceLastSpeak: number;
  lastSpeakAt: number | null;
  currentImagery: string[];
  recentFragments: string[];
};

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function normalizeList(values: Array<string | undefined>, limit = 4) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    items.push(text);
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

function energyOf(track?: Track | null) {
  const value = track?.tags?.energy ?? "medium";
  if (value === "low") return 0.2;
  if (value === "high") return 0.85;
  return 0.5;
}

function styleSeed(track?: Track | null) {
  return normalizeList([
    ...(track?.tags?.mood ?? []),
    ...(track?.tags?.style ?? []),
    track?.album,
    track?.artist,
  ]);
}

export function createInitialSoulState(): RadioSoulState {
  return {
    moodAxis: "warm",
    intimacy: 0.48,
    motion: 0.42,
    strangeness: 0.18,
    confidence: 0.28,
    tracksSinceLastSpeak: 0,
    minutesSinceLastSpeak: 0,
    lastSpeakAt: null,
    currentImagery: [],
    recentFragments: [],
  };
}

export function noteSoulSpeech(
  state: RadioSoulState,
  input: {
    spokenAt: number;
    fragment?: string;
  },
): RadioSoulState {
  return {
    ...state,
    confidence: clampUnit(state.confidence + 0.12),
    tracksSinceLastSpeak: 0,
    minutesSinceLastSpeak: 0,
    lastSpeakAt: input.spokenAt,
    recentFragments: normalizeList([input.fragment, ...state.recentFragments], 6),
  };
}

export function evolveSoulState(
  state: RadioSoulState,
  input: {
    currentTrack?: Track | null;
    previousTrack?: Track | null;
    now?: number;
    lastSpeakAt?: number | null;
    tracksSinceLastSpeak?: number;
    minutesSinceLastSpeak?: number;
  },
): RadioSoulState {
  const currentEnergy = energyOf(input.currentTrack);
  const previousEnergy = energyOf(input.previousTrack);
  const delta = currentEnergy - previousEnergy;
  const lastSpeakAt = input.lastSpeakAt ?? state.lastSpeakAt;
  const now = input.now ?? Date.now();
  const minutesSinceLastSpeak =
    input.minutesSinceLastSpeak ??
    (lastSpeakAt != null ? Math.max(0, Number(((now - lastSpeakAt) / 60_000).toFixed(2))) : state.minutesSinceLastSpeak);
  const tracksSinceLastSpeak = input.tracksSinceLastSpeak ?? (state.tracksSinceLastSpeak + 1);

  let moodAxis: RadioSoulState["moodAxis"] = state.moodAxis;
  if (currentEnergy <= 0.25) {
    moodAxis = "hushed";
  } else if (currentEnergy >= 0.78 && delta > 0.2) {
    moodAxis = "bright";
  } else if (delta < -0.25) {
    moodAxis = "adrift";
  } else if (delta > 0.25) {
    moodAxis = "tense";
  } else if (currentEnergy >= 0.55) {
    moodAxis = "bright";
  } else {
    moodAxis = "warm";
  }

  const intimacy = clampUnit(
    currentEnergy <= 0.3 ? state.intimacy + 0.1 : currentEnergy >= 0.75 ? state.intimacy - 0.08 : state.intimacy + 0.01,
  );
  const motion = clampUnit((state.motion * 0.55) + (currentEnergy * 0.45));
  const strangeness = clampUnit(
    state.strangeness +
      (input.currentTrack?.tags?.style?.length ? Math.min(0.08, input.currentTrack.tags.style.length * 0.02) : 0.01) +
      (Math.abs(delta) > 0.3 ? 0.08 : 0),
  );
  const confidence = clampUnit(state.confidence + (Math.abs(delta) > 0.18 ? 0.08 : 0.03));

  return {
    ...state,
    moodAxis,
    intimacy,
    motion,
    strangeness,
    confidence,
    tracksSinceLastSpeak,
    minutesSinceLastSpeak,
    lastSpeakAt,
    currentImagery: styleSeed(input.currentTrack),
  };
}
