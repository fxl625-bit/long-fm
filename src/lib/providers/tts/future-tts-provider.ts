import type { TTSSpeakOptions, TTSProvider } from "./tts-provider";

export class FutureTTSProvider implements TTSProvider {
  isAvailable() {
    return false;
  }

  async speak(text: string, options?: TTSSpeakOptions): Promise<boolean> {
    void text;
    void options;
    return false;
  }

  stop() {
    // Reserved for OpenAI / Edge / local runtime providers.
  }

  isSpeaking() {
    return false;
  }
}
