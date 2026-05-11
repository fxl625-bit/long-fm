import type { Track } from "@prisma/client";
import type { MusicTrack } from "@/lib/types/music";
import { buildNeteaseSongExternalUrl, isValidExternalUrl } from "@/lib/utils/external-links";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function mapDbTrackToMusicTrack(track: Track): MusicTrack {
  const isNetease = track.sourceType === "NETEASE_EXPERIMENTAL" || track.sourceType === "NETEASE_OFFICIAL";
  const normalizedExternalUrl = isNetease
    ? buildNeteaseSongExternalUrl(track.providerTrackId)
    : isValidExternalUrl(track.externalUrl)
      ? track.externalUrl
      : undefined;

  return {
    id: track.id,
    name: track.name,
    artist: track.artist,
    album: track.album ?? undefined,
    duration: track.durationMs || track.duration,
    durationMs: track.durationMs || track.duration,
    coverUrl: track.coverUrl ?? undefined,
    audioUrl: track.audioUrl ?? undefined,
    externalUrl: normalizedExternalUrl,
    localPath: track.localPath ?? undefined,
    sourceType: track.sourceType as MusicTrack["sourceType"],
    playableStatus: (track.playableStatus as MusicTrack["playableStatus"]) ?? "unavailable",
    language: track.language ?? undefined,
    era: track.era ?? undefined,
    moodTags: toStringArray(track.moodTags),
    styleTags: toStringArray(track.styleTags),
    energyLevel: (track.energyLevel as MusicTrack["energyLevel"]) ?? undefined,
    lyrics: track.lyrics ?? undefined,
    rawMeta: {
      providerTrackId: track.providerTrackId,
      ...((track.rawMeta as Record<string, unknown>) ?? {}),
    },
  };
}
