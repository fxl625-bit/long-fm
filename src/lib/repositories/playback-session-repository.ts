import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MusicSourceType, PlaybackQueueItem, PlaybackSessionState } from "@/lib/types/music";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";
import { buildNeteaseSongExternalUrl, isValidExternalUrl } from "@/lib/utils/external-links";
import { buildPlayableQueue, normalizeSessionQueue } from "@/lib/audio/radio-playback-state";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toPersistedSource(source: MusicSourceType): Exclude<MusicSourceType, "PUBLIC" | "LX_MUSIC"> | "GENERIC_API" {
  if (source === "PUBLIC") {
    return "DEMO";
  }

  if (source === "LX_MUSIC") {
    return "GENERIC_API";
  }

  return source;
}

function toQueue(value: unknown): PlaybackQueueItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const mapped = value
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const track = obj.track as Record<string, unknown> | undefined;
      if (!track?.id || !track.name || !track.artist) {
        return null;
      }
      const neteaseUrl =
        track.sourceType === "NETEASE_EXPERIMENTAL" || track.sourceType === "NETEASE_OFFICIAL"
          ? buildNeteaseSongExternalUrl(track.id)
          : undefined;
      const queueItem: PlaybackQueueItem = {
        // Keep old serialized queue backward compatible while correcting netease links.
        // providerTrackId is not available here, so use JSON track.id for netease sources when numeric.
        track: {
          id: String(track.id),
          name: String(track.name),
          artist: String(track.artist),
          album: track.album ? String(track.album) : undefined,
          duration: Number(track.duration ?? 0),
          durationMs: Number(track.durationMs ?? track.duration ?? 0),
          coverUrl: track.coverUrl ? String(track.coverUrl) : undefined,
          audioUrl: track.audioUrl ? String(track.audioUrl) : undefined,
          externalUrl: neteaseUrl ?? (isValidExternalUrl(track.externalUrl) ? String(track.externalUrl) : undefined),
          localPath: track.localPath ? String(track.localPath) : undefined,
          sourceType: (track.sourceType as MusicSourceType) ?? "DEMO",
          playableStatus: (track.playableStatus as PlaybackQueueItem["track"]["playableStatus"]) ?? "unavailable",
          language: track.language ? String(track.language) : undefined,
          era: track.era ? String(track.era) : undefined,
          moodTags: Array.isArray(track.moodTags) ? track.moodTags.map(String) : undefined,
          styleTags: Array.isArray(track.styleTags) ? track.styleTags.map(String) : undefined,
          energyLevel: track.energyLevel as PlaybackQueueItem["track"]["energyLevel"],
          rawMeta: (track.rawMeta as Record<string, unknown>) ?? undefined,
        },
        reason: obj.reason ? String(obj.reason) : undefined,
        section: obj.section as PlaybackQueueItem["section"],
      };
      return queueItem;
    });

  const queue = mapped.filter((item): item is PlaybackQueueItem => item !== null);
  return buildPlayableQueue(queue);
}

export async function getPlaybackSession(userId: string): Promise<PlaybackSessionState | null> {
  const session = await prisma.playbackSession.findUnique({
    where: { userId },
  });
  if (!session) {
    return null;
  }

  const parsed: PlaybackSessionState = {
    currentTrackId: session.currentTrackId ?? undefined,
    queue: toQueue(session.queueJson),
    currentIndex: session.currentIndex,
    currentTime: session.currentTime,
    isPlaying: session.isPlaying,
    volume: session.volume,
    source: session.source as MusicSourceType,
    updatedAt: session.updatedAt.toISOString(),
  };
  return normalizeSessionQueue(parsed);
}

export async function upsertPlaybackSession(userId: string, state: PlaybackSessionState) {
  const normalized = normalizeSessionQueue(state);
  return prisma.playbackSession.upsert({
    where: { userId },
    update: {
      currentTrackId: normalized.currentTrackId ?? null,
      queueJson: toJson(normalized.queue),
      currentIndex: normalized.currentIndex,
      currentTime: normalized.currentTime,
      isPlaying: normalized.isPlaying,
      volume: normalized.volume,
      source: toPersistedSource(normalized.source),
    },
    create: {
      userId,
      currentTrackId: normalized.currentTrackId ?? null,
      queueJson: toJson(normalized.queue),
      currentIndex: normalized.currentIndex,
      currentTime: normalized.currentTime,
      isPlaying: normalized.isPlaying,
      volume: normalized.volume,
      source: toPersistedSource(normalized.source),
    },
  });
}

export async function buildDefaultSessionFromTracks(userId: string, trackIds: string[]) {
  const tracks = await prisma.track.findMany({
    where: {
      id: {
        in: trackIds,
      },
    },
  });

  const byId = new Map(tracks.map((track) => [track.id, track]));
  const ordered = trackIds
    .map((trackId) => byId.get(trackId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const queue: PlaybackQueueItem[] = buildPlayableQueue(ordered.map((track) => ({
    track: mapDbTrackToMusicTrack(track),
  })));

  const state: PlaybackSessionState = {
    currentTrackId: queue[0]?.track.id,
    queue,
    currentIndex: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    source: queue[0]?.track.sourceType ?? "DEMO",
  };

  await upsertPlaybackSession(userId, state);
  return state;
}
