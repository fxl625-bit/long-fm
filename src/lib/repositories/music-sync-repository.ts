import { Prisma, ProviderType, type MusicSourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MusicProvider } from "@/lib/providers/music";
import type { MusicPlaylist, MusicTrack, PlaylistDetail } from "@/lib/types/music";

function toProviderType(providerName: string): ProviderType {
  switch (providerName) {
    case "netease_official":
      return ProviderType.NETEASE_OFFICIAL;
    case "netease_experimental":
      return ProviderType.NETEASE;
    case "local":
      return ProviderType.LOCAL;
    case "generic_api":
      return ProviderType.GENERIC_API;
    default:
      return ProviderType.MOCK;
  }
}

function toSourceType(track: MusicTrack): MusicSourceType {
  if (track.sourceType === "LX_MUSIC") {
    return "GENERIC_API";
  }

  if (
    track.sourceType === "NETEASE_OFFICIAL" ||
    track.sourceType === "LOCAL" ||
    track.sourceType === "DEMO" ||
    track.sourceType === "NETEASE_EXPERIMENTAL" ||
    track.sourceType === "GENERIC_API"
  ) {
    return track.sourceType;
  }
  return providerTypeToSourceFallback(track);
}

function providerTypeToSourceFallback(track: MusicTrack): MusicSourceType {
  if (track.externalUrl?.includes("music.163.com")) {
    return "NETEASE_EXPERIMENTAL";
  }
  if (track.localPath) {
    return "LOCAL";
  }
  return "DEMO";
}

function normalizeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as unknown as Prisma.InputJsonValue;
}

async function upsertTrack(providerType: ProviderType, track: MusicTrack) {
  return prisma.track.upsert({
    where: {
      source_providerTrackId: {
        source: providerType,
        providerTrackId: track.id,
      },
    },
    update: {
      sourceType: toSourceType(track),
      name: track.name,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      durationMs: track.durationMs ?? track.duration,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      externalUrl: track.externalUrl,
      localPath: track.localPath,
      playableStatus: track.playableStatus,
      language: track.language,
      era: track.era,
      moodTags: normalizeJson(track.moodTags),
      styleTags: normalizeJson(track.styleTags),
      energyLevel: track.energyLevel,
      lyrics: track.lyrics,
      rawMeta: normalizeJson(track.rawMeta),
    },
    create: {
      source: providerType,
      sourceType: toSourceType(track),
      providerTrackId: track.id,
      name: track.name,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      durationMs: track.durationMs ?? track.duration,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      externalUrl: track.externalUrl,
      localPath: track.localPath,
      playableStatus: track.playableStatus,
      language: track.language,
      era: track.era,
      moodTags: normalizeJson(track.moodTags),
      styleTags: normalizeJson(track.styleTags),
      energyLevel: track.energyLevel,
      lyrics: track.lyrics,
      rawMeta: normalizeJson(track.rawMeta),
    },
  });
}

async function upsertPlaylist(userId: string, providerType: ProviderType, playlist: MusicPlaylist) {
  return prisma.playlist.upsert({
    where: {
      userId_providerPlaylistId: {
        userId,
        providerPlaylistId: playlist.id,
      },
    },
    update: {
      source: providerType,
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl,
      isLikedPlaylist: Boolean(playlist.isLikedPlaylist),
    },
    create: {
      userId,
      source: providerType,
      providerPlaylistId: playlist.id,
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl,
      isLikedPlaylist: Boolean(playlist.isLikedPlaylist),
    },
  });
}

