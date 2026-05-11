import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "@/lib/radio/audio-engine";
import { DJEngine } from "@/lib/radio/dj-engine";
import { RadioStore } from "@/lib/radio/radio-store";
import type { RadioState, Track } from "@/lib/radio/radio-types";

class FakeAudio {
  src = "";
  currentSrc = "";
  currentTime = 0;
  duration = 180;
  volume = 1;
  preload = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(event: string, handler: () => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  async play() {
    this.currentSrc = this.src;
    this.listeners.get("play")?.forEach((handler) => handler());
    this.onended?.();
  }

  pause() {
    this.listeners.get("pause")?.forEach((handler) => handler());
  }
}

function installFakeAudio() {
  const created: FakeAudio[] = [];
  function AudioConstructor(this: FakeAudio) {
    const audio = new FakeAudio();
    created.push(audio);
    return audio;
  }
  vi.stubGlobal("Audio", vi.fn(AudioConstructor));
  vi.stubGlobal("window", {} as Window & typeof globalThis);
  return created;
}

function makeState(): RadioState {
  return {
    status: "playing",
    unlockedByUser: true,
    queue: [],
    playableQueue: [],
    currentIndex: 0,
    currentTrack: null,
    timeline: [],
    currentSubtitle: "ready",
    subtitleHistory: [],
    isPlaying: true,
    isSpeaking: false,
    currentTime: 0,
    duration: 0,
    volume: 0.82,
    providerStatus: { provider: "public", status: "available", message: "ready" },
    djName: "Auralia",
    channelName: "Auralia FM",
  };
}

describe("dual-track audio engine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not touch the browser Audio API during server-side construction", () => {
    vi.unstubAllGlobals();
    const engine = new AudioEngine();

    expect(engine.getCurrentSrc()).toBe("");
    expect(engine.getCurrentDJSrc()).toBe("");
  });

  it("keeps music and DJ on separate audio tracks and restores volume after DJ speech", async () => {
    const created = installFakeAudio();
    const engine = new AudioEngine();
    const track: Track = {
      id: "track-1",
      title: "Real Track",
      artist: "Real Artist",
      audioUrl: "/audio/real-track.mp3",
      playableStatus: "playable",
      sourceType: "public",
    };

    await engine.playMusic(track);
    expect(created).toHaveLength(2);
    expect(created[0]?.src).toBe("/audio/real-track.mp3");

    await engine.playDJ("/api/tts?cache=test");

    expect(created[0]?.src).toBe("/audio/real-track.mp3");
    expect(created[0]?.volume).toBe(0.82);
    expect(created[1]?.src).toBe("/api/tts?cache=test");
  });

  it("DJEngine requests TTS JSON and plays returned audio url on the DJ track", async () => {
    vi.useFakeTimers();
    installFakeAudio();
    const store = new RadioStore(makeState());
    const audioEngine = new AudioEngine();
    const playDJ = vi.spyOn(audioEngine, "playDJ").mockResolvedValue(undefined);
    const line = "I will start with a familiar melody.";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          mode: "audio",
          audioUrl: "/tts-cache/opening.mp3",
          provider: "edge_tts",
          text: line,
        }),
      }),
    );

    const djEngine = new DJEngine(store, audioEngine);
    const speaking = djEngine.speak(line);
    await vi.runAllTimersAsync();
    await speaking;

    expect(fetch).toHaveBeenCalledWith(
      "/api/tts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          text: line,
          provider: "edge_tts",
          voice: "zh-CN-YunjianNeural",
          rate: "-12%",
          pitch: "-4Hz",
          style: "night_radio",
        }),
      }),
    );
    expect(playDJ).toHaveBeenCalledWith("/tts-cache/opening.mp3", { manageMusic: true });
  });
});

