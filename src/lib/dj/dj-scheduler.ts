import type { LXPlayerStatus } from "@/lib/types/music";

export class DJScheduler {
  shouldSpeakOpening(hasSpokenOpening: boolean) {
    return !hasSpokenOpening;
  }

  shouldSpeakBridge(playedCount: number) {
    return playedCount > 0 && playedCount % 2 === 0;
  }
}

export function shouldSpeakBridge(playedCount: number) {
  return new DJScheduler().shouldSpeakBridge(playedCount);
}

export function getLXTrackKey(status?: LXPlayerStatus | null) {
  if (!status?.title?.trim()) {
    return "";
  }
  return `${status.title}::${status.artist}::${status.album}`.trim();
}

export function isNearTrackEnd(status?: LXPlayerStatus | null, thresholdMs = 15_000) {
  if (!status?.duration || status.progress === undefined || status.progress === null) {
    return false;
  }
  return status.duration - status.progress <= thresholdMs;
}
