import { describe, expect, it, vi } from "vitest";
import { RadioStore } from "@/lib/radio/radio-store";
import type { RadioState, Track } from "@/lib/radio/radio-types";
import { RadioRuntime } from "@/lib/radio/radio-runtime";
import type { BuildQueueResult } from "@/lib/providers/netease/netease-playable-service";

function makeTrack(): Track {
  return {
    id: "track-1",
    providerTrackId: "3363281756",
    title: "Goodbye Henry. (feat. Al Green)",
    artist: "RAYE / Al Green",
    album: "THIS MUSIC MAY CONTAIN HOPE.",
    coverUrl: "https://example.com/cover.jpg",
    audioUrl: "https://audio.example/goodbye-henry.mp3",
    durationMs: 320434,
    sourceType: "netease",
    playableStatus: "playable",
    tags: {
      style: ["alt-pop"],
      mood: ["warm"],
      energy: "medium",
      language: "英语",
    },
  };
}

function makeState(): RadioState {
  return {
    status: "idle",
    unlockedByUser: false,
    queue: [],
    playableQueue: [],
    currentIndex: 0,
    currentTrack: null,
    timeline: [],
    currentSubtitle: "准备中",
    subtitleHistory: [],
    isPlaying: false,
    isSpeaking: false,
    currentTime: 0,
    duration: 0,
    volume: 0.82,
    providerStatus: { provider: "netease", status: "available", message: "ready" },
    djName: "Auralia",
    channelName: "Auralia FM",
  };
}

function makeQueueResult(): BuildQueueResult {
  return {
    playlistId: "95204435",
    playlistName: "我喜欢的音乐",
    tracksTotal: 1,
    playableTracks: [
      {
        id: "track-1",
        neteaseId: "3363281756",
        providerTrackId: "3363281756",
        title: "Goodbye Henry. (feat. Al Green)",
        artist: "RAYE / Al Green",
        album: "THIS MUSIC MAY CONTAIN HOPE.",
        coverUrl: "https://example.com/cover.jpg",
        durationMs: 320434,
        audioUrl: "https://audio.example/goodbye-henry.mp3",
        sourceType: "netease",
        playableStatus: "playable",
      },
    ],
    failedTracks: [],
    stats: {
      total: 1,
      playable: 1,
      failed: 0,
      noUrl: 0,
      vipOnly: 0,
      copyrightUnavailable: 0,
      apiError: 0,
    },
  };
}