async function persistPlaylistDetail(userId: string, providerType: ProviderType, detail: PlaylistDetail) {
  const persistedPlaylist = await upsertPlaylist(userId, providerType, detail);
  await prisma.playlistTrack.deleteMany({ where: { playlistId: persistedPlaylist.id } });

  const seenTrackIds = new Set<string>();
  const uniqueTracks: MusicTrack[] = [];

  for (let index = 0; index < detail.tracks.length; index += 1) {
    const track = detail.tracks[index];
    if (seenTrackIds.has(track.id)) {
      continue;
    }
    seenTrackIds.add(track.id);
    uniqueTracks.push(track);
  }

  const dbTracks = [];
  const concurrency = 5;
  for (let index = 0; index < uniqueTracks.length; index += concurrency) {
    const chunk = uniqueTracks.slice(index, index + concurrency);
    const chunkTracks = await Promise.all(chunk.map((track) => upsertTrack(providerType, track)));
    dbTracks.push(...chunkTracks);
  }

  if (dbTracks.length) {
    await prisma.playlistTrack.createMany({
      data: dbTracks.map((track, index) => ({
        playlistId: persistedPlaylist.id,
        trackId: track.id,
        orderIndex: index,
      })),
    });
  }

  return {
    playlist: persistedPlaylist,
    trackCount: dbTracks.length,
    dedupedCount: Math.max(0, detail.tracks.length - dbTracks.length),
  };
}

export async function syncLibraryFromProvider(userId: string, provider: MusicProvider, userToken?: string) {
  const providerType = toProviderType(provider.providerName);

  const profile = await provider.getUserProfile(userToken);
  await prisma.user.update({
    where: { id: userId },
    data: {
      nickname: profile.nickname,
      avatar: profile.avatar,
      provider: providerType,
      providerUserId: profile.id,
    },
  });

  const playlists = await provider.getUserPlaylists(userToken);
  const likedSongs = await provider.getLikedSongs(userToken);

  const likedPlaylist =
    playlists.find((item) => item.isLikedPlaylist) ??
    ({
      id: `liked-${providerType.toLowerCase()}`,
      name: "我喜欢的音乐",
      isLikedPlaylist: true,
      trackCount: likedSongs.length,
    } satisfies MusicPlaylist);

  const persistedLikedPlaylist = await upsertPlaylist(userId, providerType, likedPlaylist);

  await prisma.playlistTrack.deleteMany({ where: { playlistId: persistedLikedPlaylist.id } });

  for (let index = 0; index < likedSongs.length; index += 1) {
    const dbTrack = await upsertTrack(providerType, likedSongs[index]);
    await prisma.playlistTrack.create({
      data: {
        playlistId: persistedLikedPlaylist.id,
        trackId: dbTrack.id,
        orderIndex: index,
      },
    });
  }

  const topPlaylists = playlists.filter((item) => !item.isLikedPlaylist).slice(0, 4);
  for (const playlist of topPlaylists) {
    try {
      const detail = await provider.getPlaylistDetail(playlist.id, userToken);
      await persistPlaylistDetail(userId, providerType, detail);
    } catch {
      // Skip single playlist failures to keep overall sync available.
    }
  }

  return {
    playlistCount: playlists.length,
    likedSongCount: likedSongs.length,
  };
}

export async function syncPlaylistByIdFromProvider(
  userId: string,
  provider: MusicProvider,
  playlistId: string,
  userToken?: string,
) {
  const providerType = toProviderType(provider.providerName);
  const detail = await provider.getPlaylistDetail(playlistId, userToken);
  const persisted = await persistPlaylistDetail(userId, providerType, detail);

  return {
    playlistId: persisted.playlist.id,
    providerPlaylistId: detail.id,
    name: detail.name,
    trackCount: persisted.trackCount,
    dedupedCount: persisted.dedupedCount,
    provider: provider.providerName,
  };
}

export async function fetchUserTracksFromDb(userId: string) {
  return prisma.track.findMany({
    where: {
      playlists: {
        some: {
          playlist: {
            userId,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function fetchUserPlaylistsFromDb(userId: string) {
  return prisma.playlist.findMany({
    where: { userId },
    include: {
      tracks: {
        include: {
          track: true,
        },
        orderBy: {
          orderIndex: "asc",
        },
      },
    },
    orderBy: [{ isLikedPlaylist: "desc" }, { updatedAt: "desc" }],
  });
}
