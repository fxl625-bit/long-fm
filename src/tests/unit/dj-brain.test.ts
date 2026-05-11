import { describe, expect, it } from "vitest";
import { resolveDJBrainDecision } from "@/lib/dj/dj-brain";
import type { DJDirectorContext } from "@/lib/dj/dj-types";
import type { Track } from "@/lib/radio/radio-types";

function track(id: string, input: Partial<Track> = {}): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
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

function makeContext(): DJDirectorContext {
  const currentTrack = track("3363281756", { title: "Goodbye Henry.", artist: "RAYE / Al Green", tags: { language: "English", energy: "low", style: ["soul"], mood: ["night"] } });
  const nextTrack = track("2609698825", { title: "take your vibes and go", artist: "Kito / Kah-Lo / Brazy / Baauer", tags: { language: "English", energy: "high", style: ["electronic"], mood: ["bright"] } });
  const upcoming = [
    nextTrack,
    track("3357209106", { title: "Someone in the crowd", artist: "雷米克斯", tags: { language: "中文", energy: "medium", style: ["pop"], mood: ["city"] } }),
    track("36841427", { title: "Love In The Dark", artist: "Adele", tags: { language: "English", energy: "low", style: ["ballad"], mood: ["dark"] } }),
    track("29097535", { title: "彩蝶舞夏", artist: "何真真", tags: { language: "中文", energy: "low", style: ["instrumental"], mood: ["soft"] } }),
  ];

  return {
    currentTrack,
    nextTrack,
    recentTracks: [currentTrack],
    upcomingTracks: upcoming,
    playableTrackPool: [currentTrack, ...upcoming],
    playedCount: 1,
    timeOfDay: "evening",
    userMemory: {
      topArtists: ["RAYE / Al Green"],
      topLanguages: ["English", "中文"],
      topEras: ["2020s"],
      inferredMoods: ["night"],
      inferredStyles: ["soul"],
      energyProfile: "mixed",
      familiarityPreference: "balanced",
      discoveryTolerance: "medium",
      avoidPatterns: [],
      favoriteExamples: [],
      timeSlotPreferences: {},
      summary: "喜欢夜里带空气感的歌。",
    },
    currentSegment: "main",
    userIntent: "更轻快一点",
    musicState: {
      isPlaying: true,
      isPaused: false,
      currentTime: 12000,
      duration: 180000,
    },
    recentLines: ["刚刚这首先把频道放松了一点。"],
  };
}

