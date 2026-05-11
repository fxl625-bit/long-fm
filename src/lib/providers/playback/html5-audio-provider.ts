import type { MusicTrack } from "@/lib/types/music";
import type { PlaybackProvider, ResolvedPlaybackTrack } from "./types";

function resolveSingle(track: MusicTrack): ResolvedPlaybackTrack {
  if (track.audioUrl) {
    return {
      track,
      status: "playable",
      audioUrl: track.audioUrl,
      externalUrl: track.externalUrl,
    };
  }

  if (track.externalUrl) {
    return {
      track,
      status: "external_only",
      externalUrl: track.externalUrl,
    };
  }

  return {
    track,
    status: track.playableStatus ?? "unavailable",
  };
}

export class Html5AudioPlaybackProvider implements PlaybackProvider {
  readonly providerName = "html5_audio" as const;

  resolveTrack(track: MusicTrack): ResolvedPlaybackTrack {
    return resolveSingle(track);
  }

  resolveQueue(queue: MusicTrack[]): ResolvedPlaybackTrack[] {
    return queue.map((track) => resolveSingle(track));
  }
}
