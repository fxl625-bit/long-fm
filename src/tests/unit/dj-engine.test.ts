import { afterEach, describe, expect, it, vi } from "vitest";
import { DJEngine } from "@/lib/radio/dj-engine";
import { RadioStore } from "@/lib/radio/radio-store";
import type { RadioState } from "@/lib/radio/radio-types";

function makeState(): RadioState {
  return {
    status: "playing",
    unlockedByUser: true,
    queue: [],
    playableQueue: [],
    currentIndex: 0,
    currentTrack: null,
    timeline: [],
    currentSubtitle: "",
    subtitleHistory: [],
    isPlaying: true,
    isSpeaking: false,
    currentTime: 0,
    duration: 0,
    volume: 0.82,
    providerStatus: { provider: "netease", status: "available", message: "ready" },
    djName: "Long",
    channelName: "Long Radio",
  };
}

describe("DJEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("includes the selected voice preset in /api/tts requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "audio" as const,
        provider: "edge_tts",
        audioUrl: "/tts-cache/test.mp3",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === "ai-radio-dj-voice-settings"
            ? JSON.stringify({
                presetId: "night_male",
                voice: "zh-CN-YunjianNeural",
                rate: "-12%",
                pitch: "-4Hz",
              })
            : null,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const engine = new DJEngine(
      new RadioStore(makeState()),
      {
        duckMusic: vi.fn(),
        restoreMusic: vi.fn(),
        playDJ: vi.fn(async () => undefined),
      } as never,
    );

    const speakPromise = engine.speak("这里是 Long FM。声音已经切过来了。");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: "这里是 Long FM。声音已经切过来了。",
      voice: "zh-CN-YunjianNeural",
      rate: "-12%",
      pitch: "-4Hz",
    });

    await vi.runAllTimersAsync();
    await speakPromise;
  });

  it("uses the more natural default Chinese DJ preset when no stored voice settings exist", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "audio" as const,
        provider: "openai",
        voice: "marin",
        audioUrl: "/tts-cache/default-natural.mp3",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const engine = new DJEngine(
      new RadioStore(makeState()),
      {
        duckMusic: vi.fn(),
        restoreMusic: vi.fn(),
        playDJ: vi.fn(async () => undefined),
      } as never,
    );

    const speakPromise = engine.speak("鏅氫竴鐐硅璇濓紝涔熻鏇村儚鐪熶汉涓€鐐广€?");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: "鏅氫竴鐐硅璇濓紝涔熻鏇村儚鐪熶汉涓€鐐广€?",
      provider: "openai",
      voice: "marin",
      style: "night_radio",
    });

    await vi.runAllTimersAsync();
    await speakPromise;
  });

  it("still sends live speech to TTS without final runtime guard suppression", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "audio" as const,
        provider: "edge_tts",
        audioUrl: "/tts-cache/live.mp3",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const store = new RadioStore(makeState());
    const engine = new DJEngine(
      store,
      {
        duckMusic: vi.fn(),
        restoreMusic: vi.fn(),
        playDJ: vi.fn(async () => undefined),
      } as never,
    );

    const speakPromise = engine.speak("鐜板湪鍒€ョ潃鍒囪蛋锛岃繖棣栨瓕鐨勪汉澹板拰浣庨姝ｅ湪鎶婃埧闂存敹鎷€?");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    await speakPromise;
    expect(store.getState().lastDJAudioUrl).toBe("/tts-cache/live.mp3");
  });

  it("shows subtitles when TTS fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const store = new RadioStore(makeState());
    const engine = new DJEngine(
      store,
      {
        duckMusic: vi.fn(),
        restoreMusic: vi.fn(),
        playDJ: vi.fn(async () => undefined),
      } as never,
    );

    const speakPromise = engine.speak("RAYE / Al Green 鐨勮繖棣栨瓕鍏堟斁涓€浼氬効銆?");
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await speakPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getState().currentSubtitle).toBe("RAYE / Al Green 鐨勮繖棣栨瓕鍏堟斁涓€浼氬効銆?");
    expect(store.getState().ttsProvider).toBe("subtitle_only");
    expect(store.getState().isSpeaking).toBe(false);
  });

  it("records a stronger ducking profile while speech is active", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "audio" as const,
        provider: "openai",
        voice: "alloy",
        audioUrl: "/tts-cache/natural.mp3",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const store = new RadioStore(makeState());
    let duckState: Record<string, unknown> | undefined;
    const engine = new DJEngine(
      store,
      {
        duckMusic: vi.fn((profile?: Record<string, unknown>) => {
          duckState = profile;
        }),
        restoreMusic: vi.fn(),
        playDJ: vi.fn(async () => undefined),
      } as never,
    );

    const speakPromise = engine.speak("鍏堝埆鎬ョ潃鍒囪蛋锛岃繖涓€灏忔鎴戞兂闄綘鍚畬銆?");
    await Promise.resolve();

    expect(duckState).toMatchObject({
      target: 0.18,
      fadeDownMs: 120,
      fadeUpMs: 180,
    });
    expect(store.getState().duckedVolume).toMatchObject({
      before: 0.82,
      target: 0.18,
      restore: 0.82,
      fadeDownMs: 120,
      fadeUpMs: 180,
    });

    await vi.runAllTimersAsync();
    await speakPromise;
  });

  it("ducks once for grouped speech and restores once after the group ends", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn(async () => ({
        ok: true,
        json: async () => ({
          mode: "audio" as const,
          provider: "openai",
          voice: "alloy",
          audioUrl: "/tts-cache/grouped.mp3",
        }),
      }))
      .mockName("fetch");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const store = new RadioStore(makeState());
    const duckMusic = vi.fn();
    const restoreMusic = vi.fn();
    const playDJ = vi.fn(async () => undefined);
    const engine = new DJEngine(
      store,
      {
        duckMusic,
        restoreMusic,
        playDJ,
      } as never,
    );

    engine.beginSpeechGroup();
    const firstSpeech = engine.speak("鍏堝埆鎬ョ潃鍒囨瓕锛屾垜鍏堟妸杩欎竴鍙ラ€佽繘鍘汇€?", { withinGroup: true });
    const secondSpeech = engine.speak("涓嬩竴鍙ユ帴鐫€璇达紝浣嗛煶涔愬彧闇€瑕佸帇浣庝竴娆°€?", { withinGroup: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(duckMusic).toHaveBeenCalledTimes(1);
    expect(store.getState().duckedVolume).toMatchObject({
      before: 0.82,
      target: 0.18,
      restore: 0.82,
    });

    await vi.runAllTimersAsync();
    await firstSpeech;
    await secondSpeech;

    expect(playDJ).toHaveBeenCalledTimes(2);
    expect(playDJ).toHaveBeenNthCalledWith(
      1,
      "/tts-cache/grouped.mp3",
      expect.objectContaining({
        manageMusic: false,
        speechMixProfile: expect.objectContaining({
          before: 0.82,
          target: 0.18,
          restore: 0.82,
          fadeDownMs: 120,
          fadeUpMs: 180,
        }),
      }),
    );
    expect(playDJ).toHaveBeenNthCalledWith(
      2,
      "/tts-cache/grouped.mp3",
      expect.objectContaining({
        manageMusic: false,
        speechMixProfile: expect.objectContaining({
          before: 0.82,
          target: 0.18,
          restore: 0.82,
          fadeDownMs: 120,
          fadeUpMs: 180,
        }),
      }),
    );
    expect(restoreMusic).toHaveBeenCalledTimes(0);
    engine.endSpeechGroup();
    expect(restoreMusic).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe("playing");
    expect(store.getState().isSpeaking).toBe(false);
    expect(store.getState().duckedVolume).toMatchObject({
      before: 0.82,
      target: 0.18,
      restore: 0.82,
    });
  });
});
