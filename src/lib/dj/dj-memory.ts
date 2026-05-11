import { buildUserMusicMemory } from "./user-music-memory";
import type { Track } from "@/lib/radio/radio-types";

export async function buildDJMemory(input: {
  tracks: Track[];
  recentPlayed: Track[];
  recentSkipped: Track[];
}) {
  return buildUserMusicMemory({
    tracks: input.tracks,
    recentPlayed: input.recentPlayed,
    recentSkipped: input.recentSkipped,
    enableLLMSummary: false,
  });
}
