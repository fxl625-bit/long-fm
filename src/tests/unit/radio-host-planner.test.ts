import { describe, expect, it } from "vitest";
import { createTalkBreakPlan } from "@/lib/dj/radio-host-planner";
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

describe("createTalkBreakPlan", () => {
  it("selects an opening pattern with time and current-song anchors", async () => {
    const plan = await createTalkBreakPlan({
      event: "opening",
      timeOfDay: "afternoon",
      currentSongBrief: makeBrief(),
      nextSongBrief: makeBrief({
        providerTrackId: "2609698825",
        title: "take your vibes and go",
        artist: "Kito / Kah-Lo / Brazy / Baauer",
      }),
      recentLines: [],
    });

    expect(["time_check", "station_id", "story_opening"]).toContain(plan.pattern);
    expect(plan.requiredAnchors).toEqual(expect.arrayContaining(["time", "current_song"]));
  });

  it("selects an emotional bridge pattern between tracks", async () => {
    const plan = await createTalkBreakPlan({
      event: "bridge_to_next",
      timeOfDay: "evening",
      currentSongBrief: makeBrief(),
      previousSongBrief: makeBrief({
        providerTrackId: "36841427",
        title: "Love In The Dark",
        artist: "Adele",
      }),
      nextSongBrief: makeBrief({
        providerTrackId: "29097535",
        title: "彩蝶舞夏",
        artist: "何真真",
        sourceQuality: "partial",
      }),
      recentLines: [],
    });

    expect(["emotional_bridge", "forward_announce", "back_announce"]).toContain(plan.pattern);
    expect(plan.requiredAnchors).toEqual(expect.arrayContaining(["previous_song", "next_song", "sound_detail"]));
  });

  it("avoids song background mode when source quality is thin", async () => {
    const plan = await createTalkBreakPlan({
      event: "introduce_current",
      timeOfDay: "morning",
      currentSongBrief: makeBrief({
        verifiedFacts: [],
        talkAngles: [
          {
            angle: "sound_detail",
            text: "更适合讲鼓点、钢琴和旋律线。",
            confidence: "high",
          },
        ],
        factsInsufficient: true,
        sourceQuality: "thin",
      }),
      recentLines: [],
    });

    expect(plan.pattern).toBe("sound_description");
    expect(plan.requiredAnchors).toEqual(expect.arrayContaining(["current_song", "sound_detail"]));
  });
});
