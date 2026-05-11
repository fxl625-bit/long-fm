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
    djName: "Auralia",
    channelName: "Auralia Radio",
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

    const speakPromise = engine.speak("这里是 Auralia FM。声音已经切过来了。");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: "这里是 Auralia FM。声音已经切过来了。",
      voice: "zh-CN-YunjianNeural",
      rate: "-12%",
      pitch: "-4Hz",
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

    const speakPromise = engine.speak("现在别急着切走，这首歌的人声和低频正在把房间收拢。");
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

    const speakPromise = engine.speak("RAYE / Al Green 的这首歌先放一会儿。");
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await speakPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getState().currentSubtitle).toBe("RAYE / Al Green 的这首歌先放一会儿。");
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

    const speakPromise = engine.speak("先别急着切走，这一小段我想陪你听完。");
    await Promise.resolve();

    expect(duckState).toMatchObject({
      targetVolume: 0.18,
    });
    expect(store.getState().duckedVolume).toMatchObject({
      before: 0.82,
      after: 0.18,
    });

    await vi.runAllTimersAsync();
    await speakPromise;
  });
});
