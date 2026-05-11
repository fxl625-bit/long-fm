import { describe, expect, it } from "vitest";
import { arrangeProgramByRules } from "@/lib/engines/radio-arrangement-strategy";
import type { MusicTrack } from "@/lib/types/music";

const tracks: MusicTrack[] = Array.from({ length: 16 }).map((_, index) => ({
  id: `t-${index}`,
  name: `Song ${index}`,
  artist: index % 2 === 0 ? "Artist A" : `Artist ${index}`,
  album: "Album",
  duration: 220000,
  durationMs: 220000,
  sourceType: "DEMO",
  playableStatus: "playable",
  language: index % 3 === 0 ? "英文" : "中文",
  era: index % 2 === 0 ? "2010s" : "2000s",
  moodTags: index % 2 === 0 ? ["深夜", "通勤"] : ["怀旧", "开车"],
  styleTags: ["City Pop"],
  energyLevel: index % 4 === 0 ? "medium-high" : "medium-low",
  playCount: 10 + index,
}));

describe("arrangeProgramByRules", () => {
  it("returns ordered tracks with section flow", () => {
    const arranged = arrangeProgramByRules({
      tracks,
      userPrompt: "给我一组开车可连播节目，偏 2000s",
      profile: {
        moods: ["深夜", "怀旧"],
        languages: ["中文"],
        eras: ["2000s", "2010s"],
        energy: "medium-low",
        scenes: ["深夜", "开车"],
        keywords: ["City Pop"],
        topArtists: ["Artist A"],
        repeatFavorites: ["Song 1"],
        narrativePreference: "克制推进",
      },
      desiredTrackCount: 12,
      tweak: "more_nostalgic",
    });

    expect(arranged).toHaveLength(12);
    expect(arranged[0].section).toBe("opening");
    expect(arranged.some((item) => item.section === "lift")).toBe(true);
    expect(arranged.some((item) => item.section === "outro")).toBe(true);
  });
});
