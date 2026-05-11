import { describe, expect, it, vi } from "vitest";

import { buildBroadcastPersonaSystemPrompt } from "@/lib/dj/broadcast-persona-prompt";
import { DJDirector } from "@/lib/dj/dj-director";
import { LLMDJDirector, buildDirectorPromptPayload, normalizeDirectorDecision } from "@/lib/dj/llm-dj-director";
import type { DJDirectorDecision } from "@/lib/dj/dj-types";

describe("broadcast persona prompt", () => {
  it("describes Auralia as a radio persona instead of an assistant or music analyst", () => {
    const prompt = buildBroadcastPersonaSystemPrompt();

    expect(prompt).toContain("你不是 AI 助手");
    expect(prompt).toContain("陪人度过时间");
    expect(prompt).not.toContain("每次口播 1 到 3 句");
    expect(prompt).not.toContain("不超过 25 个中文字");
    expect(prompt).not.toContain("旋律线");
    expect(prompt).not.toContain("节奏推进");
    expect(prompt).not.toContain("人声靠前");
  });
});

describe("normalizeDirectorDecision", () => {
  it("maps a valid director payload into the paragraph contract", () => {
    const decision = normalizeDirectorDecision(
      {
        shouldSpeak: true,
        speech: "现在是下午，RAYE 这首歌的人声贴得很近，副歌里那点低频把空间压得刚刚好。",
        durationHintSec: 24,
        insertAfterTracks: 2,
        musicAction: { type: "skip", reason: "tighten the pace" },
        energy: "high",
      },
      {
        allowedTrackIds: ["trk_1", "trk_2"],
      },
    );

    expect(decision).toEqual<DJDirectorDecision>({
      shouldSpeak: true,
      speech: "现在是下午，RAYE 这首歌的人声贴得很近，副歌里那点低频把空间压得刚刚好。",
      durationHintSec: 24,
      insertAfterTracks: 2,
      musicAction: { type: "skip", reason: "tighten the pace" },
      energy: "high",
    });
  });

  it("accepts numeric energy values from the live model and normalizes them", () => {
    const decision = normalizeDirectorDecision(
      {
        shouldSpeak: true,
        speech: "外面的光还没完全退掉，这首歌先把房间里的边角照出来，先别急着切走。",
        durationHintSec: 25,
        insertAfterTracks: 2,
        musicAction: { type: "none" },
        energy: 0.4,
      },
      {
        allowedTrackIds: ["trk_1", "trk_2"],
      },
    );

    expect(decision).toEqual<DJDirectorDecision>({
      shouldSpeak: true,
      speech: "外面的光还没完全退掉，这首歌先把房间里的边角照出来，先别急着切走。",
      durationHintSec: 25,
      insertAfterTracks: 2,
      musicAction: { type: "none" },
      energy: "mid",
    });
  });

  it("rejects legacy host-copy shaped payloads", () => {
    const decision = normalizeDirectorDecision(
      {
        action: "keep_flow",
        lines: ["This is the old shape."],
        reason: "legacy",
      },
      {
        allowedTrackIds: ["trk_1", "trk_2"],
      },
    );

    expect(decision).toBeNull();
  });

  it("should not generate sound hint template speech", () => {
    const decision = normalizeDirectorDecision(
      {
        shouldSpeak: true,
        speech: "下午的光有点平，先让这首歌在房间里待一会儿，别急着把注意力往别处挪。",
        durationHintSec: 20,
        insertAfterTracks: 2,
        musicAction: { type: "none" },
        energy: "mid",
      },
      {
        allowedTrackIds: ["wu-chuang", "someone-crowd"],
      },
    );

    expect(decision?.speech).toBeTruthy();
    expect(decision?.speech).not.toContain("里有");
    expect(decision?.speech).not.toContain("中文旋律线");
    expect(decision?.speech).not.toContain("下一首接");
    expect(decision?.speech).not.toContain("咬字更近");
    expect(decision?.speech).not.toContain("带出来");
  });
});

