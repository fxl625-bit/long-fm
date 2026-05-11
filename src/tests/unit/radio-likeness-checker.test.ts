import { describe, expect, it } from "vitest";
import { evaluateRadioLikeness } from "@/lib/dj/radio-likeness-checker";
import type { DJLineValidationContext } from "@/lib/dj/dj-line-quality-checker";
import type { SongBrief } from "@/lib/dj/song-brief-service";

function makeBrief(overrides: Partial<SongBrief> = {}): SongBrief {
  return {
    providerTrackId: "3363281756",
    title: "Goodbye Henry. (feat. Al Green)",
    artist: "RAYE / Al Green",
    album: "THIS MUSIC MAY CONTAIN HOPE.",
    releaseYear: "2024",
    sourceFacts: [],
    verifiedFacts: ["RAYE 和 Al Green 的合作关系，让这首歌天然带着新旧灵魂乐的对照。"],
    uncertainFacts: [],
    lyricTheme: "回望一段关系留下的余波",
    lyricExcerpt: "I still hear the room move",
    soundProfile: {
      vocal: "RAYE 主唱在前，Al Green 的声线更老派",
      rhythm: "鼓点回摆明显",
      instruments: ["低频", "鼓点"],
      mood: ["复古灵魂感"],
      energy: "medium",
      texture: ["人声靠前", "留白"],
    },
    talkAngles: [
      {
        angle: "artist_story",
        text: "RAYE 和 Al Green 的合作关系，让这首歌天然带着新旧灵魂乐的对照。",
        confidence: "high",
      },
    ],
    safeToSay: ["RAYE 和 Al Green 的合作关系，让这首歌天然带着新旧灵魂乐的对照。"],
    avoidSaying: [],
    factsInsufficient: false,
    sourceQuality: "rich",
    ...overrides,
  };
}

function makeContext(): DJLineValidationContext {
  return {
    currentTrack: {
      providerTrackId: "3363281756",
      title: "Goodbye Henry. (feat. Al Green)",
      artist: "RAYE / Al Green",
      album: "THIS MUSIC MAY CONTAIN HOPE.",
      soundHints: ["复古灵魂感", "低频回摆", "人声靠前"],
    },
    previousTrack: {
      providerTrackId: "36841427",
      title: "Love In The Dark",
      artist: "Adele",
      album: "25",
      soundHints: ["厚重人声", "钢琴慢板", "情绪下坠"],
    },
    nextTrack: {
      providerTrackId: "29097535",
      title: "彩蝶舞夏",
      artist: "何真真",
      album: "The Color of Summer",
      soundHints: ["器乐", "钢琴", "旋律留白"],
    },
    transition: {
      from: "Adele 的厚重人声和钢琴",
      to: "何真真的器乐和旋律留白",
      why: "从压低的人声段落转到更松的器乐段",
    },
    segment: {
      name: "Main",
      purpose: "main",
      mood: ["松弛", "熟悉"],
      hostNarrative: "从近处的声音慢慢走到更松的旋律。",
    },
    recentLines: ["刚刚那首把灯压低了一点。"],
    timeOfDay: "evening",
    currentSongBrief: makeBrief(),
    nextSongBrief: makeBrief({
      providerTrackId: "29097535",
      title: "彩蝶舞夏",
      artist: "何真真",
      album: "The Color of Summer",
      verifiedFacts: ["《彩蝶舞夏》是何真真的器乐作品。"],
      sourceQuality: "partial",
    }),
    usedFacts: ["RAYE 和 Al Green 的合作关系，让这首歌天然带着新旧灵魂乐的对照。"],
    usedAngles: ["artist_story"],
  };
}

describe("evaluateRadioLikeness", () => {
  it("fails track label commentary", () => {
    const result = evaluateRadioLikeness(["Goodbye Henry. 人声靠前，带着复古灵魂的松弛感。"], makeContext());
    expect(result.pass).toBe(false);
    expect(result.failures).toContain("starts_with_track_title");
    expect(result.failures).toContain("tag_like_description");
  });

  it("fails announcement style next-track narration", () => {
    const result = evaluateRadioLikeness(["接下来 Adele 的厚重人声配上钢琴，情绪会更沉一些。"], makeContext());
    expect(result.pass).toBe(false);
    expect(result.failures).toContain("announcement_like");
  });

  it("passes a radio-like talk break", () => {
    const result = evaluateRadioLikeness(
      ["有些歌一出来，就不太需要主持人急着解释。", "Al Green 一进来，这首歌就像突然借来了一点老灵魂乐的光。"],
      makeContext(),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("fails placeholder leakage immediately", () => {
    const result = evaluateRadioLikeness(["Current Artist 这首《Current Song》还压着英文声线。"], makeContext());
    expect(result.pass).toBe(false);
    expect(result.failures).toContain("placeholder_leak");
  });
});
