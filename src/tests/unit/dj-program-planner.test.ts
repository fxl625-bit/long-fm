import { describe, expect, it } from "vitest";
import { createProgramWithGPT } from "@/lib/dj/program-planner";
import type { PlanProgramInput } from "@/lib/dj/dj-types";
import type { Track } from "@/lib/radio/radio-types";

function mkTrack(id: string): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    audioUrl: `https://demo/${id}.mp3`,
    playableStatus: "playable",
    sourceType: "demo",
    durationMs: 180000,
    tags: {
      mood: ["城市感"],
      style: ["Pop"],
      language: "中文",
      era: "2010s",
      energy: "medium",
      vocal: "mixed",
    },
  };
}

describe("createProgramWithGPT", () => {
  it("returns queueTrackIds only from candidates", async () => {
    const candidateTracks = Array.from({ length: 14 }, (_, idx) => mkTrack(`t-${idx + 1}`));
    const input: PlanProgramInput = {
      memory: {
        topArtists: ["Artist t-1"],
        topLanguages: ["中文"],
        topEras: ["2010s"],
        inferredMoods: ["城市感"],
        inferredStyles: ["Pop"],
        energyProfile: "medium",
        familiarityPreference: "balanced",
        discoveryTolerance: "medium",
        avoidPatterns: [],
        favoriteExamples: [],
        timeSlotPreferences: {},
        summary: "test",
      },
      context: {
        timeOfDay: "evening",
        weekdayType: "workday",
        likelyScene: "relax",
        energyTarget: "medium",
        recommendedMood: ["城市感"],
        reason: "test",
      },
      candidateTracks,
      recentPlayed: [],
      recentSkipped: [],
    };

    const plan = await createProgramWithGPT(input);
    const allowed = new Set(candidateTracks.map((track) => track.id));
    expect(plan.queueTrackIds.length).toBeGreaterThan(0);
    expect(plan.queueTrackIds.every((id) => allowed.has(id))).toBe(true);
  });
});