describe("LLMDJDirector", () => {
  const baseContext = {
    currentTrack: {
      id: "trk_1",
      providerTrackId: "trk_1",
      title: "Track 1",
      artist: "Artist 1",
      audioUrl: "https://example.com/1.mp3",
      durationMs: 180000,
      sourceType: "netease" as const,
      playableStatus: "playable" as const,
    },
    recentTracks: [],
    upcomingTracks: [],
    playableTrackPool: [],
    playedCount: 0,
    timeOfDay: "evening" as const,
    userMemory: {
      topArtists: [],
      topLanguages: [],
      topEras: [],
      inferredMoods: [],
      inferredStyles: [],
      energyProfile: "medium" as const,
      familiarityPreference: "balanced" as const,
      discoveryTolerance: "medium" as const,
      avoidPatterns: [],
      favoriteExamples: [],
      timeSlotPreferences: {},
      summary: "",
    },
    currentSegment: "main" as const,
  };

  it("builds a radio-native prompt payload instead of a product-control payload", () => {
    const payload = buildDirectorPromptPayload({
      trigger: "opening",
      context: {
        ...baseContext,
        nextTrack: {
          id: "trk_2",
          providerTrackId: "trk_2",
          title: "Track 2",
          artist: "Artist 2",
          audioUrl: "https://example.com/2.mp3",
          durationMs: 180000,
          sourceType: "netease",
          playableStatus: "playable",
        },
        recentTracks: [
          {
            id: "trk_prev",
            providerTrackId: "trk_prev",
            title: "Track Prev",
            artist: "Artist Prev",
            audioUrl: "https://example.com/prev.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
        ],
        upcomingTracks: [
          {
            id: "trk_2",
            providerTrackId: "trk_2",
            title: "Track 2",
            artist: "Artist 2",
            audioUrl: "https://example.com/2.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
          {
            id: "trk_3",
            providerTrackId: "trk_3",
            title: "Track 3",
            artist: "Artist 3",
            audioUrl: "https://example.com/3.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
        ],
        forceSpeak: true,
        tracksSinceLastSpeak: 2,
        minutesSinceLastSpeak: 6.3,
      },
    });

    expect(payload.forceSpeak).toBe(true);
    expect(payload.previousTrack).toEqual({
      providerTrackId: "trk_prev",
      title: "Track Prev",
      artist: "Artist Prev",
      album: null,
    });
    expect(payload.sceneContext).toEqual(
      expect.objectContaining({
        timeOfDay: "evening",
        silencePressure: expect.any(String),
        currentWindow: expect.any(String),
      }),
    );
    expect(payload.userMemorySummary).toBeTruthy();
    expect(payload).not.toHaveProperty("currentSegment");
    expect(payload).not.toHaveProperty("playedCount");
    expect(payload).not.toHaveProperty("musicState");
  });

  it("returns an offline result when the director API returns empty content", async () => {
    const deepseekClient = {
      isConfigured: () => true,
      model: "deepseek-chat",
      chatJson: vi.fn(async () => ({
        ok: true,
        rawText: "",
        data: undefined,
      })),
    };

    const director = new LLMDJDirector({ deepseekClient });
    const result = await director.decide({
      trigger: "opening",
      context: baseContext,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.mode).toBe("offline");
      expect(result.provider).toBe("deepseek");
      expect(result.error.type).toBe("empty_response");
    }
  });

  it("passes through a normalized director decision from valid JSON", async () => {
    const deepseekClient = {
      isConfigured: () => true,
      model: "deepseek-chat",
      chatJson: vi.fn(async () => ({
        ok: true,
        rawText:
          '{"shouldSpeak":true,"speech":"现在别急着把注意力移开，这首歌的人声和低频正在把空间收拢。","durationHintSec":26,"insertAfterTracks":3,"musicAction":{"type":"reorder","trackIds":["trk_2","trk_3"]},"energy":"high"}',
        data: {
          shouldSpeak: true,
          speech: "现在别急着把注意力移开，这首歌的人声和低频正在把空间收拢。",
          durationHintSec: 26,
          insertAfterTracks: 3,
          musicAction: { type: "reorder", trackIds: ["trk_2", "trk_3"] },
          energy: "high",
        },
      })),
    };

    const director = new LLMDJDirector({ deepseekClient });
    const result = await director.decide({
      trigger: "user_tune",
      context: {
        ...baseContext,
        upcomingTracks: [
          {
            id: "trk_2",
            providerTrackId: "trk_2",
            title: "Track 2",
            artist: "Artist 2",
            audioUrl: "https://example.com/2.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
        ],
        playableTrackPool: [
          {
            id: "trk_2",
            providerTrackId: "trk_2",
            title: "Track 2",
            artist: "Artist 2",
            audioUrl: "https://example.com/2.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
          {
            id: "trk_3",
            providerTrackId: "trk_3",
            title: "Track 3",
            artist: "Artist 3",
            audioUrl: "https://example.com/3.mp3",
            durationMs: 180000,
            sourceType: "netease",
            playableStatus: "playable",
          },
        ],
        playedCount: 1,
      },
      fallback: {
        shouldSpeak: true,
        speech: "fallback speech",
        durationHintSec: 22,
        insertAfterTracks: 2,
        musicAction: { type: "none" },
        energy: "mid",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toEqual<DJDirectorDecision>({
        shouldSpeak: true,
        speech: "现在别急着把注意力移开，这首歌的人声和低频正在把空间收拢。",
        durationHintSec: 26,
        insertAfterTracks: 3,
        musicAction: { type: "reorder", trackIds: ["trk_2", "trk_3"] },
        energy: "high",
      });
    }
  });

  it("retries once when shouldSpeak is true but speech is empty", async () => {
    const deepseekClient = {
      isConfigured: () => true,
      model: "deepseek-chat",
      chatJson: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          rawText: '{"shouldSpeak":true,"speech":"","durationHintSec":20,"insertAfterTracks":2,"musicAction":{"type":"none"},"energy":"mid"}',
          data: {
            shouldSpeak: true,
            speech: "",
            durationHintSec: 20,
            insertAfterTracks: 2,
            musicAction: { type: "none" },
            energy: "mid",
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          rawText:
            '{"shouldSpeak":true,"speech":"现在可以自然开口了，这首歌把房间收得很近，后面我想让器乐慢一点长出来。","durationHintSec":28,"insertAfterTracks":2,"musicAction":{"type":"none"},"energy":"mid"}',
          data: {
            shouldSpeak: true,
            speech: "现在可以自然开口了，这首歌把房间收得很近，后面我想让器乐慢一点长出来。",
            durationHintSec: 28,
            insertAfterTracks: 2,
            musicAction: { type: "none" },
            energy: "mid",
          },
        }),
    };

    const director = new LLMDJDirector({ deepseekClient });
    const result = await director.decide({
      trigger: "opening",
      context: {
        ...baseContext,
        forceSpeak: true,
      },
    });

    expect(deepseekClient.chatJson).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.speech).toContain("现在可以自然开口了");
    }
  });
});

describe("DJDirector", () => {
  it("stays silent when live director is unavailable", async () => {
    const director = new DJDirector({
      useLLM: true,
      llmDirector: {
        decide: vi.fn(async () => ({
          ok: false as const,
          mode: "offline" as const,
          provider: "unknown" as const,
          configured: false,
          model: "deepseek-chat",
          decision: null,
          rawPrompt: "prompt",
          rawResponse: undefined,
          error: {
            type: "config_missing" as const,
            message: "DEEPSEEK_API_KEY is not configured.",
          },
        })),
      } as never,
    });

    const decision = await director.decide("opening", {
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
      timeOfDay: "afternoon",
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
      recentLines: [],
    });

    expect(decision.shouldSpeak).toBe(false);
    expect(decision.lines).toEqual([]);
    expect(decision.meta?.usedFallback).toBe(true);
    expect(decision.meta?.fallbackReason).toContain("DEEPSEEK_API_KEY");
  });

  it("preserves a live director paragraph instead of collapsing into silence", async () => {
    const trackA = {
      id: "trk_1",
      providerTrackId: "trk_1",
      title: "Goodbye Henry.",
      artist: "RAYE",
      album: "My 21st Century Blues",
      audioUrl: "https://example.com/1.mp3",
      durationMs: 180000,
      sourceType: "netease" as const,
      playableStatus: "playable" as const,
      tags: {
        energy: "medium" as const,
        style: ["soul"],
        mood: ["warm"],
      },
    };
    const trackB = {
      id: "trk_2",
      providerTrackId: "trk_2",
      title: "Love In The Dark",
      artist: "Adele",
      album: "25",
      audioUrl: "https://example.com/2.mp3",
      durationMs: 180000,
      sourceType: "netease" as const,
      playableStatus: "playable" as const,
      tags: {
        energy: "low" as const,
        style: ["ballad"],
        mood: ["dark"],
      },
    };

    const director = new DJDirector({
      useLLM: true,
      llmDirector: {
        decide: vi.fn(async () => ({
          ok: true,
          mode: "live" as const,
          provider: "deepseek" as const,
          configured: true as const,
          model: "deepseek-chat",
          decision: {
            shouldSpeak: true,
            speech: "现在是下午，RAYE 这首歌的人声贴得很近，副歌里那点低频把空间压得刚刚好。",
            durationHintSec: 24,
            insertAfterTracks: 2,
            musicAction: { type: "none" as const },
            energy: "mid" as const,
          },
          rawPrompt: "prompt",
          rawResponse: "response",
          error: null,
        })),
      } as never,
    });

    const decision = await director.decide("opening", {
      currentTrack: trackA,
      nextTrack: trackB,
      recentTracks: [],
      upcomingTracks: [trackB],
      playableTrackPool: [trackA, trackB],
      playedCount: 0,
      timeOfDay: "afternoon",
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
      recentLines: [],
    });

    expect(decision.shouldSpeak).toBe(true);
    expect(decision.lines).toEqual(["现在是下午，RAYE 这首歌的人声贴得很近，副歌里那点低频把空间压得刚刚好。"]);
    expect(decision.meta?.provider).toBe("deepseek");
    expect(decision.meta?.rawPrompt).toBe("prompt");
    expect(decision.meta?.rawResponse).toBe("response");
    expect(decision.meta?.scriptDebug?.bypassedGuard).toBe(true);
  });

  it("preserves a long live paragraph without truncating it to legacy line limits", async () => {
    const longSpeech =
      "This opening paragraph should stay intact even when it runs well past the old forty character clamp, because the live director path now speaks in full radio segments instead of chopped host lines.";
    const director = new DJDirector({
      useLLM: true,
      llmDirector: {
        decide: vi.fn(async () => ({
          ok: true,
          mode: "live" as const,
          provider: "deepseek" as const,
          configured: true as const,
          model: "deepseek-chat",
          decision: {
            shouldSpeak: true,
            speech: longSpeech,
            durationHintSec: 28,
            insertAfterTracks: 2,
            musicAction: { type: "none" as const },
            energy: "mid" as const,
          },
          rawPrompt: "prompt",
          rawResponse: "response",
          error: null,
        })),
      } as never,
    });

    const decision = await director.decide("opening", {
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
      recentLines: [],
    });

    expect(decision.lines).toEqual([longSpeech]);
  });
});
