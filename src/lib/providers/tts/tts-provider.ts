export type TTSMode = "subtitle_only" | "browser_tts" | "future_tts";

export type TTSSpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
};

export interface TTSProvider {
  speak(text: string, options?: TTSSpeakOptions): Promise<boolean>;
  stop(): void;
  isSpeaking(): boolean;
  isAvailable(): boolean;
}