describe("RadioRuntime", () => {
  it("returns the same snapshot reference until runtime state actually changes", () => {
    const runtime = new RadioRuntime({
      core: {
        store: new RadioStore(makeState()),
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue: vi.fn(async () => undefined),
          enterChannel: vi.fn(async () => undefined),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
    });

    const first = runtime.getSnapshot();
    const second = runtime.getSnapshot();

    expect(second).toBe(first);
    expect(runtime.getServerSnapshot()).toBe(runtime.getServerSnapshot());
  });

  it("prepares the NetEase queue ahead of navigation without requesting an opening monologue", async () => {
    const track = makeTrack();
    const store = new RadioStore(makeState());
    const loadNeteaseQueue = vi.fn(async () => {
      store.setState({
        status: "ready",
        queue: [track],
        playableQueue: [track],
        currentIndex: 0,
        currentTrack: track,
        duration: track.durationMs ?? 0,
      });
    });

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue,
          enterChannel: vi.fn(async () => undefined),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
      readStatus: async () => ({
        ok: true,
        authenticated: true,
        loginState: "logged_in",
        message: "网易云已连接",
        likedPlaylistId: "95204435",
        profile: { id: "84152149", nickname: "刘莽叔叔" },
        playlistsCount: 12,
        playableTrackCount: 20,
      }),
      buildQueue: async () => ({ ok: true, ...makeQueueResult() }),
    });

    await runtime.startSessionFromUserGesture();

    expect(loadNeteaseQueue).toHaveBeenCalledTimes(1);
    const snapshot = runtime.getSnapshot();
    expect(snapshot.isReady).toBe(true);
    expect(snapshot.hasStarted).toBe(true);
    expect(snapshot.radio.currentTrack?.title).toBe(track.title);
    expect(snapshot.programTitle).toBe("我喜欢的音乐");
    expect(snapshot.directorOffline).toBe(false);
  });

  it("exposes director offline evidence in the snapshot and debug state", () => {
    const track = makeTrack();
    const store = new RadioStore(
      {
        ...makeState(),
        status: "ready",
        currentTrack: track,
        playableQueue: [track],
        currentProgram: {
          title: "Fallback Program",
          intent: "play music only",
          queueTrackIds: ["track-1"],
          segments: [],
        } as never,
        lastProgramPlanProvider: "deepseek",
        lastProgramPlanUsedFallback: true,
        lastProgramPlanError: "LLM unavailable",
        djBrainFallbackActive: true,
      } as never,
    );

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue: vi.fn(async () => undefined),
          enterChannel: vi.fn(async () => undefined),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
    });

    const snapshot = runtime.getSnapshot();
    const debug = runtime.getDebugState();

    expect(snapshot.directorOffline).toBe(true);
    expect(snapshot.directorDebugEvidence).toEqual(
      expect.arrayContaining(["program_plan_used_fallback", "dj_brain_fallback_active", "program_plan_error: LLM unavailable"]),
    );
    expect(debug.directorOffline).toBe(true);
    expect(debug.directorDebugEvidence).toEqual(
      expect.arrayContaining(["program_plan_used_fallback", "dj_brain_fallback_active", "program_plan_error: LLM unavailable"]),
    );
  });

  it("exposes latest live speech and opening pipeline evidence in debug state", () => {
    const track = makeTrack();
    const store = new RadioStore(
      {
        ...makeState(),
        status: "on_air",
        currentTrack: track,
        playableQueue: [track],
        isPlaying: true,
        currentDecision: {
          action: "keep_flow",
          shouldSpeak: true,
          reason: "opening",
          lines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
          meta: {
            provider: "deepseek",
            rawResponse: "{\"shouldSpeak\":true}",
            scriptDebug: {
              speech: "外面的光还没完全退掉，这首歌先把房间里的边角照出来。",
            },
          },
        } as never,
        lastDecisionProvider: "deepseek",
        lastDecisionUsedFallback: false,
        lastDecisionRawResponse: "{\"shouldSpeak\":true}",
        djHostDebug: {
          state: "playing_music",
          schedulerRunning: true,
          openingDone: true,
          openingLinesAttempted: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
          openingLinesSpoken: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
          openingBlockedLines: [],
          currentTrackIntroDoneTrackId: null,
          playedCount: 0,
          lastBridgeAt: null,
          lastSpokenAt: "2026-05-09T02:00:00.000Z",
          lastTalkBreakEvent: "opening",
          lastTalkBreakPattern: null,
          lastGuardResult: { ok: true, safeLines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"], blockedLines: [] },
          lastBlockedLines: [],
          recentDJLines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
          lastSchedulerEvent: "opening",
          eventTriggeredAt: "2026-05-09T02:00:00.000Z",
          pendingTalkBreaks: [],
          lastTalkBreakFailed: false,
          lastTalkBreakFailureReason: null,
          consecutiveTalkFailures: 0,
          lastSpeakAt: "2026-05-09T02:00:00.000Z",
          tracksSinceLastSpeak: 0,
          minutesSinceLastSpeak: 0,
          forcedSpeakTriggered: true,
        },
        djSpeakAttempts: [
          {
            id: "attempt-opening",
            event: "opening",
            createdAt: "2026-05-09T02:00:00.000Z",
            schedulerTriggered: true,
            deepseekCalled: true,
            deepseekUsedFallback: false,
            rawLines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
            qualityChecked: false,
            qualityPass: true,
            qualityFailures: [],
            guardChecked: true,
            safeLines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
            blockedLines: [],
            rewriteAttempted: false,
            rewriteLines: [],
            rewritePass: false,
            rewriteFailures: [],
            fallbackUsed: false,
            fallbackLines: [],
            finalLines: ["外面的光还没完全退掉，这首歌先把房间里的边角照出来。"],
            ttsCalled: true,
            subtitleShown: true,
            queueEnqueued: true,
            queuePlayed: true,
          },
        ] as never,
      } as never,
    );

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
          getCurrentDJSrc: vi.fn(() => "/tts-cache/opening.mp3"),
        },
        sessionEngine: {
          loadNeteaseQueue: vi.fn(async () => undefined),
          enterChannel: vi.fn(async () => undefined),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
    });

    const debug = runtime.getDebugState() as Record<string, unknown>;

    expect(debug.latestSpeech).toBe("外面的光还没完全退掉，这首歌先把房间里的边角照出来。");
    expect(debug.latestOpeningSpeech).toBe("外面的光还没完全退掉，这首歌先把房间里的边角照出来。");
    expect(debug.latestSpeakAttemptEvent).toBe("opening");
    expect(debug.latestSpeakAttemptUsedLiveDirector).toBe(true);
  });

  it("asks DeepSeek for a program plan during prepareSession and exposes planning debug state", async () => {
    const track = makeTrack();
    const store = new RadioStore(makeState());
    const loadNeteaseQueue = vi.fn(async (_result: BuildQueueResult, options?: { programPlan?: unknown; planningDebug?: unknown }) => {
      store.setState({
        status: "ready",
        queue: [track],
        playableQueue: [track],
        currentIndex: 0,
        currentTrack: track,
        duration: track.durationMs ?? 0,
        currentProgram: options?.programPlan as never,
        lastProgramPlanProvider: (options?.planningDebug as { provider?: string } | undefined)?.provider,
        lastProgramPlanUsedFallback: (options?.planningDebug as { usedFallback?: boolean } | undefined)?.usedFallback,
        lastProgramPlanRawPrompt: (options?.planningDebug as { rawPrompt?: string } | undefined)?.rawPrompt,
        lastProgramPlanRawResponse: (options?.planningDebug as { rawResponse?: string } | undefined)?.rawResponse,
      });
    });
    const planProgram = vi.fn(async () => ({
      provider: "deepseek" as const,
      configured: true,
      usedFallback: false,
      rawPrompt: "{\"playlistName\":\"我喜欢的音乐\"}",
      rawResponse: "{\"programTitle\":\"把声音打开\"}",
      parsedPlan: {
        title: "把声音打开",
        intent: "先从熟悉的英文歌进入，再把节奏推亮一点。",
        segments: [],
        queueTrackIds: ["3363281756"],
      },
      error: null,
    }));

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue,
          enterChannel: vi.fn(async () => undefined),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
      readStatus: async () => ({
        ok: true,
        authenticated: true,
        loginState: "logged_in",
        message: "网易云已连接",
        likedPlaylistId: "95204435",
        profile: { id: "84152149", nickname: "刘莽叔叔" },
      }),
      buildQueue: async () => ({ ok: true, ...makeQueueResult() }),
      planProgram,
    });

    await runtime.prepareSession();

    expect(planProgram).toHaveBeenCalledTimes(1);
    expect(loadNeteaseQueue).toHaveBeenCalledTimes(1);
    const debug = runtime.getDebugState();
    expect(debug.programPlanProvider).toBe("deepseek");
    expect(debug.programPlanUsedFallback).toBe(false);
    expect(debug.programPlanRawPrompt).toContain("playlistName");
    expect(debug.programPlanRawResponse).toContain("programTitle");
  });

  it("starts playback from the user gesture and marks the channel on air", async () => {
    const track = makeTrack();
    const store = new RadioStore(makeState());
    const unlockByUserGesture = vi.fn();
    const enterChannel = vi.fn(async () => {
      store.setState({
        status: "on_air",
        unlockedByUser: true,
        queue: [track],
        playableQueue: [track],
        currentIndex: 0,
        currentTrack: track,
        isPlaying: true,
      });
    });

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture,
          getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue: vi.fn(async () => {
            store.setState({
              status: "ready",
              queue: [track],
              playableQueue: [track],
              currentIndex: 0,
              currentTrack: track,
            });
          }),
          enterChannel,
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
      readStatus: async () => ({
        ok: true,
        authenticated: true,
        loginState: "logged_in",
        message: "网易云已连接",
        likedPlaylistId: "95204435",
        profile: { id: "84152149", nickname: "刘莽叔叔" },
      }),
      buildQueue: async () => ({ ok: true, ...makeQueueResult() }),
      planProgram: async () => ({
        provider: "deepseek",
        configured: true,
        model: "deepseek-chat",
        usedFallback: false,
        rawPrompt: "{\"playlistName\":\"我喜欢的音乐\"}",
        rawResponse: "{\"title\":\"我喜欢的音乐\"}",
        parsedPlan: {
          title: "我喜欢的音乐",
          intent: "先让熟悉感把频道接稳。",
          segments: [],
          queueTrackIds: ["3363281756"],
        },
        error: null,
      }),
    });

    await runtime.startSessionFromUserGesture();

    expect(unlockByUserGesture).toHaveBeenCalledTimes(1);
    expect(enterChannel).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().hasStarted).toBe(true);
    expect(runtime.getSnapshot().radio.status).toBe("on_air");
  });

  it("prepares opening speech before channel entry and reuses it on enter", async () => {
    const track = makeTrack();
    const store = new RadioStore(makeState());
    const preloadedOpening = "窗边那点光还没完全站稳，这首歌先替今天把房间慢慢打开。";
    const loadNeteaseQueue = vi.fn(async () => {
      store.setState({
        status: "ready",
        queue: [track],
        playableQueue: [track],
        currentIndex: 0,
        currentTrack: track,
        duration: track.durationMs ?? 0,
      });
    });
    const prepareOpening = vi.fn(async () => preloadedOpening);
    const enterChannel = vi.fn(async () => {
      store.setState({
        status: "on_air",
        unlockedByUser: true,
        queue: [track],
        playableQueue: [track],
        currentIndex: 0,
        currentTrack: track,
        isPlaying: true,
      });
    });

    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
          getCurrentDJSrc: vi.fn(() => ""),
        },
        sessionEngine: {
          loadNeteaseQueue,
          prepareOpening,
          enterChannel,
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
      readStatus: async () => ({
        ok: true,
        authenticated: true,
        loginState: "logged_in",
        message: "网易云已连接",
        likedPlaylistId: "95204435",
        profile: { id: "84152149", nickname: "刘莽叔叔" },
      }),
      buildQueue: async () => ({ ok: true, ...makeQueueResult() }),
      planProgram: async () => ({
        provider: "deepseek",
        configured: true,
        model: "deepseek-chat",
        usedFallback: false,
        rawPrompt: "{\"playlistName\":\"我喜欢的音乐\"}",
        rawResponse: "{\"title\":\"我喜欢的音乐\"}",
        parsedPlan: {
          title: "我喜欢的音乐",
          intent: "先让熟悉感把频道接稳。",
          segments: [],
          queueTrackIds: ["3363281756"],
        },
        error: null,
      }),
    });

    await runtime.prepareSession();
    expect(prepareOpening).toHaveBeenCalledTimes(1);
    expect(prepareOpening).toHaveBeenCalledWith();

    await runtime.startSessionFromUserGesture();
    expect(enterChannel).toHaveBeenCalledTimes(1);

    const debug = runtime.getDebugState();
    expect(debug.latestOpeningSpeech).toBe(preloadedOpening);
  });

  it("keeps the home-entry session launched when the first play attempt fails", async () => {
    const track = makeTrack();
    const store = new RadioStore(makeState());
    const runtime = new RadioRuntime({
      core: {
        store,
        audioEngine: {
          unlockByUserGesture: vi.fn(),
          getCurrentSrc: vi.fn(() => track.audioUrl ?? ""),
          getCurrentDJSrc: vi.fn(() => ""),
          isMusicPaused: vi.fn(() => true),
        },
        sessionEngine: {
          loadNeteaseQueue: vi.fn(async () => {
            store.setState({
              status: "ready",
              queue: [track],
              playableQueue: [track],
              currentIndex: 0,
              currentTrack: track,
            });
          }),
          enterChannel: vi.fn(async () => {
            throw new Error("play rejected");
          }),
        },
        djEngine: {
          speak: vi.fn(async () => undefined),
        },
      } as never,
      readStatus: async () => ({
        ok: true,
        authenticated: true,
        loginState: "logged_in",
        message: "网易云已连接",
        likedPlaylistId: "95204435",
        profile: { id: "84152149", nickname: "刘莽叔叔" },
      }),
      buildQueue: async () => ({ ok: true, ...makeQueueResult() }),
    });

    const started = await runtime.startSessionFromUserGesture("home_entry_click");
    runtime.markRoutePush();

    const snapshot = runtime.getSnapshot();
    expect(started).toBe(true);
    expect(snapshot.hasStarted).toBe(true);
    expect(snapshot.startup.startedFrom).toBe("home_entry_click");
    expect(snapshot.startup.playCallTimestamp).toBeTypeOf("number");
    expect(snapshot.startup.routePushTimestamp).toBeTypeOf("number");
    expect(snapshot.startup.playCalledBeforeRoutePush).toBe(true);
    expect(snapshot.startup.firstPlayError).toContain("play rejected");
  });
});


