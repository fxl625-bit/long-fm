import type { Track } from "./radio-types";

export type TrackIndex = {
  byInternalId: Map<string, Track>;
  byProviderId: Map<string, Track>;
  byNeteaseId: Map<string, Track>;
};

export function getTrackProviderId(track: Track) {
  return String(track.providerTrackId ?? track.neteaseId ?? track.id);
}

export function buildTrackIndex(tracks: Track[]): TrackIndex {
  const byInternalId = new Map<string, Track>();
  const byProviderId = new Map<string, Track>();
  const byNeteaseId = new Map<string, Track>();

  for (const track of tracks) {
    byInternalId.set(track.id, track);
    byProviderId.set(getTrackProviderId(track), track);
    if (track.neteaseId) {
      byNeteaseId.set(String(track.neteaseId), track);
    }
  }

  return {
    byInternalId,
    byProviderId,
    byNeteaseId,
  };
}

export function resolvePatchTrackIds(trackIds: string[], index: TrackIndex) {
  const resolvedTracks: Track[] = [];
  const resolvedTrackIds: string[] = [];
  const unresolvedTrackIds: string[] = [];
  const seenInternalIds = new Set<string>();

  for (const rawId of trackIds) {
    const id = String(rawId);
    const track = index.byInternalId.get(id) ?? index.byProviderId.get(id) ?? index.byNeteaseId.get(id);
    if (!track) {
      unresolvedTrackIds.push(id);
      continue;
    }
    if (seenInternalIds.has(track.id)) {
      continue;
    }
    seenInternalIds.add(track.id);
    resolvedTracks.push(track);
    resolvedTrackIds.push(getTrackProviderId(track));
  }

  return {
    resolvedTracks,
    resolvedTrackIds,
    unresolvedTrackIds,
  };
}
