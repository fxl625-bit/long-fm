import { describe, expect, expectTypeOf, it } from "vitest";
import type { DJDirectorContext } from "@/lib/dj/dj-types";
import { createInitialSoulState, evolveSoulState, noteSoulSpeech, type RadioSoulState } from "@/lib/dj/radio-soul-state";
import type { RadioState, Track } from "@/lib/radio/radio-types";

function makeTrack(id: string, energy: "low" | "medium" | "high", input: Partial<Track> = {}): Track {
  return {
    id,
    providerTrackId: id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    durationMs: 180000,
    sourceType: "netease",
    playableStatus: "playable",
    tags: {
      mood: energy === "low" ? ["hushed"] : energy === "high" ? ["bright"] : ["warm"],
      style: energy === "high" ? ["club"] : ["dream-pop"],
      language: "zh",
      energy,
    },
    ...input,
  };
}

describe("radio soul state", () => {
  it("starts with low certainty but valid defaults", () => {
    const state = createInitialSoulState();

    expect(["hushed", "warm", "adrift", "tense", "bright"]).toContain(state.moodAxis);
    expect(state.confidence).toBeGreaterThanOrEqual(0);
    expect(state.confidence).toBeLessThan(0.35);
    expect(state.intimacy).toBeGreaterThanOrEqual(0);
    expect(state.motion).toBeGreaterThanOrEqual(0);
    expect(state.strangeness).toBeGreaterThanOrEqual(0);
    expect(state.lastSpeakAt).toBeNull();
    expect(state.tracksSinceLastSpeak).toBe(0);
    expect(state.minutesSinceLastSpeak).toBe(0);
    expect(state.currentImagery).toEqual([]);
    expect(state.recentFragments).toEqual([]);
  });

  it("makes the station quieter and more inward after consecutive low-energy tracks", () => {
    const firstLowTrack = makeTrack("low-1", "low");
    const secondLowTrack = makeTrack("low-2", "low", {
      title: "Night Window",
      artist: "Late Signal",
    });

    const afterFirstTrack = evolveSoulState(createInitialSoulState(), {
      currentTrack: firstLowTrack,
      previousTrack: null,
      lastSpeakAt: null,
      tracksSinceLastSpeak: 1,
      minutesSinceLastSpeak: 2,
    });

    const afterSecondTrack = evolveSoulState(afterFirstTrack, {
      currentTrack: secondLowTrack,
      previousTrack: firstLowTrack,
      lastSpeakAt: null,
      tracksSinceLastSpeak: 2,
      minutesSinceLastSpeak: 5,
    });

    expect(afterSecondTrack.moodAxis).toBe("hushed");
    expect(afterSecondTrack.motion).toBeLessThan(afterFirstTrack.motion);
    expect(afterSecondTrack.intimacy).toBeGreaterThan(afterFirstTrack.intimacy);
  });

  it("shifts mood when the energy jumps sharply", () => {
    const lowTrack = makeTrack("low", "low");
    const highTrack = makeTrack("high", "high", {
      title: "Neon Run",
      artist: "Voltage Hearts",
    });

    const lowState = evolveSoulState(createInitialSoulState(), {
      currentTrack: lowTrack,
      previousTrack: null,
      lastSpeakAt: null,
      tracksSinceLastSpeak: 1,
      minutesSinceLastSpeak: 1,
    });

    const jumpedState = evolveSoulState(lowState, {
      currentTrack: highTrack,
      previousTrack: lowTrack,
      lastSpeakAt: null,
      tracksSinceLastSpeak: 2,
      minutesSinceLastSpeak: 3,
    });

    expect(jumpedState.moodAxis).toBe("bright");
    expect(jumpedState.moodAxis).not.toBe(lowState.moodAxis);
    expect(jumpedState.motion).toBeGreaterThan(lowState.motion);
    expect(jumpedState.confidence).toBeGreaterThan(lowState.confidence);
  });

  it("tracks silence bookkeeping through speech resets and later updates", () => {
    const speechAt = 60000;
    const afterSpeech = noteSoulSpeech(createInitialSoulState(), {
      spokenAt: speechAt,
      fragment: "这首先别动。",
    });
    const currentTrack = makeTrack("return", "medium");

    expect(afterSpeech.lastSpeakAt).toBe(speechAt);
    expect(afterSpeech.tracksSinceLastSpeak).toBe(0);
    expect(afterSpeech.minutesSinceLastSpeak).toBe(0);

    const afterSilence = evolveSoulState(afterSpeech, {
      currentTrack,
      previousTrack: null,
      lastSpeakAt: speechAt,
      tracksSinceLastSpeak: 3,
      minutesSinceLastSpeak: 7,
    });

    expect(afterSilence.lastSpeakAt).toBe(speechAt);
    expect(afterSilence.tracksSinceLastSpeak).toBe(3);
    expect(afterSilence.minutesSinceLastSpeak).toBe(7);
  });

  it("extends shared runtime types with soul-state fields", () => {
    expectTypeOf<RadioState>().toMatchTypeOf<{
      radioSoulState?: RadioSoulState;
      lastSpeakAt?: number | null;
      tracksSinceLastSpeak?: number;
      minutesSinceLastSpeak?: number;
      forcedSpeakTriggered?: boolean;
      lastSoulShiftReason?: string | null;
    }>();

    expectTypeOf<DJDirectorContext>().toMatchTypeOf<{
      radioSoulState?: RadioSoulState;
      lastSpeakAt?: number | null;
      tracksSinceLastSpeak?: number;
      minutesSinceLastSpeak?: number;
      forcedSpeakTriggered?: boolean;
      lastSoulShiftReason?: string | null;
    }>();
  });
});
