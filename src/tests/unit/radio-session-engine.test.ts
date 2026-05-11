import { afterEach, describe, expect, it, vi } from "vitest";
import { decideWithGPT } from "@/lib/dj/active-dj-planner";
import type { DJDirectingDecision, DJProgramPlan } from "@/lib/dj/dj-types";
import { RadioSessionEngine } from "@/lib/radio/radio-session-engine";
import { RadioStore } from "@/lib/radio/radio-store";
import { sanitizePlayableQueue } from "@/lib/radio/track-queue";
import type { PlaybackQueueItem } from "@/lib/types/music";
import type { ActiveDecisionInput } from "@/lib/dj/dj-types";
import type { RadioState, Track } from "@/lib/radio/radio-types";

function item(id: string, name: string, artist: string, audioUrl: string, playableStatus: "playable" | "metadata_only" = "playable"): PlaybackQueueItem {
  return {
    track: {
      id,
      name,
      artist,
      duration: 180000,
      durationMs: 180000,
      audioUrl: playableStatus === "playable" ? audioUrl : undefined,
      playableStatus,
      sourceType: "DEMO",
      styleTags: [id.includes("jazz") ? "Jazz" : "Pop"],
      language: id.includes("en") ? "鑻辨枃" : "涓枃",
      energyLevel: "medium",
    },
    section: "build",
  };
}

async function flushDirectorLoop() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForAssertion(assertion: () => void, attempts = 12) {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushDirectorLoop();
    }
  }
  throw lastError;
}

