import { DEFAULT_CHANNEL_NAME, DEFAULT_DJ_NAME } from "@/lib/constants/product";
import type { RadioState } from "./radio-types";
import { AudioEngine } from "./audio-engine";
import { DJEngine } from "./dj-engine";
import { RadioSessionEngine } from "./radio-session-engine";
import { RadioStore } from "./radio-store";

function createInitialState(): RadioState {
  return {
    status: "idle",
    unlockedByUser: false,
    queue: [],
    playableQueue: [],
    currentIndex: 0,
    currentTrack: null,
    queueVersion: 0,
    timeline: [],
    currentSubtitle: "正在加载你的私人频道...",
    subtitleHistory: [],
    isPlaying: false,
    isSpeaking: false,
    currentTime: 0,
    duration: 0,
    volume: 0.82,
    providerStatus: {
      provider: "auto",
      status: "degraded",
      message: "等待音乐源",
    },
    djName: DEFAULT_DJ_NAME,
    channelName: DEFAULT_CHANNEL_NAME,
  };
}

export class RadioCore {
  readonly store: RadioStore;
  readonly audioEngine: AudioEngine;
  readonly djEngine: DJEngine;
  readonly sessionEngine: RadioSessionEngine;
  readonly sessionController: RadioSessionEngine;

  constructor() {
    this.store = new RadioStore(createInitialState());
    this.audioEngine = new AudioEngine({
      onEnded: () => this.sessionEngine.onAudioEnded(),
      onTimeUpdate: (currentTimeMs, durationMs) => this.sessionEngine.onAudioTimeUpdate(currentTimeMs, durationMs),
      onPlay: () => this.sessionEngine.onAudioPlay(),
      onPause: () => this.sessionEngine.onAudioPause(),
    });
    this.djEngine = new DJEngine(this.store, this.audioEngine);
    this.sessionEngine = new RadioSessionEngine(this.store, this.audioEngine, this.djEngine);
    this.sessionController = this.sessionEngine;
  }
}
