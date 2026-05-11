import type { MusicTrack, PlayableStatus } from "@/lib/types/music";

export type FailedTrackReason =
  | "no_url"
  | "vip_only"
  | "copyright_unavailable"
  | "api_error"
  | "invalid_response"
  | "unknown";

export type FailedTrack = {
  id: string;
  title: string;
  artist: string;
  reason: FailedTrackReason;
  raw?: unknown;
};

export type ResolveStats = {
  total: number;
  playable: number;
  noUrl: number;
  vipOnly: number;
  copyrightUnavailable: number;
  apiError: number;
  unknown: number;
};

export type ResolveResult = {
  playableTracks: MusicTrack[];
  failedTracks: FailedTrack[];
  stats: ResolveStats;
  usedSearchFallback: boolean;
  progress: {
    current: number;
    total: number;
  };
  lastSongUrlRawShape?: string;
};

type SongUrlCandidate = {
  url: string;
  br?: number;
  type?: string;
  fee?: number;
  code?: number;
  raw: unknown;
};

type ResolverClient = {
  resolveSongUrl: (songId: string, songMeta?: Record<string, unknown>, cookie?: string) => Promise<{
    songId: string;
    url?: string;
    br?: number;
    type?: string;
    playableStatus: PlayableStatus;
    reason?: string;
    raw?: unknown;
  }>;
  searchSongs: (query: string, cookie?: string) => Promise<MusicTrack[]>;
};

type ResolveOptions = {
  allowSearchFallback?: boolean;
  cookie?: string;
  onProgress?: (progress: { current: number; total: number; lastSongUrlRawShape?: string }) => void;
};

function createStats(total: number): ResolveStats {
  return {
    total,
    playable: 0,
    noUrl: 0,
    vipOnly: 0,
    copyrightUnavailable: 0,
    apiError: 0,
    unknown: 0,
  };
}

function shapeOfRaw(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "empty";
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.data)) return "data[]";
  if (record.body && typeof record.body === "object" && Array.isArray((record.body as Record<string, unknown>).data)) return "body.data[]";
  if (record.data && typeof record.data === "object" && Array.isArray((record.data as Record<string, unknown>).data)) return "data.data[]";
  if (Array.isArray(record.urls)) return "urls[]";
  if (typeof record.url === "string") return "url";
  return "unknown";
}

function toFailedReason(status: PlayableStatus, raw?: unknown): FailedTrackReason {
  if (status === "no_url") return "no_url";
  if (status === "vip_only") return "vip_only";
  if (status === "copyright_unavailable") return "copyright_unavailable";
  if (status === "unknown") return "unknown";

  if (raw && typeof raw === "object") {
    const message = JSON.stringify(raw);
    if (message.includes("error") || message.includes("failed")) {
      return "api_error";
    }
  }

  return "invalid_response";
}

function bumpFailedStats(stats: ResolveStats, reason: FailedTrackReason) {
  if (reason === "no_url") stats.noUrl += 1;
  else if (reason === "vip_only") stats.vipOnly += 1;
  else if (reason === "copyright_unavailable") stats.copyrightUnavailable += 1;
  else if (reason === "api_error") stats.apiError += 1;
  else stats.unknown += 1;
}

function toPlayableTrack(track: MusicTrack, resolved: { url?: string; br?: number; type?: string }): MusicTrack {
  return {
    ...track,
    audioUrl: resolved.url,
    durationMs: track.durationMs ?? track.duration,
    playableStatus: "playable",
    rawMeta: {
      ...(track.rawMeta ?? {}),
      resolvedBr: resolved.br,
      resolvedType: resolved.type,
    },
  };
}

function normalizeSearchQuery(track: MusicTrack) {
  return `${track.name} ${track.artist}`.trim();
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[\s\-_/()[\]{}.,!?'"`~:;]+/g, "");
}

function scoreSearchCandidate(original: MusicTrack, candidate: MusicTrack) {
  const originalTitle = normalizeForMatch(original.name);
  const originalArtist = normalizeForMatch(original.artist);
  const candidateTitle = normalizeForMatch(candidate.name);
  const candidateArtist = normalizeForMatch(candidate.artist);

  let score = 0;
  if (originalTitle && candidateTitle) {
    if (originalTitle === candidateTitle) score += 8;
    else if (candidateTitle.includes(originalTitle) || originalTitle.includes(candidateTitle)) score += 4;
  }
  if (originalArtist && candidateArtist) {
    if (originalArtist === candidateArtist) score += 6;
    else if (candidateArtist.includes(originalArtist) || originalArtist.includes(candidateArtist)) score += 3;
  }
  if (originalTitle && candidateTitle && originalArtist && candidateArtist) {
    if (`${candidateTitle}${candidateArtist}` === `${originalTitle}${originalArtist}`) {
      score += 3;
    }
  }

  return score;
}

function markReplacement(track: MusicTrack, original: MusicTrack): MusicTrack {
  return {
    ...track,
    rawMeta: {
      ...(track.rawMeta ?? {}),
      replacementSource: "search",
      replacementFor: original.id,
      replacementForTitle: original.name,
      replacementForArtist: original.artist,
    },
  };
}

export function extractSongUrl(raw: unknown): SongUrlCandidate | null {
  const record = raw as Record<string, unknown> | null | undefined;
  const candidates = [
    record?.data && Array.isArray(record.data) ? record.data[0] : undefined,
    record?.body && typeof record.body === "object" && Array.isArray((record.body as Record<string, unknown>).data)
      ? ((record.body as Record<string, unknown>).data as unknown[])[0]
      : undefined,
    record?.data && typeof record.data === "object" && Array.isArray((record.data as Record<string, unknown>).data)
      ? ((record.data as Record<string, unknown>).data as unknown[])[0]
      : undefined,
    record?.urls && Array.isArray(record.urls) ? record.urls[0] : undefined,
    raw,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.url === "string" && item.url.trim()) {
      return {
        url: item.url,
        br: typeof item.br === "number" ? item.br : undefined,
        type: typeof item.type === "string" ? item.type : undefined,
        fee: typeof item.fee === "number" ? item.fee : undefined,
        code: typeof item.code === "number" ? item.code : undefined,
        raw: item,
      };
    }
  }

  return null;
}

