import type { MusicTrack, PlayableStatus } from "@/lib/types/music";

export interface ResolvedPlaybackTrack {
  track: MusicTrack;
  status: PlayableStatus;
  audioUrl?: string;
  externalUrl?: string;
}

export interface PlaybackProvider {
  readonly providerName: "html5_audio";
  resolveTrack(track: MusicTrack): ResolvedPlaybackTrack;
  resolveQueue(queue: MusicTrack[]): ResolvedPlaybackTrack[];
}
