import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "./tts-provider";

export class SubtitleTTSProvider implements TTSProvider {
  readonly id = "subtitle_only";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: "subtitle-only",
        name: "Subtitle Only",
        provider: "subtitle_only",
      },
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    return {
      mode: "subtitle_only",
      text: request.text.trim(),
      provider: "subtitle_only",
      cached: false,
    };
  }
}
