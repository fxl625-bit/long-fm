import { Html5AudioPlaybackProvider } from "./html5-audio-provider";

export function createPlaybackProvider() {
  return new Html5AudioPlaybackProvider();
}

export type { PlaybackProvider, ResolvedPlaybackTrack } from "./types";
