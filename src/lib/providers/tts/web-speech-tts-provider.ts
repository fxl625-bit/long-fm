import type { TTSSpeakOptions, TTSProvider } from "./tts-provider";

export class WebSpeechTTSProvider implements TTSProvider {
  private speaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  isAvailable() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickBestVoice() {
    if (!this.isAvailable()) {
      return null;
    }

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      return null;
    }

    const preferred = voices.find(
      (voice) => /zh|Chinese|中文/i.test(voice.lang) && /female|xiaoyi|xiaoxiao|yunxi|narrator/i.test(voice.name),
    );
    if (preferred) {
      return preferred;
    }

    const chinese = voices.find((voice) => /zh|Chinese|中文/i.test(voice.lang));
    return chinese ?? null;
  }

  speak(text: string, options?: TTSSpeakOptions): Promise<boolean> {
    if (!this.isAvailable()) {
      return Promise.resolve(false);
    }

    const voice = this.pickBestVoice();
    if (!voice) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options?.lang ?? "zh-CN";
      utterance.rate = options?.rate ?? 0.92;
      utterance.pitch = options?.pitch ?? 0.98;
      utterance.volume = options?.volume ?? 0.8;
      utterance.voice = voice;

      utterance.onstart = () => {
        this.speaking = true;
      };

      utterance.onend = () => {
        this.speaking = false;
        this.currentUtterance = null;
        resolve(true);
      };

      utterance.onerror = () => {
        this.speaking = false;
        this.currentUtterance = null;
        resolve(false);
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    this.currentUtterance = null;
    this.speaking = false;
  }

  isSpeaking() {
    if (!this.isAvailable()) {
      return false;
    }
    return this.speaking || window.speechSynthesis.speaking;
  }
}
