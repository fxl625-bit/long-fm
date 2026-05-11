import type { DJDecision, DJProgramPlan, ListeningContext, UserMusicMemory } from "./dj-types";
import { decideWithGPT } from "./active-dj-planner";
import { buildListeningContext } from "./dj-context-builder";
import { createProgramWithGPT } from "./program-planner";
import { writeDJScript } from "./dj-script-writer";
import { buildUserMusicMemory } from "./user-music-memory";
import type { Track } from "@/lib/radio/radio-types";
import type { MusicTrack } from "@/lib/types/music";

function toRadioPlayableStatus(
  status: MusicTrack["playableStatus"] | undefined,
): Track["playableStatus"] {
  if (status === "playable" || status === "external_only" || status === "metadata_only" || status === "unavailable") {
    return status;
  }
  if (status === "vip_only" || status === "no_url" || status === "copyright_unavailable" || status === "unknown") {
    return "metadata_only";
  }
  return "unavailable";
}

function toRadioTrack(track: MusicTrack): Track {
  const energy: "low" | "medium" | "high" =
    track.energyLevel === "high" || track.energyLevel === "medium-high"
      ? "high"
      : track.energyLevel === "low" || track.energyLevel === "medium-low"
        ? "low"
        : "medium";

  const tags = {
    mood: track.moodTags,
    style: track.styleTags,
    language: track.language,
    era: track.era,
    energy,
    vocal: "mixed" as const,
  };

  const sourceType: Track["sourceType"] =
    track.sourceType === "LOCAL"
      ? "local"
      : track.sourceType === "PUBLIC"
        ? "public"
      : track.sourceType === "NETEASE_OFFICIAL" || track.sourceType === "NETEASE_EXPERIMENTAL"
        ? "netease"
        : track.sourceType === "GENERIC_API"
          ? "external"
          : "demo";

  return {
    id: track.id,
    providerTrackId: track.id,
    title: track.name,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl,
    audioUrl: track.audioUrl,
    externalUrl: track.externalUrl,
    durationMs: track.durationMs ?? track.duration,
    sourceType,
    playableStatus: toRadioPlayableStatus(track.playableStatus),
    tags,
  };
}

export class GPTDJBrain {
  async buildMemory(input: { tracks: Track[]; recentPlayed?: Track[]; recentSkipped?: Track[] }): Promise<UserMusicMemory> {
    return buildUserMusicMemory({
      tracks: input.tracks,
      recentPlayed: input.recentPlayed,
      recentSkipped: input.recentSkipped,
      enableLLMSummary: true,
    });
  }

  buildContext(now = new Date()): ListeningContext {
    return buildListeningContext(now);
  }

  async planProgram(input: {
    memory: UserMusicMemory;
    context: ListeningContext;
    candidateTracks: Track[];
    recentPlayed?: Track[];
    recentSkipped?: Track[];
  }): Promise<DJProgramPlan> {
    return createProgramWithGPT({
      memory: input.memory,
      context: input.context,
      candidateTracks: input.candidateTracks,
      recentPlayed: input.recentPlayed ?? [],
      recentSkipped: input.recentSkipped ?? [],
    });
  }

  async decide(input: {
    memory: UserMusicMemory;
    context: ListeningContext;
    recentTracks: Track[];
    upcomingTracks: Track[];
    candidateTracks: Track[];
    currentSegment?: string;
  }): Promise<DJDecision> {
    return decideWithGPT(input);
  }

  async writeLine(input: Parameters<typeof writeDJScript>[0]): Promise<string> {
    return writeDJScript(input);
  }
}

export function toRadioTracksFromMusicTracks(tracks: MusicTrack[]): Track[] {
  return tracks.map(toRadioTrack);
}
