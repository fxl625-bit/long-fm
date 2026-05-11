import { describe, expect, it } from "vitest";
import { createProgramPlanWithDeepSeek } from "@/lib/dj/llm-program-planner";
import type { Track } from "@/lib/radio/radio-types";

function makeTrack(id: string, title: string, artist: string, album?: string): Track {
  return {
    id: `internal-${id}`,
    providerTrackId: id,
    neteaseId: id,
    title,
    artist,
    album,
    audioUrl: `https://audio.example/${id}.mp3`,
    durationMs: 180000,
    sourceType: "netease",
    playableStatus: "playable",
    tags: {
      language: /[\u4e00-\u9fff]/.test(`${title} ${artist}`) ? "中文" : "English",
      energy: /Wake Up|vibes|Paradise/i.test(title) ? "high" : /Dark|彩蝶|манго/i.test(title) ? "low" : "medium",
      style: ["pop"],
      mood: ["calm"],
    },
  };
}

const playableTrackPool = [
  makeTrack("3363281756", "Goodbye Henry. (feat. Al Green)", "RAYE / Al Green", "THIS MUSIC MAY CONTAIN HOPE."),
  makeTrack("2609698825", "take your vibes and go", "Kito / Kah-Lo / Brazy / Baauer"),
  makeTrack("3357209106", "Someone in the crowd", "雷米克斯"),
  makeTrack("36841427", "Love In The Dark", "Adele"),
  makeTrack("29097535", "彩蝶舞夏", "何真真"),
  makeTrack("1905096353", "манго нектар", "Corn Wave"),
  makeTrack("3342094891", "The Other Side Of Paradise", "Glass Animals"),
  makeTrack("2602954338", "Wake Up", "Imagine Dragons"),
  makeTrack("1368709511", "Bad Liar - Stripped", "Imagine Dragons"),
  makeTrack("3356620686", "I Bet My Life", "Imagine Dragons"),
  makeTrack("29722582", "Daylight Route", "M83"),
  makeTrack("428350724", "你给我听好", "陈奕迅"),
];

describe("createProgramPlanWithDeepSeek", () => {
  it("normalizes a DeepSeek plan into a structural program plan", async () => {
    const result = await createProgramPlanWithDeepSeek({
      playlistName: "刘莽叔叔喜欢的音乐",
      timeOfDay: "afternoon",
      userMemorySummary: "喜欢有空气感的歌，也接受中段拉亮一点。",
      playableTrackPool,
      recentTracks: playableTrackPool.slice(0, 2),
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText:
            '{"title":"把声音打开","intent":"先从熟悉和松弛的英文歌进入，中段把节奏推亮一点，最后收回到安静的旋律。","segments":[{"name":"Warmup","purpose":"warmup","mood":["松弛","熟悉"],"trackIds":["3363281756","36841427","29097535"],"hostAngle":"先让频道放低，不急着提速"},{"name":"Main","purpose":"main","mood":["更亮","节奏感"],"trackIds":["2609698825","3342094891","2602954338"],"hostAngle":"把节奏慢慢往前推"},{"name":"Shift","purpose":"shift","mood":["换颜色","透气"],"trackIds":["1905096353","3357209106","3356620686"],"hostAngle":"换一个声音和语种，让耳朵休息"}],"queueTrackIds":["3363281756","36841427","29097535","2609698825","3342094891","2602954338","1905096353","3357209106","3356620686"]}',
          data: {
            title: "把声音打开",
            intent: "先从熟悉和松弛的英文歌进入，中段把节奏推亮一点，最后收回到安静的旋律。",
            segments: [
              { name: "Warmup", purpose: "warmup", mood: ["松弛", "熟悉"], trackIds: ["3363281756", "36841427", "29097535"], hostAngle: "先让频道放低，不急着提速" },
              { name: "Main", purpose: "main", mood: ["更亮", "节奏感"], trackIds: ["2609698825", "3342094891", "2602954338"], hostAngle: "把节奏慢慢往前推" },
              { name: "Shift", purpose: "shift", mood: ["换颜色", "透气"], trackIds: ["1905096353", "3357209106", "3356620686"], hostAngle: "换一个声音和语种，让耳朵休息" },
            ],
            queueTrackIds: ["3363281756", "36841427", "29097535", "2609698825", "3342094891", "2602954338", "1905096353", "3357209106", "3356620686"],
          },
        }),
        isConfigured: () => true,
        model: "deepseek-chat",
      } as never,
    });

    expect(result.provider).toBe("deepseek");
    expect(result.usedFallback).toBe(false);
    expect(result.parsedPlan?.title).toBe("把声音打开");
    expect(result.parsedPlan?.segments).toHaveLength(3);
    expect(result.parsedPlan?.queueTrackIds.length).toBeGreaterThanOrEqual(9);
    expect(result.parsedPlan?.queueTrackIds.every((id) => playableTrackPool.some((track) => track.providerTrackId === id))).toBe(true);
    expect(result.parsedPlan).not.toHaveProperty("hostingMoments");
    expect(result.parsedPlan).not.toHaveProperty("openingLines");
  });
});
