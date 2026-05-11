type PlaylistTrackDebug = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  coverUrl?: string;
};

type PlaylistTracksDebugPayload = {
  playlistId: string;
  name: string;
  trackCount: number;
  tracks: PlaylistTrackDebug[];
  debug: {
    rawShape: "playlist.tracks" | "body.playlist.tracks" | "data.playlist.tracks" | "playlist.trackIds+song.detail";
    hasCookie: boolean;
    trackCountFromRaw: number;
  };
};

type PlaylistTracksDebugErrorReason =
  | "cookie_missing"
  | "playlist_id_missing"
  | "playlist_detail_api_error"
  | "no_tracks_in_response"
  | "invalid_response_shape";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toStringValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return undefined;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function pickPlaylistRecord(raw: unknown) {
  const record = asRecord(raw);
  const body = asRecord(record?.body);
  const data = asRecord(record?.data);

  const candidates = [
    { playlist: asRecord(record?.playlist), rawShape: "playlist.tracks" as const },
    { playlist: asRecord(body?.playlist), rawShape: "body.playlist.tracks" as const },
    { playlist: asRecord(data?.playlist), rawShape: "data.playlist.tracks" as const },
  ];

  return candidates.find((candidate) => candidate.playlist) ?? null;
}

function mapArtistNames(track: Record<string, unknown>) {
  const artists = asArray<Record<string, unknown>>(track.ar).length
    ? asArray<Record<string, unknown>>(track.ar)
    : asArray<Record<string, unknown>>(track.artists);

  return artists.map((artist) => toStringValue(artist.name)).filter(Boolean).join(" / ") || "未知歌手";
}

function mapTrack(track: unknown): PlaylistTrackDebug | null {
  const record = asRecord(track);
  if (!record) {
    return null;
  }

  const album = asRecord(record?.al) ?? asRecord(record?.album);
  const id = toStringValue(record?.id);
  const title = toStringValue(record?.name);

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    artist: mapArtistNames(record),
    album: toStringValue(album?.name),
    durationMs: toNumberValue(record?.dt ?? record?.duration),
    coverUrl: toStringValue(album?.picUrl),
  };
}

export function extractPlaylistTracksDebugPayload(
  raw: unknown,
  limit: number,
  songDetailSongs: unknown[] = [],
): PlaylistTracksDebugPayload {
  const playlistContainer = pickPlaylistRecord(raw);
  if (!playlistContainer?.playlist) {
    throw new Error("Invalid playlist detail response shape");
  }

  const playlist = playlistContainer.playlist;
  const playlistId = toStringValue(playlist.id);
  const name = toStringValue(playlist.name);
  const trackCount = toNumberValue(playlist.trackCount) ?? 0;

  if (!playlistId || !name) {
    throw new Error("Invalid playlist detail response shape");
  }

  const inlineTracks = asArray(playlist.tracks).map(mapTrack).filter(Boolean) as PlaylistTrackDebug[];
  if (inlineTracks.length > 0) {
    return {
      playlistId,
      name,
      trackCount,
      tracks: inlineTracks.slice(0, limit),
      debug: {
        rawShape: playlistContainer.rawShape,
        hasCookie: false,
        trackCountFromRaw: trackCount || inlineTracks.length,
      },
    };
  }

  const trackIds = asArray<Record<string, unknown> | number | string>(playlist.trackIds)
    .map((item) => {
      if (typeof item === "number" || typeof item === "string") {
        return toStringValue(item);
      }
      return toStringValue(asRecord(item)?.id);
    })
    .filter(Boolean);

  if (!trackIds.length) {
    throw new Error("No tracks in response");
  }

  const detailTracks = songDetailSongs.map(mapTrack).filter(Boolean) as PlaylistTrackDebug[];
  if (!detailTracks.length) {
    throw new Error("No tracks in response");
  }

  return {
    playlistId,
    name,
    trackCount: trackCount || trackIds.length,
    tracks: detailTracks.slice(0, limit),
    debug: {
      rawShape: "playlist.trackIds+song.detail",
      hasCookie: false,
      trackCountFromRaw: trackCount || trackIds.length,
    },
  };
}

export function mapPlaylistTracksDebugError(error: unknown): PlaylistTracksDebugErrorReason {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  if (message.includes("cookie")) return "cookie_missing";
  if (message.includes("playlistid")) return "playlist_id_missing";
  if (message.includes("no tracks")) return "no_tracks_in_response";
  if (message.includes("invalid")) return "invalid_response_shape";
  return "playlist_detail_api_error";
}

export type { PlaylistTrackDebug, PlaylistTracksDebugErrorReason, PlaylistTracksDebugPayload };
