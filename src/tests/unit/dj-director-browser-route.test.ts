import { describe, expect, it, vi, afterEach } from "vitest";

import { LLMDJDirector } from "@/lib/dj/llm-dj-director";

describe("LLMDJDirector browser route path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the server director route in browser runtime", async () => {
    vi.stubGlobal("window", {} as Window & typeof globalThis);

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        provider: "deepseek",
        configured: true,
        model: "deepseek-chat",
        decision: {
          shouldSpeak: true,
          speech: "外面的光还没有完全退掉，这首歌先把房间的门轻轻推开一点，我们不用急着解释它，先让它自己把空气站稳。",
          durationHintSec: 23,
          insertAfterTracks: 2,
          musicAction: { type: "none" },
          energy: "mid",
        },
        rawPrompt: "server-prompt",
        rawResponse:
          '{"shouldSpeak":true,"speech":"外面的光还没有完全退掉，这首歌先把房间的门轻轻推开一点，我们不用急着解释它，先让它自己把空气站稳。","durationHintSec":23,"insertAfterTracks":2,"musicAction":{"type":"none"},"energy":"mid"}',
        error: null,
      }),
    })) as unknown as typeof fetch;

    const director = new LLMDJDirector({ fetchImpl });
    const result = await director.decide({
      trigger: "opening",
      context: {
        currentTrack: {
          id: "trk_1",
          providerTrackId: "trk_1",
          title: "Track 1",
          artist: "Artist 1",
          audioUrl: "https://example.com/1.mp3",
          durationMs: 180000,
          sourceType: "netease",
          playableStatus: "playable",
        },
        recentTracks: [],
        upcomingTracks: [],
        playableTrackPool: [],
        playedCount: 0,
        timeOfDay: "evening",
        userMemory: {
          topArtists: [],
          topLanguages: [],
          topEras: [],
          inferredMoods: [],
          inferredStyles: [],
          energyProfile: "medium",
          familiarityPreference: "balanced",
          discoveryTolerance: "medium",
          avoidPatterns: [],
          favoriteExamples: [],
          timeSlotPreferences: {},
          summary: "",
        },
        currentSegment: "main",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/dj/director",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("deepseek");
      expect(result.decision.speech).toContain("房间的门");
      expect(result.rawPrompt).toBe("server-prompt");
    }
  });

  it("keeps browser fetch callable when the implementation is receiver-sensitive", async () => {
    vi.stubGlobal("window", {} as Window & typeof globalThis);

    const receiverSensitiveFetch = vi.fn(function (this: unknown) {
      if (this && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          provider: "deepseek",
          configured: true,
          model: "deepseek-chat",
          decision: {
            shouldSpeak: true,
            speech: "外面的光还没完全退掉，这首歌先把房间里的边角照出来。",
            durationHintSec: 24,
            insertAfterTracks: 2,
            musicAction: { type: "none" },
            energy: "mid",
          },
          rawPrompt: "server-prompt",
          rawResponse:
            '{"shouldSpeak":true,"speech":"外面的光还没完全退掉，这首歌先把房间里的边角照出来。","durationHintSec":24,"insertAfterTracks":2,"musicAction":{"type":"none"},"energy":"mid"}',
          error: null,
        }),
      });
    }) as unknown as typeof fetch;

    const director = new LLMDJDirector({ fetchImpl: receiverSensitiveFetch });
    const result = await director.decide({
      trigger: "opening",
      context: {
        currentTrack: {
          id: "trk_1",
          providerTrackId: "trk_1",
          title: "Track 1",
          artist: "Artist 1",
          audioUrl: "https://example.com/1.mp3",
          durationMs: 180000,
          sourceType: "netease",
          playableStatus: "playable",
        },
        recentTracks: [],
        upcomingTracks: [],
        playableTrackPool: [],
        playedCount: 0,
        timeOfDay: "morning",
        userMemory: {
          topArtists: [],
          topLanguages: [],
          topEras: [],
          inferredMoods: [],
          inferredStyles: [],
          energyProfile: "medium",
          familiarityPreference: "balanced",
          discoveryTolerance: "medium",
          avoidPatterns: [],
          favoriteExamples: [],
          timeSlotPreferences: {},
          summary: "",
        },
        currentSegment: "warmup",
      },
    });

    expect(result.ok).toBe(true);
    expect(receiverSensitiveFetch).toHaveBeenCalledTimes(1);
  });
});