export function summarizeResolveResult(result: ResolveResult): string {
  const failedCount = Math.max(result.failedTracks.length, result.stats.total - result.stats.playable);
  const parts = [`\u5171 ${result.stats.total} \u9996`, `\u53ef\u64ad ${result.stats.playable} \u9996`, `\u5931\u8d25 ${failedCount} \u9996`];
  if (result.stats.vipOnly) parts.push(`VIP ${result.stats.vipOnly}`);
  if (result.stats.copyrightUnavailable) parts.push(`\u7248\u6743 ${result.stats.copyrightUnavailable}`);
  if (result.stats.noUrl) parts.push(`URL \u4e3a\u7a7a ${result.stats.noUrl}`);
  if (result.stats.apiError) parts.push(`API \u5f02\u5e38 ${result.stats.apiError}`);
  if (result.usedSearchFallback) parts.push("\u5df2\u5c1d\u8bd5\u641c\u7d22\u8865\u6b4c");
  return parts.join("\uff0c");
}

async function trySearchFallback(
  failedTrack: MusicTrack,
  client: ResolverClient,
  cookie: string | undefined,
): Promise<MusicTrack | null> {
  const query = normalizeSearchQuery(failedTrack);
  const searchResults = await client
    .searchSongs(query, cookie)
    .then((items) => items.sort((a, b) => scoreSearchCandidate(failedTrack, b) - scoreSearchCandidate(failedTrack, a)))
    .catch(() => []);

  for (const candidate of searchResults.slice(0, 5)) {
    const resolved = await client.resolveSongUrl(candidate.id, candidate.rawMeta as Record<string, unknown> | undefined, cookie).catch(() => null);
    if (!resolved || resolved.playableStatus !== "playable" || !resolved.url) {
      continue;
    }

    return markReplacement(
      {
        ...candidate,
        playableStatus: "playable",
        audioUrl: resolved.url,
        rawMeta: {
          ...(candidate.rawMeta ?? {}),
          resolvedBySearch: true,
          resolvedBr: resolved.br,
          resolvedType: resolved.type,
        },
      },
      failedTrack,
    );
  }

  return null;
}

export async function resolvePlayableTracksWithNetease(
  tracks: MusicTrack[],
  client: ResolverClient,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const stats = createStats(tracks.length);
  const playableTracks: MusicTrack[] = [];
  const failedTracks: FailedTrack[] = [];
  let usedSearchFallback = false;
  let current = 0;
  let lastSongUrlRawShape = "empty";

  for (const track of tracks) {
    const resolved = await client
      .resolveSongUrl(track.id, track.rawMeta as Record<string, unknown> | undefined, options.cookie)
      .catch((error) => ({
        songId: track.id,
        playableStatus: "unknown" as const,
        reason: error instanceof Error ? error.message : "Unknown resolver error",
        raw: { error: error instanceof Error ? error.message : "unknown" },
      }));

    current += 1;
    lastSongUrlRawShape = shapeOfRaw(resolved.raw);
    options.onProgress?.({
      current,
      total: tracks.length,
      lastSongUrlRawShape,
    });

    if (resolved.playableStatus === "playable" && resolved.url) {
      stats.playable += 1;
      playableTracks.push(toPlayableTrack(track, resolved));
      continue;
    }

    const failedReason = toFailedReason(resolved.playableStatus, resolved.raw);
    bumpFailedStats(stats, failedReason);
    failedTracks.push({
      id: track.id,
      title: track.name,
      artist: track.artist,
      reason: failedReason,
      raw: resolved.raw,
    });
  }

  if (options.allowSearchFallback && tracks.length && (playableTracks.length === 0 || playableTracks.length < Math.min(3, tracks.length))) {
    const failedSourceTracks = tracks.filter((track) => !playableTracks.some((item) => item.id === track.id)).slice(0, 20);
    for (const track of failedSourceTracks) {
      const replacement = await trySearchFallback(track, client, options.cookie);
      if (!replacement) {
        continue;
      }

      usedSearchFallback = true;
      playableTracks.push(replacement);
      stats.playable += 1;
    }
  }

  return {
    playableTracks,
    failedTracks,
    stats,
    usedSearchFallback,
    progress: {
      current,
      total: tracks.length,
    },
    lastSongUrlRawShape,
  };
}
