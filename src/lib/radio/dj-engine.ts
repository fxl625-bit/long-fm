import type { AudioEngine } from "./audio-engine";
import type { RadioStore } from "./radio-store";
import type { RadioStatus, SpeechMixProfile } from "./radio-types";
import { readDJVoiceSettings } from "@/lib/tts/tts-settings-store";

type SpeakPayload = {
  subtitle: string;
  audioDataUrl?: string;
};

type SpeakOptions = {
  withinGroup?: boolean;
  bypassGuard?: boolean;
};

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const chunks = normalized.match(/[^。！？!?]+[。！？!?]?/g);
  return chunks?.map((item) => item.trim()).filter(Boolean) ?? [normalized];
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestTTS(text: string): Promise<{
  audioUrl: string | null;
  provider: string;
  mode: "audio" | "subtitle_only";
  voice?: string;
  rate?: string;
  pitch?: string;
}> {
  const voiceSettings = readDJVoiceSettings();
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      provider: voiceSettings.provider,
      voice: voiceSettings.voice,
      rate: voiceSettings.rate,
      pitch: voiceSettings.pitch,
      style: "night_radio",
    }),
  }).catch(() => null);

  if (!response?.ok) {
    return {
      audioUrl: null,
      provider: "subtitle_only",
      mode: "subtitle_only",
      voice: voiceSettings.voice,
      rate: voiceSettings.rate,
      pitch: voiceSettings.pitch,
    };
  }

  const payload = (await response.json()) as {
    mode?: "audio" | "subtitle_only";
    audioUrl?: string;
    provider?: string;
    voice?: string;
    rate?: string;
    pitch?: string;
  };
  return {
    audioUrl: payload.mode === "audio" && payload.audioUrl ? payload.audioUrl : null,
    provider: payload.provider ?? (payload.mode === "audio" ? "audio" : "subtitle_only"),
    mode: payload.mode === "audio" ? "audio" : "subtitle_only",
    voice: payload.voice ?? voiceSettings.voice,
    rate: payload.rate ?? voiceSettings.rate,
    pitch: payload.pitch ?? voiceSettings.pitch,
  };
}

const SPEECH_MIX_PROFILE: SpeechMixProfile = {
  target: 0.10,
  fadeDownMs: 150,
  fadeUpMs: 250,
};

export class DJEngine {
  private speaking = false;
  private speechDepth = 0;
  private previousStatus: RadioStatus | null = null;
  private previousPlaying = false;
  private previousUnlockedByUser = false;

  constructor(private readonly store: RadioStore, private readonly audioEngine: AudioEngine) {}

  isSpeaking() {
    return this.speaking;
  }

  beginSpeechGroup() {
    this.speechDepth += 1;
    if (this.speechDepth > 1) {
      return;
    }

    const previousState = this.store.getState();
    const speechMix = this.resolveSpeechMixProfile(previousState.volume);
    this.previousStatus = previousState.status;
    this.previousPlaying = previousState.isPlaying;
    this.previousUnlockedByUser = previousState.unlockedByUser;
    this.speaking = true;
    this.audioEngine.duckMusic(speechMix);
    this.store.update((prev) => ({
      ...prev,
      status: "speaking",
      isSpeaking: true,
      duckedVolume: speechMix,
    }));
  }

  endSpeechGroup() {
    if (this.speechDepth === 0) {
      return;
    }

    this.speechDepth -= 1;
    if (this.speechDepth > 0) {
      return;
    }

    const speechMix = this.store.getState().duckedVolume ?? this.resolveSpeechMixProfile(this.store.getState().volume);
    this.audioEngine.restoreMusic(speechMix);
    const restoreStatus =
      this.previousStatus === "speaking"
        ? this.previousPlaying
          ? "playing"
          : this.previousUnlockedByUser
            ? "paused"
            : "locked"
        : this.previousStatus ?? (this.previousPlaying ? "playing" : this.previousUnlockedByUser ? "paused" : "locked");

    this.store.update((prev) => ({
      ...prev,
      status: restoreStatus,
      isSpeaking: false,
      duckedVolume: prev.duckedVolume
        ? {
            ...prev.duckedVolume,
            restore: prev.duckedVolume.restore ?? prev.volume,
          }
        : prev.duckedVolume,
    }));

    this.previousStatus = null;
    this.previousPlaying = false;
    this.previousUnlockedByUser = false;
    this.speaking = false;
  }

  async speak(payload: string | SpeakPayload, options: SpeakOptions = {}) {
    const subtitle = typeof payload === "string" ? payload : payload.subtitle;
    const audioDataUrl = typeof payload === "string" ? undefined : payload.audioDataUrl;
    const normalized = subtitle.trim();
    if (!normalized) {
      return;
    }

    const safeLine = normalized;
    const withinGroup = options.withinGroup ?? false;
    if (this.speaking && !withinGroup) {
      return;
    }

    if (!withinGroup) {
      this.beginSpeechGroup();
    }

    try {
      const previousState = this.store.getState();
      const speechMix = previousState.duckedVolume ?? this.resolveSpeechMixProfile(previousState.volume);
      this.store.update((prev) => ({
        ...prev,
        status: "speaking",
        isSpeaking: true,
        lastDJLine: safeLine,
        duckedVolume: prev.duckedVolume ?? speechMix,
        subtitleHistory: prev.currentSubtitle ? [prev.currentSubtitle, ...prev.subtitleHistory].slice(0, 5) : prev.subtitleHistory,
      }));

      const ttsResult = audioDataUrl
        ? { audioUrl: audioDataUrl, provider: "prefetched", mode: "audio" as const }
        : await requestTTS(safeLine);
      const ttsUrl = ttsResult.audioUrl;
      const ttsMode =
        ttsResult.provider === "edge_tts" ||
        ttsResult.provider === "kokoro" ||
        ttsResult.provider === "piper" ||
        ttsResult.provider === "openai" ||
        ttsResult.provider === "subtitle_only"
          ? ttsResult.provider
          : ttsUrl
            ? previousState.ttsMode ?? "edge_tts"
            : "subtitle_only";

      this.store.setState({
        ttsMode,
        ttsProvider: ttsResult.provider,
        ttsVoice: ttsResult.voice,
        ttsRate: ttsResult.rate,
        ttsPitch: ttsResult.pitch,
        lastDJAudioUrl: ttsUrl ?? undefined,
      });

      const djPlayback = ttsUrl
        ? this.audioEngine.playDJ(ttsUrl, { manageMusic: false, speechMixProfile: speechMix })
        : Promise.resolve();

      const sentences = splitSentences(safeLine).slice(0, 4);
      const start = Date.now();
      for (const sentence of sentences) {
        this.store.setState({ currentSubtitle: sentence });
        const hold = Math.min(3000, Math.max(1800, sentence.length * 95));
        await sleep(hold);
        await sleep(360);
      }

      await djPlayback;
      const elapsed = Date.now() - start;
      if (ttsUrl) {
        if (elapsed < 3500) {
          await sleep(Math.min(1200, 3500 - elapsed));
        }
      } else if (elapsed < 6000) {
        await sleep(6000 - elapsed);
      }
    } finally {
      if (!withinGroup) {
        this.endSpeechGroup();
      }
    }
  }

  private resolveSpeechMixProfile(volume: number): SpeechMixProfile {
    return {
      before: volume,
      target: SPEECH_MIX_PROFILE.target,
      restore: volume,
      fadeDownMs: SPEECH_MIX_PROFILE.fadeDownMs,
      fadeUpMs: SPEECH_MIX_PROFILE.fadeUpMs,
    };
  }
}