describe("radio session engine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("filters metadata_only and duplicate audio url tracks", () => {
    const queue = sanitizePlayableQueue([
      item("1", "A", "AA", "https://demo/a.mp3"),
      item("2", "B", "BB", "https://demo/b.mp3"),
      item("3", "C", "CC", "https://demo/b.mp3"),
      item("4", "D", "DD", "https://demo/d.mp3", "metadata_only"),
    ]);

    expect(queue.map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("maps public and external source types without letting metadata-only tracks play", () => {
    const queue = sanitizePlayableQueue([
      item("public-1", "Public Song", "Public Artist", "/audio/public-1.mp3"),
      {
        track: {
          id: "netease-1",
          name: "Netease Metadata",
          artist: "Remote Artist",
          duration: 180000,
          durationMs: 180000,
          sourceType: "NETEASE_OFFICIAL",
          playableStatus: "metadata_only",
        },
        section: "build",
      },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("public-1");
    expect(queue[0]?.audioUrl).toBe("/audio/public-1.mp3");
  });

  it("waits to speak the opening until the user unlocks audio when autoplay is blocked", async () => {
    vi.useFakeTimers();
    const track: Track = {
      id: "track-1",
      title: "Real Track",
      artist: "Real Artist",
      audioUrl: "/audio/real-track.mp3",
      durationMs: 180000,
      sourceType: "public",
      playableStatus: "playable",
    };
    const initialState: RadioState = {
      status: "tuning",
      unlockedByUser: false,
      queue: [track],
      playableQueue: [track],
      currentIndex: 0,
      currentTrack: track,
      timeline: [],
      currentSubtitle: "姝ｅ湪璋冮鍒颁綘鐨勭浜洪閬?..",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "public", status: "available", message: "Public audio ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    };
    const store = new RadioStore(initialState);
    const audioEngine = {
      play: vi.fn().mockRejectedValueOnce(new Error("autoplay blocked")).mockResolvedValue(undefined),
      getCurrentSrc: vi.fn(() => ""),
      unlockByUserGesture: vi.fn(),
      setTrack: vi.fn(),
    };
    const djEngine = {
      speak: vi.fn().mockResolvedValue(undefined),
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
    };
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const voiceQueue = {
      enqueue: vi.fn(),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
    };

    const engine = new RadioSessionEngine(store, audioEngine as never, djEngine as never, {
      hostingScheduler: hostingScheduler as never,
      voiceQueue: voiceQueue as never,
    });

    await (engine as unknown as { tryAutoPlay: () => Promise<void> }).tryAutoPlay();
    expect(store.getState().status).toBe("locked");

    await vi.advanceTimersByTimeAsync(800);
    expect(djEngine.speak).not.toHaveBeenCalled();

    await engine.enterChannel();

    expect(hostingScheduler.start).not.toHaveBeenCalled();
    expect(hostingScheduler.onTrackStart).not.toHaveBeenCalled();
    expect(djEngine.speak).not.toHaveBeenCalled();
  });

  it("requests director decisions from channel start and waits for silence thresholds before asking again", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackC: Track = {
      id: "track-c",
      title: "Track C",
      artist: "Artist C",
      audioUrl: "/audio/c.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const program: DJProgramPlan = {
      title: "今日私人频道",
      intent: "先熟悉开场，再慢慢换气。",
      queueTrackIds: [trackA.id, trackB.id, trackC.id],
      segments: [
        {
          name: "Warmup",
          purpose: "warmup",
          targetMood: ["熟悉"],
          targetEnergy: "low",
          trackIds: [trackA.id, trackB.id, trackC.id],
          reason: "先稳住气氛。",
        },
      ],
      hostingMoments: [],
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA, trackB, trackC],
      playableQueue: [trackA, trackB, trackC],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
      currentProgram: program,
    });
    const audioEngine = {
      unlockByUserGesture: vi.fn(),
      setTrack: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      isUnlockedByGesture: vi.fn(() => true),
      getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
    };
    const djEngine = {
      speak: vi.fn().mockResolvedValue(undefined),
    };
    const director = {
      decide: vi.fn(async (trigger: string): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: false,
        reason: `${trigger} can stay quiet`,
        lines: [],
      })),
    };
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const voiceQueue = {
      enqueue: vi.fn(),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
    };

    const engine = new RadioSessionEngine(store, audioEngine as never, djEngine as never, {
      hostingScheduler: hostingScheduler as never,
      voiceQueue: voiceQueue as never,
      director: director as never,
    });

    await engine.enterChannel();
    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledTimes(2));

    expect(director.decide).toHaveBeenNthCalledWith(1, "opening", expect.objectContaining({ currentTrack: trackA, forceSpeak: true }));
    expect(director.decide).toHaveBeenNthCalledWith(2, "opening", expect.objectContaining({ currentTrack: trackA, forceSpeak: true }));
    expect(hostingScheduler.start).not.toHaveBeenCalled();
    expect(djEngine.speak).not.toHaveBeenCalled();
    expect(voiceQueue.enqueue).not.toHaveBeenCalled();

    engine.onAudioTimeUpdate(15_000, 180_000);
    await flushDirectorLoop();
    expect(director.decide).toHaveBeenCalledTimes(2);

    engine.onAudioEnded();
    await flushDirectorLoop();
    expect(director.decide).toHaveBeenCalledTimes(2);

    engine.onAudioEnded();
    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledTimes(3));
    expect(director.decide).toHaveBeenNthCalledWith(3, "bridge_to_next", expect.objectContaining({ forceSpeak: true }));
    expect(hostingScheduler.onTimeTick).not.toHaveBeenCalled();
  });

  it("uses safe fallback speech when the director falls back without live lines", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA, trackB],
      playableQueue: [trackA, trackB],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const director = {
      decide: vi.fn(async (): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: true,
        reason: "DeepSeek director returned an invalid payload.",
        lines: [],
        meta: {
          provider: "deepseek",
          usedFallback: true,
          fallbackReason: "invalid_payload",
          promptType: "opening",
        },
      })),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.enterChannel();
    await flushDirectorLoop();

    expect(voiceQueue.enqueue).not.toHaveBeenCalled();
  });

  it("forces a second opening decision when the first opening stays silent", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA],
      playableQueue: [trackA],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const director = {
      decide: vi
        .fn()
        .mockResolvedValueOnce({
          action: "keep_flow",
          shouldSpeak: false,
          reason: "stay quiet",
          lines: [],
          meta: {
            provider: "deepseek",
            promptType: "opening",
          },
        } satisfies DJDirectingDecision)
        .mockResolvedValueOnce({
          action: "keep_flow",
          shouldSpeak: true,
          reason: "opening retry",
          lines: ["现在先把这首歌放进来，房间会慢慢亮一点。"],
          meta: {
            provider: "deepseek",
            promptType: "opening",
            scriptDebug: {
              bypassedGuard: true,
              attemptedLines: ["现在先把这首歌放进来，房间会慢慢亮一点。"],
              speech: "现在先把这首歌放进来，房间会慢慢亮一点。",
              durationHintSec: 22,
              insertAfterTracks: 2,
            },
          },
        } satisfies DJDirectingDecision),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.enterChannel();

    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledTimes(2));
    expect(director.decide).toHaveBeenNthCalledWith(
      2,
      "opening",
      expect.objectContaining({ forceSpeak: true }),
    );
    expect(voiceQueue.enqueue).toHaveBeenCalledWith(
      ["现在先把这首歌放进来，房间会慢慢亮一点。"],
      expect.objectContaining({ bypassGuard: true }),
    );
  });

  it("uses the director path for manual opening tests before falling back", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: true,
      queue: [trackA],
      playableQueue: [trackA],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const director = {
      decide: vi.fn(async (): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: true,
        reason: "manual opening",
        lines: ["外面的光还没完全退掉，这首歌先替频道把门打开。"],
        meta: {
          provider: "deepseek",
          promptType: "opening",
          scriptDebug: {
            bypassedGuard: true,
            attemptedLines: ["外面的光还没完全退掉，这首歌先替频道把门打开。"],
            speech: "外面的光还没完全退掉，这首歌先替频道把门打开。",
            durationHintSec: 20,
            insertAfterTracks: 2,
          },
        },
      })),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.testSpeakPipeline("opening");

    expect(director.decide).toHaveBeenCalledWith(
      "opening",
      expect.objectContaining({ forceSpeak: true }),
    );
    expect(voiceQueue.enqueue).toHaveBeenCalledWith(
      ["外面的光还没完全退掉，这首歌先替频道把门打开。"],
      expect.objectContaining({ bypassGuard: true }),
    );
  });

  it("should not use ProgramPlan hosting moments", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "误闯天家",
      artist: "歌手甲",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Someone in the crowd",
      artist: "歌手乙",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: true,
      queue: [trackA, trackB],
      playableQueue: [trackA, trackB],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
      currentProgram: {
        title: "Auralia FM",
        intent: "test",
        queueTrackIds: [trackA.id, trackB.id],
        segments: [
          {
            name: "Warmup",
            purpose: "warmup",
            targetMood: ["steady"],
            targetEnergy: "low",
            trackIds: [trackA.id, trackB.id],
            reason: "test",
          },
        ],
        hostingMoments: [],
      },
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const directorSpeech = "下午的光有点平，先让这首歌在房间里待一会儿。";
    const director = {
      decide: vi.fn(async (): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: true,
        reason: "opening",
        lines: [directorSpeech],
        meta: {
          provider: "deepseek",
          promptType: "opening",
          scriptDebug: {
            bypassedGuard: true,
            attemptedLines: [directorSpeech],
            speech: directorSpeech,
            durationHintSec: 20,
            insertAfterTracks: 2,
          },
        },
      })),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.testSpeakPipeline("opening");

    const [ttsInput] = voiceQueue.enqueue.mock.calls[0] ?? [];
    expect(ttsInput).toEqual([directorSpeech]);
    expect(ttsInput.join("")).not.toContain("下一首接");
    expect(ttsInput.join("")).not.toContain("咬字更近");
  });

  it("should use only director speech for tts input", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: true,
      queue: [trackA],
      playableQueue: [trackA],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const speech = "下午的光有点平，先让这首歌在房间里待一会儿。";
    const director = {
      decide: vi.fn(async (): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: true,
        reason: "manual opening",
        lines: [speech],
        meta: {
          provider: "deepseek",
          promptType: "opening",
          scriptDebug: {
            bypassedGuard: true,
            attemptedLines: [speech],
            speech,
            durationHintSec: 20,
            insertAfterTracks: 2,
          },
        },
      })),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.testSpeakPipeline("opening");

    expect(voiceQueue.enqueue).toHaveBeenCalledWith(
      [speech],
      expect.objectContaining({ bypassGuard: true }),
    );
  });

  it("forces a fresh speak decision after two silent tracks", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackC: Track = {
      id: "track-c",
      title: "Track C",
      artist: "Artist C",
      audioUrl: "/audio/c.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackD: Track = {
      id: "track-d",
      title: "Track D",
      artist: "Artist D",
      audioUrl: "/audio/d.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA, trackB, trackC, trackD],
      playableQueue: [trackA, trackB, trackC, trackD],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const director = {
      decide: vi
        .fn()
        .mockImplementation(async (_trigger: string, context: { forceSpeak?: boolean }): Promise<DJDirectingDecision> => ({
          action: "keep_flow",
          shouldSpeak: context.forceSpeak ? true : false,
          reason: context.forceSpeak ? "Forced director re-entry." : "Stay with the music.",
          lines: context.forceSpeak ? ["现在该自然开口了，这一段不能一直沉默下去。"] : [],
        })),
    };

    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.enterChannel();
    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledTimes(1));

    engine.onAudioEnded();
    await flushDirectorLoop();
    engine.onAudioEnded();
    await flushDirectorLoop();

    await waitForAssertion(() =>
      expect(
        director.decide.mock.calls.some(([, context]) => Boolean((context as { forceSpeak?: boolean }).forceSpeak)),
      ).toBe(true),
    );
  });

  it("lets multiple tracks pass with no speech when the director keeps the flow silent", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackC: Track = {
      id: "track-c",
      title: "Track C",
      artist: "Artist C",
      audioUrl: "/audio/c.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA, trackB, trackC],
      playableQueue: [trackA, trackB, trackC],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const director = {
      decide: vi.fn(async (trigger: string): Promise<DJDirectingDecision> => ({
        action: trigger === "bridge_to_next" ? "bridge_to_next" : "keep_flow",
        shouldSpeak: false,
        reason: "Stay with the music.",
        lines: [],
      })),
    };
    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: director as never,
      },
    );

    await engine.enterChannel();
    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledWith("opening", expect.anything()));
    engine.onAudioEnded();
    await flushDirectorLoop();
    expect(store.getState().currentTrack?.id).toBe("track-b");
    engine.onAudioEnded();
    await flushDirectorLoop();

    expect(store.getState().currentTrack?.id).toBe("track-c");
    expect(store.getState().currentIndex).toBe(2);
    expect(voiceQueue.enqueue).not.toHaveBeenCalled();
    expect(director.decide.mock.calls.filter(([trigger]) => trigger === "bridge_to_next")).toHaveLength(1);
  });

  it("does not announce a transient pause when playback resumes right away", async () => {
    vi.useFakeTimers();
    const track: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [track],
      playableQueue: [track],
      currentIndex: 0,
      currentTrack: track,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 30_000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      notifyPaused: vi.fn(),
      notifyEnded: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
        isMusicPaused: vi.fn(() => false),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: hostingScheduler as never,
      },
    );

    engine.onAudioPause();
    engine.onAudioPlay();
    await vi.advanceTimersByTimeAsync(500);

    expect(store.getState().status).toBe("playing");
    expect(store.getState().isPlaying).toBe(true);
    expect(hostingScheduler.pause).not.toHaveBeenCalled();
    expect(hostingScheduler.notifyPaused).not.toHaveBeenCalled();
  });

  it("confirms a real pause before announcing it", async () => {
    vi.useFakeTimers();
    const track: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [track],
      playableQueue: [track],
      currentIndex: 0,
      currentTrack: track,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 30_000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      notifyPaused: vi.fn(),
      notifyEnded: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
        hasCurrentTrackSource: vi.fn(() => true),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
        isMusicPaused: vi.fn(() => true),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: hostingScheduler as never,
      },
    );

    engine.onAudioPause();

    expect(store.getState().status).toBe("playing");
    expect(hostingScheduler.pause).not.toHaveBeenCalled();
    expect(hostingScheduler.notifyPaused).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(store.getState().status).toBe("paused");
    expect(store.getState().isPlaying).toBe(false);
    expect(hostingScheduler.pause).not.toHaveBeenCalled();
    expect(hostingScheduler.notifyPaused).not.toHaveBeenCalled();
  });

  it("requests a fresh director decision when playback resumes", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "paused",
      unlockedByUser: true,
      queue: [trackA, trackB],
      playableQueue: [trackA, trackB],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "paused",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      notifyPaused: vi.fn(),
      notifyEnded: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const director = {
      decide: vi.fn(async (): Promise<DJDirectingDecision> => ({
        action: "keep_flow",
        shouldSpeak: false,
        reason: "No copy on resume.",
        lines: [],
      })),
    };
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
        isMusicPaused: vi.fn(() => false),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: hostingScheduler as never,
        director: director as never,
      },
    );

    await engine.resume();
    await waitForAssertion(() => expect(director.decide).toHaveBeenCalledTimes(1));
    expect(store.getState().status).toBe("playing");
    expect(store.getState().isPlaying).toBe(true);
    expect(director.decide).toHaveBeenCalledWith("introduce_current", expect.objectContaining({ currentTrack: trackA }));
    expect(hostingScheduler.resume).not.toHaveBeenCalled();
  });

  it("marks the channel on air immediately after invoking play from a user gesture", async () => {
    const track: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [track],
      playableQueue: [track],
      currentIndex: 0,
      currentTrack: track,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    let resolvePlay: (() => void) | null = null;
    const playPromise = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    const audioEngine = {
      unlockByUserGesture: vi.fn(),
      setTrack: vi.fn(),
      play: vi.fn(() => playPromise),
      isUnlockedByGesture: vi.fn(() => true),
      getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
    };
    const hostingScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      onTrackStart: vi.fn(),
      onTrackEnd: vi.fn(),
      onTimeTick: vi.fn(),
      onUserTune: vi.fn(),
    };
    const engine = new RadioSessionEngine(
      store,
      audioEngine as never,
      {
        speak: vi.fn().mockResolvedValue(undefined),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        hostingScheduler: hostingScheduler as never,
        voiceQueue: {
          enqueue: vi.fn(),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
        } as never,
      },
    );

    const enter = engine.enterChannel();
    await Promise.resolve();

    expect(audioEngine.play).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe("on_air");
    expect(store.getState().isPlaying).toBe(true);
    expect(hostingScheduler.start).not.toHaveBeenCalled();

    resolvePlay?.();
    await enter;
  });

  it("applies a DeepSeek program plan to the prepared queue before playback starts", async () => {
    const buildResult = {
      playlistId: "95204435",
      playlistName: "刘莽叔叔喜欢的音乐",
      tracksTotal: 4,
      playableTracks: [
        {
          id: "internal-a",
          providerTrackId: "3363281756",
          neteaseId: "3363281756",
          title: "Goodbye Henry. (feat. Al Green)",
          artist: "RAYE / Al Green",
          album: "THIS MUSIC MAY CONTAIN HOPE.",
          audioUrl: "/audio/a.mp3",
          durationMs: 180000,
          sourceType: "netease" as const,
          playableStatus: "playable" as const,
        },
        {
          id: "internal-b",
          providerTrackId: "2609698825",
          neteaseId: "2609698825",
          title: "take your vibes and go",
          artist: "Kito / Kah-Lo / Brazy / Baauer",
          album: "title",
          audioUrl: "/audio/b.mp3",
          durationMs: 180000,
          sourceType: "netease" as const,
          playableStatus: "playable" as const,
        },
        {
          id: "internal-c",
          providerTrackId: "3357209106",
          neteaseId: "3357209106",
          title: "Someone in the crowd",
          artist: "雷米克斯",
          album: "title",
          audioUrl: "/audio/c.mp3",
          durationMs: 180000,
          sourceType: "netease" as const,
          playableStatus: "playable" as const,
        },
        {
          id: "internal-d",
          providerTrackId: "36841427",
          neteaseId: "36841427",
          title: "Love In The Dark",
          artist: "Adele",
          album: "25",
          audioUrl: "/audio/d.mp3",
          durationMs: 180000,
          sourceType: "netease" as const,
          playableStatus: "playable" as const,
        },
      ],
      failedTracks: [],
      stats: {
        total: 4,
        playable: 4,
        failed: 0,
        noUrl: 0,
        vipOnly: 0,
        copyrightUnavailable: 0,
        apiError: 0,
      },
    };
    const store = new RadioStore({
      status: "idle",
      unlockedByUser: false,
      queue: [],
      playableQueue: [],
      currentIndex: 0,
      currentTrack: null,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 0,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => false),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.loadNeteaseQueue(buildResult, {
      programPlan: {
        title: "把声音打开",
        intent: "先把频道放低，再把节奏推亮一点。",
        queueTrackIds: ["36841427", "3357209106", "2609698825", "3363281756"],
        segments: [
          {
            name: "Warmup",
            purpose: "warmup",
            targetMood: ["夜色", "熟悉"],
            targetEnergy: "low",
            trackIds: ["36841427", "3357209106"],
            reason: "先让频道放低。",
          },
          {
            name: "Main",
            purpose: "main",
            targetMood: ["更亮", "节奏感"],
            targetEnergy: "medium",
            trackIds: ["2609698825", "3363281756"],
            reason: "慢慢把步子往前推。",
          },
        ],
      },
      planningDebug: {
        provider: "deepseek",
        usedFallback: false,
        rawPrompt: "{\"event\":\"prepare\"}",
        rawResponse: "{\"programTitle\":\"把声音打开\"}",
      },
    });

    const state = store.getState();
    expect(state.playableQueue.map((track) => track.providerTrackId)).toEqual(["36841427", "3357209106", "2609698825", "3363281756"]);
    expect(state.currentTrack?.providerTrackId).toBe("36841427");
    expect(state.currentProgram?.title).toBe("把声音打开");
    expect(state.lastProgramPlanProvider).toBe("deepseek");
    expect(state.lastProgramPlanUsedFallback).toBe(false);
  });

  it("applies a DJ queue patch to upcoming tracks without interrupting the current track", async () => {
    const currentTrack: Track = {
      id: "track-current",
      providerTrackId: "n-current",
      neteaseId: "n-current",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const nextTrack: Track = {
      id: "track-next",
      providerTrackId: "n-next",
      neteaseId: "n-next",
      title: "Next Track",
      artist: "Next Artist",
      audioUrl: "/audio/next.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const altA: Track = {
      id: "track-alt-a",
      providerTrackId: "n-alt-a",
      neteaseId: "n-alt-a",
      title: "Alt A",
      artist: "Alt Artist A",
      audioUrl: "/audio/alt-a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const altB: Track = {
      id: "track-alt-b",
      providerTrackId: "n-alt-b",
      neteaseId: "n-alt-b",
      title: "Alt B",
      artist: "Alt Artist B",
      audioUrl: "/audio/alt-b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, nextTrack, altA, altB],
      playableQueue: [currentTrack, nextTrack, altA, altB],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 12000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
    };
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    const decision: DJDirectingDecision = {
      action: "shift_style",
      reason: "Need lighter motion after a dense section.",
      lines: ["这段听得有点密了。", "下一首我换个方向，让空气流动一下。"],
      queuePatch: {
        mode: "replace_next",
        trackIds: ["track-alt-b", "track-alt-a"],
      },
    };

    await engine.applyDJDecision(decision);

    expect(store.getState().currentTrack?.id).toBe("track-current");
    expect(store.getState().playableQueue.slice(1, 3).map((track) => track.id)).toEqual(["track-alt-b", "track-alt-a"]);
    expect(voiceQueue.enqueue).toHaveBeenCalledWith(decision.lines, { bypassGuard: false });
  });

  it("resolves provider track ids from a DJ queue patch and only marks applied when provider order really changes", async () => {
    const currentTrack: Track = {
      id: "internal-current",
      providerTrackId: "3363281756",
      neteaseId: "3363281756",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "low", style: ["soul"], mood: ["night"] },
    };
    const trackA: Track = {
      id: "internal-a",
      providerTrackId: "2609698825",
      neteaseId: "2609698825",
      title: "take your vibes and go",
      artist: "Kito / Kah-Lo / Brazy / Baauer",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "high", style: ["electronic"], mood: ["bright"] },
    };
    const trackB: Track = {
      id: "internal-b",
      providerTrackId: "3357209106",
      neteaseId: "3357209106",
      title: "Someone in the crowd",
      artist: "雷米克斯",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "中文", energy: "medium", style: ["pop"], mood: ["city"] },
    };
    const trackC: Track = {
      id: "internal-c",
      providerTrackId: "36841427",
      neteaseId: "36841427",
      title: "Love In The Dark",
      artist: "Adele",
      audioUrl: "/audio/c.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "low", style: ["ballad"], mood: ["dark"] },
    };
    const trackD: Track = {
      id: "internal-d",
      providerTrackId: "29097535",
      neteaseId: "29097535",
      title: "彩蝶舞夏",
      artist: "何真真",
      audioUrl: "/audio/d.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "中文", energy: "low", style: ["ambient"], mood: ["soft"] },
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, trackA, trackB, trackC, trackD],
      playableQueue: [currentTrack, trackA, trackB, trackC, trackD],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 12000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.applyDJDecision({
      action: "user_tune",
      reason: "Bring in a brighter next block.",
      shouldSpeak: false,
      lines: [],
      queuePatch: {
        mode: "replace_next",
        trackIds: ["29097535", "36841427", "3357209106"],
      },
      targetDirection: {
        energy: "high",
      },
    });

    const state = store.getState();
    expect(state.playableQueue.slice(1, 4).map((track) => track.id)).toEqual(["internal-d", "internal-c", "internal-b"]);
    expect(state.lastQueuePatchApplied).toBe(true);
    expect(state.lastQueuePatchNoopReason).toBeUndefined();
    expect(state.lastQueuePatchResolvedIds).toEqual(["29097535", "36841427", "3357209106"]);
    expect(state.lastQueuePatchUnresolvedIds).toEqual([]);
    expect(state.lastQueuePatchBeforeProviderIds).toEqual(["2609698825", "3357209106", "36841427", "29097535"]);
    expect(state.lastQueuePatchAfterProviderIds).toEqual(["29097535", "36841427", "3357209106", "2609698825"]);
  });

  it("supplements a one-track provider patch so the upcoming provider order actually changes", async () => {
    const currentTrack: Track = {
      id: "internal-current",
      providerTrackId: "3363281756",
      neteaseId: "3363281756",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "low", style: ["soul"], mood: ["night"] },
    };
    const trackA: Track = {
      id: "internal-a",
      providerTrackId: "2609698825",
      neteaseId: "2609698825",
      title: "take your vibes and go",
      artist: "Kito / Kah-Lo / Brazy / Baauer",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "high", style: ["electronic"], mood: ["bright"] },
    };
    const trackB: Track = {
      id: "internal-b",
      providerTrackId: "3357209106",
      neteaseId: "3357209106",
      title: "Someone in the crowd",
      artist: "雷米克斯",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "中文", energy: "medium", style: ["pop"], mood: ["city"] },
    };
    const trackC: Track = {
      id: "internal-c",
      providerTrackId: "36841427",
      neteaseId: "36841427",
      title: "Love In The Dark",
      artist: "Adele",
      audioUrl: "/audio/c.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "English", energy: "low", style: ["ballad"], mood: ["dark"] },
    };
    const trackD: Track = {
      id: "internal-d",
      providerTrackId: "29097535",
      neteaseId: "29097535",
      title: "彩蝶舞夏",
      artist: "何真真",
      audioUrl: "/audio/d.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { language: "中文", energy: "low", style: ["ambient"], mood: ["soft"] },
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, trackA, trackB, trackC, trackD],
      playableQueue: [currentTrack, trackA, trackB, trackC, trackD],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 12000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.applyDJDecision({
      action: "user_tune",
      reason: "Brighten the next block right away.",
      shouldSpeak: false,
      lines: [],
      queuePatch: {
        mode: "replace_next",
        trackIds: ["2609698825"],
      },
      targetDirection: {
        energy: "high",
      },
    });

    const state = store.getState();
    expect(state.lastQueuePatchApplied).toBe(true);
    expect(state.lastQueuePatchBeforeProviderIds).toEqual(["2609698825", "3357209106", "36841427", "29097535"]);
    expect(state.lastQueuePatchAfterProviderIds).not.toEqual(state.lastQueuePatchBeforeProviderIds);
    expect(state.playableQueue[1]?.providerTrackId).not.toBe("2609698825");
    expect((state.lastQueuePatchResolvedIds ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("marks a queue patch as no-op when nothing resolves and does not pretend it changed the queue", async () => {
    const currentTrack: Track = {
      id: "internal-current",
      providerTrackId: "3363281756",
      neteaseId: "3363281756",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const nextTrack: Track = {
      id: "internal-next",
      providerTrackId: "2609698825",
      neteaseId: "2609698825",
      title: "Next Track",
      artist: "Next Artist",
      audioUrl: "/audio/next.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, nextTrack],
      playableQueue: [currentTrack, nextTrack],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 12000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const engine = new RadioSessionEngine(
      store,
      {
        getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
        setTrack: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        isUnlockedByGesture: vi.fn(() => true),
      } as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: {
          enqueue: vi.fn(async () => undefined),
          clear: vi.fn(),
          isActive: vi.fn(() => false),
          getRecentLines: vi.fn(() => []),
        } as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.applyDJDecision({
      action: "user_tune",
      reason: "Try changing direction.",
      shouldSpeak: false,
      lines: [],
      queuePatch: {
        mode: "replace_next",
        trackIds: ["99999999"],
      },
      targetDirection: {
        energy: "high",
      },
    });

    const state = store.getState();
    expect(state.lastQueuePatchApplied).toBe(false);
    expect(state.lastQueuePatchNoopReason).toBe("no_resolved_tracks");
    expect(state.lastQueuePatchResolvedIds).toEqual([]);
    expect(state.lastQueuePatchUnresolvedIds).toEqual(["99999999"]);
    expect(state.lastQueuePatchBeforeProviderIds).toEqual(["2609698825"]);
    expect(state.lastQueuePatchAfterProviderIds).toEqual(["2609698825"]);
  });

  it("can skip immediately when the DJ decision asks to skip_now", async () => {
    const currentTrack: Track = {
      id: "track-current",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const nextTrack: Track = {
      id: "track-next",
      title: "Next Track",
      artist: "Next Artist",
      audioUrl: "/audio/next.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, nextTrack],
      playableQueue: [currentTrack, nextTrack],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 12000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const audioEngine = {
      getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
      setTrack: vi.fn(),
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      isUnlockedByGesture: vi.fn(() => true),
    };
    const engine = new RadioSessionEngine(
      store,
      audioEngine as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.applyDJDecision({
      action: "skip_to_next",
      priority: "high",
      shouldSpeak: true,
      reason: "Need to move on now.",
      lines: ["当前这首不再拖了。", "我直接切下一首。"],
      queuePatch: {
        mode: "skip_now",
        trackIds: [nextTrack.id],
      },
    });

    expect(voiceQueue.enqueue).toHaveBeenCalledWith(["当前这首不再拖了。", "我直接切下一首。"], {
      priority: "high",
      bypassGuard: false,
    });
    expect(store.getState().currentTrack?.id).toBe(nextTrack.id);
    expect(store.getState().currentIndex).toBe(1);
  });

  it("rebuilds the upcoming block before an immediate skip so the lighter song really becomes current", async () => {
    const currentTrack: Track = {
      id: "track-current",
      providerTrackId: "track-current",
      neteaseId: "track-current",
      title: "Current Track",
      artist: "Current Artist",
      audioUrl: "/audio/current.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { energy: "high", style: ["rock"], mood: ["dense"] },
    };
    const denseNext: Track = {
      id: "track-dense",
      providerTrackId: "track-dense",
      neteaseId: "track-dense",
      title: "Dense Next",
      artist: "Dense Artist",
      audioUrl: "/audio/dense.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { energy: "high", style: ["electronic"], mood: ["busy"] },
    };
    const relaxedA: Track = {
      id: "track-relaxed-a",
      providerTrackId: "track-relaxed-a",
      neteaseId: "track-relaxed-a",
      title: "Relaxed A",
      artist: "Relaxed Artist A",
      audioUrl: "/audio/relaxed-a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { energy: "low", style: ["ambient"], mood: ["soft"] },
    };
    const relaxedB: Track = {
      id: "track-relaxed-b",
      providerTrackId: "track-relaxed-b",
      neteaseId: "track-relaxed-b",
      title: "Relaxed B",
      artist: "Relaxed Artist B",
      audioUrl: "/audio/relaxed-b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
      tags: { energy: "low", style: ["acoustic"], mood: ["light"] },
    };
    const store = new RadioStore({
      status: "playing",
      unlockedByUser: true,
      queue: [currentTrack, denseNext, relaxedA, relaxedB],
      playableQueue: [currentTrack, denseNext, relaxedA, relaxedB],
      currentIndex: 0,
      currentTrack,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: true,
      isSpeaking: false,
      currentTime: 90_000,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const voiceQueue = {
      enqueue: vi.fn(async () => undefined),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const audioEngine = {
      getCurrentSrc: vi.fn(() => currentTrack.audioUrl ?? ""),
      setTrack: vi.fn(),
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      isUnlockedByGesture: vi.fn(() => true),
    };
    const engine = new RadioSessionEngine(
      store,
      audioEngine as never,
      {
        speak: vi.fn(),
        beginSpeechGroup: vi.fn(),
        endSpeechGroup: vi.fn(),
        isSpeaking: vi.fn(() => false),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          notifyPaused: vi.fn(),
          notifyEnded: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
      },
    );

    await engine.applyDJDecision({
      action: "skip_to_next",
      priority: "high",
      shouldSpeak: false,
      reason: "User asked for a lighter song right now.",
      lines: [],
      queuePatch: {
        mode: "skip_now",
        trackIds: [relaxedB.providerTrackId!, relaxedA.providerTrackId!],
      },
      targetDirection: {
        energy: "low",
      },
    });

    const state = store.getState();
    expect(state.playableQueue.map((track) => track.id)).toEqual([
      "track-current",
      "track-relaxed-b",
      "track-relaxed-a",
      "track-dense",
    ]);
    expect(state.currentTrack?.id).toBe("track-relaxed-b");
    expect(state.currentIndex).toBe(1);
    expect(state.lastQueuePatchApplied).toBe(true);
  });


  it("keeps the opening silent when the director is offline", async () => {
    const trackA: Track = {
      id: "track-a",
      title: "Track A",
      artist: "Artist A",
      audioUrl: "/audio/a.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const trackB: Track = {
      id: "track-b",
      title: "Track B",
      artist: "Artist B",
      audioUrl: "/audio/b.mp3",
      durationMs: 180000,
      sourceType: "netease",
      playableStatus: "playable",
    };
    const voiceQueue = {
      enqueue: vi.fn(),
      clear: vi.fn(),
      isActive: vi.fn(() => false),
      getRecentLines: vi.fn(() => []),
    };
    const store = new RadioStore({
      status: "ready",
      unlockedByUser: false,
      queue: [trackA, trackB],
      playableQueue: [trackA, trackB],
      currentIndex: 0,
      currentTrack: trackA,
      timeline: [],
      currentSubtitle: "ready",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 180000,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const engine = new RadioSessionEngine(
      store,
      {
        unlockByUserGesture: vi.fn(),
        setTrack: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        isUnlockedByGesture: vi.fn(() => true),
        getCurrentSrc: vi.fn(() => trackA.audioUrl ?? ""),
      } as never,
      {
        speak: vi.fn(),
      } as never,
      {
        voiceQueue: voiceQueue as never,
        hostingScheduler: {
          start: vi.fn(),
          stop: vi.fn(),
          onTrackStart: vi.fn(),
          onTrackEnd: vi.fn(),
          onTimeTick: vi.fn(),
          onUserTune: vi.fn(),
        } as never,
        director: {
          decide: vi.fn(async () => {
            throw new Error("director offline");
          }),
        } as never,
      },
    );

    await engine.enterChannel();
    await flushDirectorLoop();

    expect(voiceQueue.enqueue).not.toHaveBeenCalled();

    engine.onAudioEnded();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().currentTrack?.id).toBe("track-b");
    expect(store.getState().currentIndex).toBe(1);
    expect(store.getState().isPlaying).toBe(true);
    expect(voiceQueue.enqueue).toHaveBeenCalledTimes(0);
  });

  it("planner intervenes and provides replacement tracks", async () => {
    const candidates = sanitizePlayableQueue([
      item("cn-pop-1", "A", "AA", "https://demo/a.mp3"),
      item("cn-pop-2", "B", "BB", "https://demo/b.mp3"),
      item("en-jazz-3", "C", "CC", "https://demo/c.mp3"),
      item("en-jazz-4", "D", "DD", "https://demo/d.mp3"),
      item("cn-pop-5", "E", "EE", "https://demo/e.mp3"),
      item("en-jazz-6", "F", "FF", "https://demo/f.mp3"),
      item("cn-pop-7", "G", "GG", "https://demo/g.mp3"),
    ]);
    const input: ActiveDecisionInput = {
      memory: {
        topArtists: ["AA", "BB"],
        topLanguages: ["中文", "英文"],
        topEras: ["2010s"],
        inferredMoods: ["平静"],
        inferredStyles: ["Pop"],
        energyProfile: "medium",
        familiarityPreference: "balanced",
        discoveryTolerance: "medium",
        avoidPatterns: [],
        favoriteExamples: [],
        timeSlotPreferences: {},
        summary: "test",
      },
      context: {
        timeOfDay: "evening",
        weekdayType: "workday",
        likelyScene: "relax",
        energyTarget: "medium",
        recommendedMood: ["城市感"],
        reason: "test",
      },
      recentTracks: candidates.slice(0, 3),
      upcomingTracks: candidates.slice(3, 4),
      candidateTracks: candidates,
    };
    const intervention = await decideWithGPT(input);

    expect(intervention.shouldIntervene).toBe(true);
    expect((intervention.replacementTrackIds ?? []).length).toBeGreaterThan(0);
    expect(intervention.djLine).toBeTruthy();
  });

  it("speaks an explanation when playback bootstrap resolves zero playable tracks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/playback/session") {
          return {
            json: async () => ({
              ok: true,
              session: {
                queue: [],
              },
              resolveReport: {
                total: 12,
                stats: {
                  playable: 0,
                  noUrl: 8,
                  vipOnly: 2,
                  copyrightUnavailable: 1,
                  apiError: 1,
                  unknown: 0,
                },
              },
            }),
          } as Response;
        }

        return {
          json: async () => ({
            ok: false,
            message: "need source",
          }),
        } as Response;
      }),
    );

    const store = new RadioStore({
      status: "idle",
      unlockedByUser: false,
      queue: [],
      playableQueue: [],
      currentIndex: 0,
      currentTrack: null,
      timeline: [],
      currentSubtitle: "",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: 0,
      volume: 0.82,
      providerStatus: { provider: "netease", status: "available", message: "ready" },
      djName: "Auralia",
      channelName: "Auralia FM",
    });
    const audioEngine = {
      getCurrentSrc: vi.fn(() => ""),
      setTrack: vi.fn(),
      play: vi.fn(),
    };
    const djEngine = {
      speak: vi.fn().mockResolvedValue(undefined),
    };

    const engine = new RadioSessionEngine(store, audioEngine as never, djEngine as never);
    await engine.bootstrap();

    expect(store.getState().status).toBe("need_playable_tracks");
    expect(djEngine.speak).toHaveBeenCalled();
    expect(store.getState().providerStatus.message).toContain("12");
  });
});



