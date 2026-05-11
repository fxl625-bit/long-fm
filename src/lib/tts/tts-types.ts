export type TTSProviderId = "volcengine" | "edge_tts" | "kokoro" | "piper" | "openai" | "subtitle_only";
export type TTSOutputMode = "audio" | "subtitle_only";
export type TTSStyle = "dj" | "calm" | "energetic" | "night" | "neutral" | "night_radio";

export type TTSVoice = {
  id: string;
  name: string;
  locale?: string;
  gender?: "male" | "female" | "neutral";
  provider: TTSProviderId;
};

export type TTSRequest = {
  text: string;
  voice?: string;
  rate?: string;
  speed?: number;
  pitch?: number | string;
  style?: TTSStyle;
  provider?: TTSProviderId;
};

export type TTSResult = {
  mode: TTSOutputMode;
  audioUrl?: string;
  durationMs?: number;
  text: string;
  provider: TTSProviderId;
  voice?: string;
  rate?: string;
  pitch?: string;
  cached?: boolean;
};

export type TTSProviderStatus = {
  id: TTSProviderId;
  available: boolean;
  voices: TTSVoice[];
};

export function isTTSProviderId(value: string | undefined): value is TTSProviderId {
  return value === "volcengine" || value === "edge_tts" || value === "kokoro" || value === "piper" || value === "openai" || value === "subtitle_only";
}
