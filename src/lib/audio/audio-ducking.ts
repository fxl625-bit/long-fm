type DuckingOptions = {
  targetRatio?: number;
  durationMs?: number;
};

export class AudioDucking {
  private rafId: number | null = null;
  private baseVolume = 1;
  private ducking = false;

  constructor(private readonly audio: HTMLAudioElement) {
    this.baseVolume = audio.volume;
  }

  setBaseVolume(volume: number) {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    if (!this.ducking) {
      this.audio.volume = this.baseVolume;
    }
  }

  duckMusic(options: DuckingOptions = {}) {
    const ratio = options.targetRatio ?? 0.45;
    const durationMs = options.durationMs ?? 180;
    const targetVolume = Math.max(0, Math.min(1, this.baseVolume * ratio));

    this.ducking = true;
    this.animateVolume(targetVolume, durationMs);
  }

  restoreMusic(durationMs = 220) {
    this.ducking = false;
    this.animateVolume(this.baseVolume, durationMs);
  }

  private animateVolume(target: number, durationMs: number) {
    const startVolume = this.audio.volume;
    const start = performance.now();

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = 1 - (1 - progress) * (1 - progress);
      this.audio.volume = startVolume + (target - startVolume) * eased;

      if (progress < 1) {
        this.rafId = requestAnimationFrame(step);
        return;
      }

      this.audio.volume = target;
      this.rafId = null;
    };

    this.rafId = requestAnimationFrame(step);
  }
}

