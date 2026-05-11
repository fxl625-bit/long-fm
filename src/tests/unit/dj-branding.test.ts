import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants/product";
import {
  buildDirectorSystemPrompt,
  buildProgramPlannerSystemPrompt,
  buildProgramPlannerUserPrompt,
} from "@/lib/dj/dj-prompt-builder";
import { normalizeProgramPlan } from "@/lib/llm/dj-json-schema";
import type { Track } from "@/lib/radio/radio-types";

function makeTrack(id: string, title: string, artist: string): Track {
  return {
    id: `internal-${id}`,
    providerTrackId: id,
    neteaseId: id,
    title,
    artist,
    album: "Album",
    audioUrl: `https://audio.example/${id}.mp3`,
    durationMs: 180000,
    sourceType: "netease",
    playableStatus: "playable",
    tags: {
      language: /[\u4e00-\u9fff]/.test(`${title}${artist}`) ? "中文" : "English",
      energy: "medium",
      style: ["pop"],
      mood: ["calm"],
    },
  };
}

describe("DJ branding and all-day prompts", () => {
  it("uses Long FM as the default product identity", () => {
    expect(PRODUCT_NAME).toBe("Long FM");
    expect(PRODUCT_TAGLINE).toBe("你的私人 AI DJ 电台");
  });

  it("keeps planner and director prompts all-day and structural-only", () => {
    const plannerPrompt = buildProgramPlannerSystemPrompt();
    const directorPrompt = buildDirectorSystemPrompt();
    const userPrompt = buildProgramPlannerUserPrompt({
      playlistName: "我的频道",
      timeOfDay: "afternoon",
      userMemorySummary: "喜欢熟悉但不沉重的声音。",
      playableTrackPool: [makeTrack("1", "Today", "Artist A"), makeTrack("2", "午后留声", "歌手 B")],
      recentTracks: [makeTrack("1", "Today", "Artist A")],
    });

    expect(plannerPrompt).toContain("Long FM");
    expect(plannerPrompt).toContain("ProgramPlan");
    expect(plannerPrompt).toContain("openingLine、openingLines、hostingMoments、djMoments");
    expect(directorPrompt).toContain("Long FM");
    expect(directorPrompt).toContain("不要自行改成夜色频道");
    expect(userPrompt).toContain("morning / afternoon / evening");
    expect(userPrompt).toContain("soundHints、knownContext");
  });

  it("normalizes fallback program structure without spoken-copy fields", () => {
    const plan = normalizeProgramPlan(
      {},
      {
        allowedTrackIds: ["3363281756", "2609698825", "3357209106", "36841427"],
      },
    );

    expect(plan.title).toBe("Long FM");
    expect(plan.intent).toBe("先接住熟悉感，再慢慢推进，让这一段频道自然流动。");
    expect("openingLine" in plan).toBe(false);
    expect("openingLines" in plan).toBe(false);
    expect("djMoments" in plan).toBe(false);
    expect("hostingMoments" in plan).toBe(false);
    expect(plan.queueTrackIds).toEqual(["3363281756", "2609698825", "3357209106", "36841427"]);
  });
});
