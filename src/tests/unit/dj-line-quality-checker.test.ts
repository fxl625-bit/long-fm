import { describe, expect, it } from "vitest";
import { validateDJLines } from "@/lib/dj/dj-line-quality-checker";
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
    verifiedFacts: ["Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。"],
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
      name: "Warmup",
      purpose: "warmup",
      mood: ["松弛", "熟悉"],
      hostNarrative: "先把人声收住，再把旋律打开。",
    },
    recentLines: ["Adele 那首的钢琴先把情绪压低了。"],
    timeOfDay: "evening",
    currentSongBrief: makeBrief(),
    nextSongBrief: makeBrief({
      providerTrackId: "29097535",
      title: "彩蝶舞夏",
      artist: "何真真",
      album: "The Color of Summer",
      verifiedFacts: ["《彩蝶舞夏》是何真真的器乐作品。"],
      talkAngles: [
        {
          angle: "transition",
          text: "从 Adele 的厚重人声转到何真真的器乐，房间会亮一点。",
          confidence: "high",
        },
      ],
      safeToSay: ["从 Adele 的厚重人声转到何真真的器乐，房间会亮一点。"],
      sourceQuality: "partial",
    }),
  };
}

describe("validateDJLines", () => {
  it("shouldRejectCloseVocalTemplate", () => {
    const result = validateDJLines(["我先用一首靠近一点的人声把节目接上。"], makeContext());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/banned|negative|template/i);
  });

  it("shouldRejectBrightnessDrumTemplate", () => {
    const result = validateDJLines(["后面的亮度和鼓点会慢慢往前推。"], makeContext());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/banned|generic|negative/i);
  });

  it("shouldRejectTrackLabelCommentary", () => {
    const result = validateDJLines(
      ["Goodbye Henry. 人声靠前，带着复古灵魂的松弛感。"],
      {
        ...makeContext(),
        usedFacts: ["Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。"],
        usedAngles: ["sound_detail"],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/title|tag|narrative|radio/i);
  });

  it("shouldRejectNextTrackAnnouncement", () => {
    const result = validateDJLines(
      ["接下来 Adele 的厚重人声配上钢琴，情绪会更沉一些。"],
      {
        ...makeContext(),
        usedFacts: ["《彩蝶舞夏》是何真真的器乐作品。"],
        usedAngles: ["transition"],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/announcement|playlist|radio/i);
  });

  it("shouldPassRadioLikeTalkBreak", () => {
    const result = validateDJLines(
      ["Al Green 一进来，这首歌就不只是当代流行了。", "它像是突然借来了一点老灵魂乐的光。"],
      {
        ...makeContext(),
        usedFacts: ["RAYE 和 Al Green 的合作关系，让这首歌天然带着新旧灵魂乐的对照。"],
        usedAngles: ["artist_story"],
      },
    );
    expect(result.ok).toBe(true);
  });

  it("shouldRejectPlaceholder", () => {
    const result = validateDJLines(
      ["Current Artist 这首《Current Song》还压着英文声线。"],
      {
        ...makeContext(),
        usedFacts: ["placeholder"],
        usedAngles: ["sound_detail"],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/placeholder/i);
  });

  it("fails background-story lines when source quality is thin", () => {
    const result = validateDJLines(
      ["这首是 1998 年录音棚里留下的旧故事，后来才被重新发行。"],
      {
        ...makeContext(),
        currentSongBrief: makeBrief({
          factsInsufficient: true,
          sourceQuality: "thin",
          verifiedFacts: [],
          talkAngles: [
            {
              angle: "sound_detail",
              text: "这首更适合讲低频、鼓点和人声位置。",
              confidence: "high",
            },
          ],
          safeToSay: ["这首更适合讲低频、鼓点和人声位置。"],
        }),
        usedFacts: [],
        usedAngles: ["sound_detail"],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/thin|facts/i);
  });

  it("passes a thin-source talk break when it stays concrete and radio-like", () => {
    const result = validateDJLines(
      ["有些歌不用先报名字。", "低频压得很稳，人声贴得很近，等会儿再把钢琴和留白慢慢放进来。"],
      {
        ...makeContext(),
        currentSongBrief: makeBrief({
          factsInsufficient: true,
          sourceQuality: "thin",
          verifiedFacts: [],
          talkAngles: [
            {
              angle: "sound_detail",
              text: "这首更适合讲低频、人声、钢琴和留白之间的距离。",
              confidence: "high",
            },
          ],
          safeToSay: ["这首更适合讲低频、人声、钢琴和留白之间的距离。"],
        }),
        usedFacts: [],
        usedAngles: ["sound_detail", "transition"],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.radioLikenessScore).toBeGreaterThanOrEqual(75);
  });
});
