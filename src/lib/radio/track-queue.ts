import type { PlaybackQueueItem } from "@/lib/types/music";
import type { Track } from "./radio-types";

export type TrackQueueBuildResult = {
  queue: Track[];
  playableQueue: Track[];
  warnings: string[];
};

function mapSourceType(sourceType?: string): Track["sourceType"] {
  if (sourceType === "LOCAL") return "local";
  if (sourceType === "PUBLIC") return "public";
  if (sourceType === "NETEASE_OFFICIAL" || sourceType === "NETEASE_EXPERIMENTAL") return "netease";
  if (sourceType === "GENERIC_API") return "external";
  return "demo";
}

function mapPlayableStatus(status?: string): Track["playableStatus"] {
  if (status === "playable" || status === "metadata_only" || status === "external_only" || status === "unavailable") {
    return status;
  }
  if (status === "vip_only" || status === "no_url" || status === "copyright_unavailable" || status === "unknown") {
    return "metadata_only";
  }
  return "unavailable";
}

function mapEnergy(level?: string): "low" | "medium" | "high" | undefined {
  if (!level) return undefined;
  if (level === "low" || level === "medium-low") return "low";
  if (level === "high" || level === "medium-high") return "high";
  return "medium";
}

export function toTrack(item: PlaybackQueueItem): Track {
  const track = item.track;
  const rawMeta =
    track.rawMeta && typeof track.rawMeta === "object" ? (track.rawMeta as Record<string, unknown>) : {};
  const topLevelTrack = track as unknown as Record<string, unknown>;
  const providerTrackId = String(rawMeta.providerTrackId ?? topLevelTrack.providerTrackId ?? track.id);
  const neteaseId = String(rawMeta.neteaseId ?? topLevelTrack.neteaseId ?? providerTrackId);

  return {
    id: track.id,
    providerTrackId,
    neteaseId,
    title: track.name,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl,
    audioUrl: track.audioUrl,
    externalUrl: track.externalUrl,
    durationMs: Math.max(0, track.durationMs ?? track.duration ?? 0),
    sourceType: mapSourceType(track.sourceType),
    playableStatus: mapPlayableStatus(track.playableStatus),
    tags: {
      mood: track.moodTags ?? [],
      style: track.styleTags ?? [],
      language: track.language,
      era: track.era,
      energy: mapEnergy(track.energyLevel),
      vocal: "mixed",
    },
    adjustedTag: rawMeta.replacementSource === "search" ? "搜索补歌替代" : undefined,
  };
}

function isPlayable(track: Track): boolean {
  return track.playableStatus === "playable" && Boolean(track.audioUrl?.trim());
}

export function buildPlayableQueue(queue: Track[]): TrackQueueBuildResult {
  const warnings: string[] = [];
  const dedupAudio = new Set<string>();
  const playableQueue: Track[] = [];

  for (const track of queue) {
    if (!isPlayable(track)) {
      warnings.push(`track_skipped_unplayable:${track.id}`);
      continue;
    }
    const audioUrl = track.audioUrl!.trim();
    if (dedupAudio.has(audioUrl)) {
      warnings.push(`track_skipped_duplicate_audio:${track.id}`);
      continue;
    }
    dedupAudio.add(audioUrl);
    playableQueue.push({
      ...track,
      audioUrl,
    });
  }

  return {
    queue,
    playableQueue,
    warnings,
  };
}

export function sanitizePlayableQueue(items: PlaybackQueueItem[]): Track[] {
  const queue = items.map(toTrack);
  return buildPlayableQueue(queue).playableQueue;
}
