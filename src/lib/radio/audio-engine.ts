import type { SpeechMixProfile, Track } from "./radio-types";

type AudioEventHandlers = {
  onEnded?: () => void;
  onTimeUpdate?: (currentTimeMs: number, durationMs: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
};

function canUseBrowserAudio() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AudioEngine {
  private static readonly DEFAULT_SPEECH_MIX: SpeechMixProfile = {
    target: 0.10,
    fadeDownMs: 150,
    fadeUpMs: 250,
  };

  private musicAudio: HTMLAudioElement | null = null;
  private djAudio: HTMLAudioElement | null = null;
  private baseVolume = 0.82;
  private unlocked = false;
  private currentTrackUrl: string | null = null;
  private audioContext: AudioContext | null = null;
  private eventsBound = false;
  private lastPlayCallTimestamp: number | undefined;
  private firstPlayError: string | undefined;

  constructor(private readonly handlers: AudioEventHandlers = {}) {}

  ensureBrowserAudio() {
    if (!canUseBrowserAudio()) {
      return false;
    }

    if (!this.musicAudio) {
      this.musicAudio = new Audio();
      this.musicAudio.preload = "metadata";
      this.musicAudio.volume = this.baseVolume;
    }

    if (!this.djAudio) {
      this.djAudio = new Audio();
      this.djAudio.preload = "auto";
    }

    if (!this.eventsBound) {
      this.bindEvents();
      this.eventsBound = true;
    }

    return true;
  }

  private bindEvents() {
    const music = this.musicAudio;
    if (!music) {
      return;
    }

    music.addEventListener("ended", () => this.handlers.onEnded?.());
    music.addEventListener("timeupdate", () => {
      const currentTimeMs = Math.floor(music.currentTime * 1000);
      const durationMs = Number.isFinite(music.duration) ? Math.floor(music.duration * 1000) : 0;
      this.handlers.onTimeUpdate?.(currentTimeMs, durationMs);
    });
    music.addEventListener("play", () => this.handlers.onPlay?.());
    music.addEventListener("pause", () => this.handlers.onPause?.());
  }

  setTrack(track: Track, startAtMs = 0) {
    if (track.playableStatus !== "playable") {
      throw new Error("Track is not playable.");
    }
    if (!track.audioUrl) {
      throw new Error("Track audioUrl is missing.");
    }
    if (!this.ensureBrowserAudio()) {
      return;
    }

    const music = this.musicAudio!;
    if (this.currentTrackUrl !== track.audioUrl) {
      music.src = track.audioUrl;
      this.currentTrackUrl = track.audioUrl;
    }
    music.currentTime = Math.max(0, startAtMs / 1000);
    console.debug?.({
      title: track.title,
      neteaseId: track.providerTrackId ?? track.id,
      audioUrl: track.audioUrl?.slice(0, 96) ?? "",
      currentSrc: music.currentSrc || music.src,
    });
  }

  async playMusic(track?: Track) {
    if (track) {
      this.setTrack(track, 0);
    }
    await this.play();
  }

  async play() {
    if (!this.ensureBrowserAudio()) {
      return;
    }

    const music = this.musicAudio!;
    if (!music.src) {
      throw new Error("Audio src is empty.");
    }
    this.lastPlayCallTimestamp = Date.now();
    try {
      await music.play();
    } catch (error) {
      this.firstPlayError ??= error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  pause() {
    this.musicAudio?.pause();
  }

  async playDJ(
    audioUrl: string,
    options: { manageMusic?: boolean; speechMixProfile?: Partial<SpeechMixProfile> } = {},
  ) {
    if (!audioUrl) {
      return;
    }
    if (!this.ensureBrowserAudio()) {
      return;
    }

    const dj = this.djAudio!;
    const manageMusic = options.manageMusic ?? true;
    const speechMixProfile = this.resolveSpeechMixProfile(options.speechMixProfile);
    if (manageMusic) {
      this.duckMusic(speechMixProfile);
      if (speechMixProfile.fadeDownMs > 0) {
        await sleep(speechMixProfile.fadeDownMs);
      }
    }
    dj.pause();
    dj.currentTime = 0;
    dj.src = audioUrl;
    dj.volume = 1.0;

    try {
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          dj.onended = null;
          dj.onerror = null;
        };
        dj.onended = () => {
          cleanup();
          resolve();
        };
        dj.onerror = () => {
          cleanup();
          resolve();
        };
        void dj.play().then(() => undefined).catch(() => resolve());
      });
    } finally {
      if (manageMusic) {
        this.restoreMusic(speechMixProfile);
        if (speechMixProfile.fadeUpMs > 0) {
          await sleep(speechMixProfile.fadeUpMs);
        }
      }
    }
  }

  setVolume(volume: number) {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    if (this.musicAudio) {
      this.musicAudio.volume = this.baseVolume;
    }
  }

  duckMusic(profile: Partial<SpeechMixProfile> = {}) {
    if (!this.musicAudio) {
      return;
    }
    const speechMixProfile = this.resolveSpeechMixProfile(profile);
    this.musicAudio.volume = speechMixProfile.target;
  }

  restoreMusic(fadeUpMsOrProfile?: number | Partial<SpeechMixProfile>) {
    if (!this.musicAudio) {
      return;
    }
    const speechMixProfile =
      typeof fadeUpMsOrProfile === "number"
        ? this.resolveSpeechMixProfile({ fadeUpMs: fadeUpMsOrProfile })
        : this.resolveSpeechMixProfile(fadeUpMsOrProfile);
    this.musicAudio.volume = speechMixProfile.restore ?? this.baseVolume;
  }

  duck() {
    this.duckMusic();
  }

  restore() {
    this.restoreMusic();
  }

  unlockByUserGesture() {
    this.unlocked = true;
    if (typeof window === "undefined") {
      return;
    }

    this.ensureBrowserAudio();
    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (AudioContextCtor && !this.audioContext) {
      this.audioContext = new AudioContextCtor();
    }
    void this.audioContext?.resume().catch(() => undefined);
  }

  isUnlockedByGesture() {
    return this.unlocked;
  }

  getCurrentSrc() {
    const music = this.musicAudio;
    return music?.currentSrc || music?.src || this.currentTrackUrl || "";
  }

  isMusicPaused() {
    return this.musicAudio?.paused ?? true;
  }

  getLastPlayCallTimestamp() {
    return this.lastPlayCallTimestamp;
  }

  getFirstPlayError() {
    return this.firstPlayError;
  }

  getCurrentDJSrc() {
    const dj = this.djAudio;
    return dj?.currentSrc || dj?.src || "";
  }

  hasCurrentTrackSource() {
    return Boolean(this.musicAudio?.currentSrc || this.musicAudio?.src || this.currentTrackUrl);
  }

  getAudioElement() {
    if (!this.ensureBrowserAudio()) {
      return null;
    }
    return this.musicAudio;
  }

  private resolveSpeechMixProfile(profile: Partial<SpeechMixProfile> = {}): SpeechMixProfile {
    return {
      before: profile.before ?? this.baseVolume,
      target: profile.target ?? AudioEngine.DEFAULT_SPEECH_MIX.target,
      restore: profile.restore ?? this.baseVolume,
      fadeDownMs: profile.fadeDownMs ?? AudioEngine.DEFAULT_SPEECH_MIX.fadeDownMs,
      fadeUpMs: profile.fadeUpMs ?? AudioEngine.DEFAULT_SPEECH_MIX.fadeUpMs,
    };
  }
}
