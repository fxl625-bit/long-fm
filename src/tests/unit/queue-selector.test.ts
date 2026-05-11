import { describe, expect, it } from "vitest";
import { inferQueueIntent, selectTracksForIntent } from "@/lib/dj/queue-selector";
import type { Track } from "@/lib/radio/radio-types";

function track(id: string, input: Partial<Track> = {}): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    sourceType: "netease",
    playableStatus: "playable",
    audioUrl: `https://audio.example/${id}.mp3`,
    durationMs: 180000,
    tags: {
      language: "中文",
      energy: "medium",
      style: ["pop"],
      mood: ["warm"],
    },
    ...input,
  };
}

describe("queue-selector", () => {
  it("prefers chinese tracks for more_chinese while avoiding the current artist", () => {
    const currentTrack = track("current", { artist: "Same Artist", title: "Current" });
    const pool = [
      currentTrack,
      track("en-1", { title: "Wake Up", artist: "Imagine Dragons", tags: { language: "English", energy: "high", style: ["rock"], mood: ["bright"] } }),
      track("zh-1", { title: "彩蝶舞夏", artist: "何真真", tags: { language: "中文", energy: "low", style: ["instrumental"], mood: ["soft"] } }),
      track("zh-2", { title: "城市夜路", artist: "另一位歌手", tags: { language: "中文", energy: "medium", style: ["pop"], mood: ["city"] } }),
      track("same-artist", { title: "重复歌手", artist: "Same Artist", tags: { language: "中文", energy: "medium", style: ["pop"], mood: ["warm"] } }),
    ];

    const selected = selectTracksForIntent({
      intent: "more_chinese",
      currentTrack,
      recentTracks: [currentTrack],
      upcomingTracks: [],
      pool,
      count: 3,
    });

    expect(selected).toContain("zh-1");
    expect(selected).toContain("zh-2");
    expect(selected).not.toContain("same-artist");
  });

  it("maps natural language tune text into a stable selector intent", () => {
    expect(inferQueueIntent("多一点英文")).toBe("more_english");
    expect(inferQueueIntent("更轻快一点")).toBe("more_rhythm");
    expect(inferQueueIntent("更安静一点")).toBe("quieter");
  });
});