describe("resolveDJBrainDecision", () => {
  it("blockedOpeningShouldTriggerRewrite", async () => {
    let hostWriterCalls = 0;
    const result = await resolveDJBrainDecision({
      trigger: "opening",
      context: makeContext(),
      deps: {
        songBriefBuilder: async (track) => ({
          providerTrackId: track.providerTrackId ?? track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          releaseYear: "2024",
          sourceFacts: [],
          verifiedFacts: [`${track.title} 收录在 ${track.album ?? "专辑"}。`],
          uncertainFacts: [],
          soundProfile: {
            vocal: "人声在前",
            rhythm: "节奏松弛",
            instruments: ["低频", "鼓"],
            mood: ["温暖"],
            energy: "medium",
            texture: ["老灵魂乐质感", "留白"],
          },
          talkAngles: [
            {
              angle: "sound_detail",
              text: `${track.title} 的人声和低频贴得很近。`,
              confidence: "high",
            },
          ],
          safeToSay: [`${track.title} 的人声和低频贴得很近。`],
          avoidSaying: [],
          factsInsufficient: false,
          sourceQuality: "rich",
        }),
        hostWriter: {
          write: async (input) => {
            hostWriterCalls += 1;
            if (hostWriterCalls === 1) {
              return {
                lines: ["Current Song: Goodbye Henry."],
                usedFacts: ["Goodbye Henry. 收录在 Album 3363281756。"],
                usedAngles: ["sound_detail"],
                qualityNotes: "blocked by final guard",
              };
            }

            expect(input.failureReason).toContain("final_guard_blocked");
            expect(input.currentSongBrief.title).toBe("Goodbye Henry.");
            expect(input.nextSongBrief?.title).toBe("take your vibes and go");
            expect(input.plan.pattern).toBeTruthy();
            return {
              lines: [
                "这里是 Long FM。",
                "这个时间先让声音贴近一点，但不急着把节奏推满。",
                "RAYE 和 Al Green 把《Goodbye Henry.》唱得很近，像一盏低一点的灯。",
                "第一段先顺着这点灵魂乐的温度往前走。",
              ],
              usedFacts: ["Goodbye Henry. 收录在 Album 3363281756。"],
              usedAngles: ["sound_detail", "transition"],
              qualityNotes: "rewritten after final guard",
            };
          },
        },
      },
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"keep_flow","shouldSpeak":true,"reason":"opening"}',
          data: {
            action: "keep_flow",
            shouldSpeak: true,
            reason: "opening",
          },
        }),
      } as never,
    });

    expect(hostWriterCalls).toBeGreaterThanOrEqual(2);
    expect(result.parsedDecision?.shouldSpeak).toBe(true);
    expect(result.parsedDecision?.lines.length).toBeGreaterThanOrEqual(3);
    expect(result.parsedDecision?.lines.join("")).not.toContain("靠近一点的人声把节目接上");
    expect(result.parsedDecision?.meta?.scriptDebug?.quality?.pass).toBe(true);
  });

  it("rewrites a generic banned opening into a concrete anchored talk break", async () => {
    let hostWriterCalls = 0;
    const result = await resolveDJBrainDecision({
      trigger: "introduce_current",
      context: makeContext(),
      deps: {
        hostWriter: {
          write: async () => {
            hostWriterCalls += 1;
            if (hostWriterCalls === 1) {
              return {
                lines: ["先接上你最近常回来的这几首。"],
                usedFacts: ["Goodbye Henry. 收录在 Album 3363281756。"],
                usedAngles: ["song_background"],
                qualityNotes: "generic",
              };
            }

            return {
              lines: [
                "有些歌一出来，不太需要主持人急着解释。",
                "RAYE 和 Al Green 把低频压得很稳，人声却贴得很近，等会儿再把《彩蝶舞夏》的钢琴和留白慢慢放进来。",
              ],
              usedFacts: ["Goodbye Henry. 收录在 Album 3363281756。"],
              usedAngles: ["sound_detail", "transition"],
              qualityNotes: "rewrite",
            };
          },
        },
      },
      deepseekClient: {
        chatJson: async () => {
          return {
            ok: true,
            rawText: '{"action":"introduce_current","shouldSpeak":true,"reason":"generic"}',
            data: {
              action: "introduce_current",
              shouldSpeak: true,
              reason: "generic",
            },
          };
        },
      } as never,
    });

    expect(hostWriterCalls).toBe(2);
    expect(result.usedFallback).toBe(false);
    expect(result.parsedDecision?.lines.join(" ")).not.toContain("先接上你最近常回来的这几首");
    expect(result.parsedDecision?.lines.join(" ")).toContain("RAYE");
    expect(result.parsedDecision?.lines.join(" ")).toContain("彩蝶舞夏");
  });

  it("drops the spoken lines when both the first draft and rewrite stay generic", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "introduce_current",
      context: makeContext(),
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"introduce_current","shouldSpeak":true,"lines":["前面我不拉太满。"],"reason":"generic"}',
          data: {
            action: "introduce_current",
            shouldSpeak: true,
            lines: ["前面我不拉太满。"],
            reason: "generic",
          },
        }),
      } as never,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.parsedDecision?.lines).toEqual([]);
    expect(result.parsedDecision?.shouldSpeak).toBe(false);
  });

  it("fills a missing user_tune queuePatch with a selector-backed patch while keeping deepseek as provider", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "user_tune",
      context: makeContext(),
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"user_tune","shouldSpeak":true,"lines":["这首先留点余温。","后面我把步子往前带一点。"],"reason":"Need a brighter lane."}',
          data: {
            action: "user_tune",
            shouldSpeak: true,
            lines: ["这首先留点余温。", "后面我把步子往前带一点。"],
            reason: "Need a brighter lane.",
          },
        }),
      } as never,
    });

    expect(result.provider).toBe("deepseek");
    expect(result.configured).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.parsedDecision?.queuePatch?.trackIds.length).toBeGreaterThan(0);
    expect(result.parsedDecision?.queuePatch?.mode).toBe("reorder_upcoming");
  });

  it("forces a user_tune-style actionable patch even if the model replies keep_flow", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "user_tune",
      context: makeContext(),
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"keep_flow","shouldSpeak":true,"lines":["这一段先别断。"],"reason":"Hold the lane."}',
          data: {
            action: "keep_flow",
            shouldSpeak: true,
            lines: ["这一段先别断。"],
            reason: "Hold the lane.",
          },
        }),
      } as never,
    });

    expect(result.provider).toBe("deepseek");
    expect(result.usedFallback).toBe(false);
    expect(result.parsedDecision?.action).toBe("user_tune");
    expect(result.parsedDecision?.queuePatch?.trackIds.length).toBeGreaterThanOrEqual(3);
  });

  it("treats talk plus null queuePatch as a recoverable user_tune response instead of falling back to keep_flow", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "user_tune",
      context: makeContext(),
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"talk_and_continue","talk":"下一首会推高一点，保持城市的节奏。","queuePatch":null}',
          data: {
            action: "talk_and_continue",
            talk: "下一首会推高一点，保持城市的节奏。",
            queuePatch: null,
          },
        }),
      } as never,
    });

    expect(result.provider).toBe("deepseek");
    expect(result.usedFallback).toBe(false);
    expect(result.parsedDecision?.action).toBe("user_tune");
    expect(result.parsedDecision?.shouldSpeak).toBe(false);
    expect(result.parsedDecision?.lines).toEqual([]);
    expect(result.parsedDecision?.queuePatch?.trackIds.length).toBeGreaterThanOrEqual(3);
  });

  it("anchors user_tune copy to the current track and selected target track after queue selection", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "user_tune",
      context: {
        ...makeContext(),
        userIntent: "轻松一点",
      },
      deps: {
        hostWriter: {
          write: async () => ({
            lines: ["RAYE 这首的低频还在压着。", "我直接切到何真真的《彩蝶舞夏》，让钢琴先把房间松开。"],
            usedFacts: ["彩蝶舞夏 是何真真的器乐作品。"],
            usedAngles: ["sound_detail", "transition"],
            qualityNotes: "move lighter now",
          }),
        },
      },
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"user_tune","shouldSpeak":true,"queuePatch":{"mode":"skip_now","trackIds":["29097535","36841427","3357209106"]},"reason":"move lighter now"}',
          data: {
            action: "user_tune",
            shouldSpeak: true,
            queuePatch: {
              mode: "skip_now",
              trackIds: ["29097535", "36841427", "3357209106"],
            },
            reason: "move lighter now",
          },
        }),
      } as never,
    });

    expect(result.parsedDecision?.queuePatch?.trackIds[0]).toBe("29097535");
    expect(result.parsedDecision?.lines.join(" ")).toContain("RAYE");
    expect(result.parsedDecision?.lines.join(" ")).toContain("彩蝶舞夏");
  });

  it("stores SongBrief-driven script debug metadata alongside the decision", async () => {
    const result = await resolveDJBrainDecision({
      trigger: "introduce_current",
      context: makeContext(),
      deps: {
        songBriefBuilder: async (track) => ({
          providerTrackId: track.providerTrackId ?? track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          releaseYear: "2024",
          sourceFacts: [
            {
              type: "manual_cache",
              content: "Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。",
              confidence: "high",
            },
          ],
          verifiedFacts: ["Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。"],
          uncertainFacts: [],
          lyricBrief: {
            language: "en",
            theme: "回望一段关系留下的余波",
            excerpt: "I still hear the room move",
          },
          lyricTheme: "回望一段关系留下的余波",
          lyricExcerpt: "I still hear the room move",
          soundProfile: {
            vocal: "RAYE 主唱在前，Al Green 的声线更老派",
            rhythm: "松弛但有回摆",
            instruments: ["低频", "鼓点"],
            mood: ["复古灵魂感"],
            energy: "medium",
            texture: ["人声靠前", "留白"],
          },
          talkAngles: [
            {
              angle: "album_context",
              text: "它放在 THIS MUSIC MAY CONTAIN HOPE. 里，更像一段向复古灵魂乐借光的章节。",
              confidence: "high",
            },
          ],
          safeToSay: ["它放在 THIS MUSIC MAY CONTAIN HOPE. 里，更像一段向复古灵魂乐借光的章节。"],
          avoidSaying: [],
          factsInsufficient: false,
          sourceQuality: "rich",
        }),
        hostWriter: {
          write: async () => ({
            lines: ["有些歌一出来，不太需要主持人急着解释。", "《Goodbye Henry.》收在 THIS MUSIC MAY CONTAIN HOPE. 里，像是先借来一点老灵魂乐的光。"],
            usedFacts: ["Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。"],
            usedAngles: ["album_context", "transition"],
            qualityNotes: "用了专辑信息和声音对照。",
            rawPrompt: "host-writer-prompt",
            rawResponse: "{\"lines\":[\"...\"],\"usedFacts\":[\"...\"]}",
          }),
        },
      },
      deepseekClient: {
        chatJson: async () => ({
          ok: true,
          rawText: '{"action":"introduce_current","shouldSpeak":true,"reason":"track intro","queuePatch":null}',
          data: {
            action: "introduce_current",
            shouldSpeak: true,
            reason: "track intro",
            queuePatch: null,
          },
        }),
      } as never,
    });

    expect(result.parsedDecision?.meta?.scriptDebug?.songBrief?.album).toBe("Album 3363281756");
    expect(result.parsedDecision?.meta?.scriptDebug?.usedFacts).toContain("Goodbye Henry. 收录在 THIS MUSIC MAY CONTAIN HOPE.。");
    expect(result.parsedDecision?.meta?.scriptDebug?.quality?.pass).toBe(true);
    expect(result.parsedDecision?.lines.join(" ")).toContain("THIS MUSIC MAY CONTAIN HOPE.");
  });
});
