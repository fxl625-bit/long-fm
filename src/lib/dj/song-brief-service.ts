import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readServerEnvVar } from "@/lib/config/server-env";
import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import { getQueuePatchTrackId } from "./queue-selector";
import { inferTrackSoundHints } from "./sound-hints";
import { LLMSongBriefCurator } from "./llm-song-brief-curator";
import { NullExternalMusicFactsProvider, type ExternalMusicFact, type ExternalMusicFactsProvider } from "./external-music-facts";
import type { Track } from "@/lib/radio/radio-types";

export type SongBrief = {
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  releaseDate?: string;
  releaseYear?: string;
  aliases?: string[];
  verifiedFacts: string[];
  uncertainFacts: string[];
  sourceFacts: {
    type:
      | "netease_song_detail"
      | "netease_album"
      | "netease_artist"
      | "netease_lyric"
      | "musicbrainz"
      | "wikipedia"
      | "manual_cache";
    content: string;
    confidence: "high" | "medium" | "low";
  }[];
  lyricBrief?: {
    language?: string;
    theme?: string;
    excerpt?: string;
  };
  artistBrief?: {
    name: string;
    knownFor?: string;
    style?: string;
    era?: string;
    shortBio?: string;
  };
  albumBrief?: {
    name: string;
    releaseYear?: string;
    description?: string;
    style?: string;
  };
  soundProfile: {
    vocal?: string;
    rhythm?: string;
    instruments?: string[];
    mood?: string[];
    energy?: "low" | "medium" | "high";
    texture?: string[];
  };
  lyricTheme?: string;
  lyricExcerpt?: string;
  sourceQuality?: "rich" | "partial" | "thin";
  talkAngles: {
    angle:
      | "song_background"
      | "artist_story"
      | "album_context"
      | "lyric_theme"
      | "sound_detail"
      | "era_memory"
      | "transition";
    text: string;
    confidence: "high" | "medium" | "low";
  }[];
  safeToSay: string[];
  avoidSaying: string[];
  factsInsufficient: boolean;
};

type SongDetailData = {
  title?: string;
  artist?: string;
  album?: string;
  releaseDate?: string;
  releaseYear?: string;
  aliases?: string[];
  artistId?: string;
  albumId?: string;
  durationMs?: number;
};

type AlbumDetailData = {
  name?: string;
  releaseYear?: string;
  description?: string;
  style?: string;
};

type ArtistDetailData = {
  name?: string;
  knownFor?: string;
  style?: string;
  era?: string;
  shortBio?: string;
};

export type SongBriefDataSource = {
  getSongDetail(track: Track): Promise<SongDetailData | null>;
  getAlbumDetail(track: Track, albumId?: string): Promise<AlbumDetailData | null>;
  getArtistDetail(track: Track, artistId?: string): Promise<ArtistDetailData | null>;
  getLyrics(track: Track): Promise<string | null>;
};

type SongBriefCurator = {
  curate(input: {
    track: Track;
    baseBrief: SongBrief;
    songDetail: SongDetailData | null;
    albumDetail: AlbumDetailData | null;
    artistDetail: ArtistDetailData | null;
    lyric: string | null;
    externalFacts: ExternalMusicFact[];
  }): Promise<SongBrief>;
};

type BuildSongBriefOptions = {
  cacheRoot?: string;
  neteaseDataSource?: SongBriefDataSource;
  externalFactsProvider?: ExternalMusicFactsProvider;
  curator?: SongBriefCurator;
};

function ensureArray(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function releaseYearFromDate(value?: string) {
  return value?.slice(0, 4);
}

function trimExcerpt(value?: string | null, maxLength = 96) {
  const text = (value ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function inferLyricTheme(lyric?: string | null) {
  const text = (lyric ?? "").toLowerCase();
  if (!text) return undefined;
  if (/(love|heart|kiss|goodbye|miss|leave)/.test(text)) return "关系与离开";
  if (/(night|dark|room|light|city|road)/.test(text)) return "夜色与空间感";
  if (/(dream|memory|yesterday|back)/.test(text)) return "回望与记忆";
  return "情绪与自述";
}

function inferLyricLanguage(lyric?: string | null) {
  if (!lyric) return undefined;
  if (/[\u4e00-\u9fff]/.test(lyric)) return "zh";
  if (/[A-Za-z]/.test(lyric)) return "en";
  return undefined;
}

function deriveSoundProfile(track: Track, hints: string[]): SongBrief["soundProfile"] {
  const text = `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase();
  return {
    vocal:
      track.tags?.vocal === "instrumental"
        ? "以器乐为主"
        : /al green|adele|raye/.test(text)
          ? "人声在前"
          : track.tags?.vocal === "male"
            ? "男声主导"
            : track.tags?.vocal === "female"
              ? "女声主导"
              : "人声与器乐并行",
    rhythm:
      track.tags?.energy === "high"
        ? "鼓点更明显"
        : track.tags?.energy === "low"
          ? "节奏收得更稳"
          : "节奏保持回摆",
    instruments: hints.filter((hint) => /(钢琴|吉他|鼓点|低频|合成器|器乐|贝斯)/.test(hint)),
    mood: hints.filter((hint) => /(复古|沉|亮|松弛|画面|东方|灵魂|夜)/.test(hint)),
    energy: track.tags?.energy ?? "medium",
    texture: hints.filter((hint) => /(人声|留白|层次|咬字|旋律|声场)/.test(hint)),
  };
}

function localTalkAngles(input: {
  track: Track;
  songDetail: SongDetailData | null;
  albumDetail: AlbumDetailData | null;
  artistDetail: ArtistDetailData | null;
  lyric: string | null;
  soundHints: string[];
}): SongBrief["talkAngles"] {
  const angles: SongBrief["talkAngles"] = [];
  const releaseYear = input.songDetail?.releaseYear ?? input.albumDetail?.releaseYear;

  if (input.artistDetail?.shortBio || input.artistDetail?.knownFor) {
    angles.push({
      angle: "artist_story",
      text: `${input.artistDetail.name ?? input.track.artist} ${input.artistDetail.shortBio ?? input.artistDetail.knownFor}`.trim(),
      confidence: "medium",
    });
  }

  if (input.albumDetail?.description || input.track.album) {
    angles.push({
      angle: "album_context",
      text: input.albumDetail?.description
        ? `${input.track.title} 放在《${input.track.album ?? input.albumDetail.name ?? input.track.title}》里，${input.albumDetail.description}`
        : `${input.track.title} 收在《${input.track.album}》里。`,
      confidence: input.albumDetail?.description ? "high" : "medium",
    });
  }

  if (releaseYear) {
    angles.push({
      angle: "song_background",
      text: `${input.track.title} 的发行年份是 ${releaseYear}。`,
      confidence: "high",
    });
  }

  if (input.lyric) {
    angles.push({
      angle: "lyric_theme",
      text: `歌词里更明显的主题是${inferLyricTheme(input.lyric) ?? "情绪与自述"}。`,
      confidence: "medium",
    });
  }

  angles.push({
    angle: "sound_detail",
    text: `${input.track.title} 这一段更像${input.soundHints.slice(0, 2).join("、")}。`,
    confidence: "medium",
  });

  return angles.slice(0, 6);
}

function safeToSayFromBrief(brief: SongBrief) {
  return ensureArray([
    ...brief.talkAngles.filter((angle) => angle.confidence !== "low").map((angle) => angle.text),
    brief.artistBrief?.knownFor,
    brief.artistBrief?.shortBio,
    brief.albumBrief?.description,
    brief.lyricBrief?.theme ? `歌词更像在写${brief.lyricBrief.theme}。` : undefined,
  ]).slice(0, 8);
}

function avoidSayingFromBrief(brief: SongBrief) {
  const avoid = [
    "不要编造成具体录音现场或采访内容。",
    brief.factsInsufficient ? "资料不足时，不要编造发行背景。" : "",
  ];
  return ensureArray(avoid);
}

function createBaseBrief(track: Track): SongBrief {
  const hints = inferTrackSoundHints(track);
  return {
    providerTrackId: getQueuePatchTrackId(track),
    title: track.title,
    artist: track.artist,
    album: track.album,
    verifiedFacts: [],
    uncertainFacts: [],
    sourceFacts: [],
    soundProfile: deriveSoundProfile(track, hints),
    talkAngles: [],
    safeToSay: [],
    avoidSaying: [],
    factsInsufficient: true,
  };
}

function parseSongDetailRaw(song: Record<string, unknown>): SongDetailData {
  const album = typeof song.al === "object" && song.al ? (song.al as Record<string, unknown>) : {};
  const artists = Array.isArray(song.ar) ? (song.ar as Array<Record<string, unknown>>) : [];
  const publishTime = typeof album.publishTime === "number" ? new Date(album.publishTime).toISOString().slice(0, 10) : undefined;
  return {
    title: typeof song.name === "string" ? song.name : undefined,
    artist: artists.map((item) => item.name).filter(Boolean).join(" / "),
    album: typeof album.name === "string" ? album.name : undefined,
    releaseDate: publishTime,
    releaseYear: releaseYearFromDate(publishTime),
    aliases: Array.isArray(song.alia) ? (song.alia as string[]) : [],
    artistId: artists[0]?.id ? String(artists[0].id) : undefined,
    albumId: album.id ? String(album.id) : undefined,
    durationMs: typeof song.dt === "number" ? song.dt : undefined,
  };
}

function parseAlbumDetailRaw(payload: Record<string, unknown>): AlbumDetailData | null {
  const album = typeof payload.album === "object" && payload.album ? (payload.album as Record<string, unknown>) : payload;
  if (!album || !Object.keys(album).length) return null;
  const releaseDate = typeof album.publishTime === "number" ? new Date(album.publishTime).toISOString().slice(0, 10) : undefined;
  return {
    name: typeof album.name === "string" ? album.name : undefined,
    releaseYear: releaseYearFromDate(releaseDate),
    description: typeof album.description === "string" ? trimExcerpt(album.description, 120) : undefined,
    style: Array.isArray(album.tags) ? (album.tags as string[]).join(" / ") : undefined,
  };
}

function parseArtistDetailRaw(payload: Record<string, unknown>): ArtistDetailData | null {
  const data = typeof payload.data === "object" && payload.data ? (payload.data as Record<string, unknown>) : payload;
  const artist = typeof data.artist === "object" && data.artist ? (data.artist as Record<string, unknown>) : data;
  const profile = typeof data.user === "object" && data.user ? (data.user as Record<string, unknown>) : data;
  const bio = typeof data.briefDesc === "string" ? data.briefDesc : typeof artist.briefDesc === "string" ? artist.briefDesc : undefined;
  if (!artist || !Object.keys(artist).length) return null;
  return {
    name: typeof artist.name === "string" ? artist.name : undefined,
    knownFor: typeof profile.signature === "string" ? trimExcerpt(profile.signature, 88) : undefined,
    style: typeof artist.musicSize === "number" ? `作品数 ${artist.musicSize}` : undefined,
    era: undefined,
    shortBio: bio ? trimExcerpt(bio, 120) : undefined,
  };
}

async function fetchNeteaseJson<T extends Record<string, unknown>>(path: string, query: Record<string, string | undefined>) {
  const baseUrl = readServerEnvVar("NETEASE_API_BASE_URL") ?? "http://127.0.0.1:3000";
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`NetEase request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function createDefaultNeteaseDataSource(): SongBriefDataSource {
  return {
    getSongDetail: async (track) => {
      const id = track.neteaseId ?? track.providerTrackId;
      if (!id) return null;
      try {
        const payload = await fetchNeteaseJson<{ songs?: Array<Record<string, unknown>> }>("/song/detail", { ids: id });
        const song = payload.songs?.[0];
        return song ? parseSongDetailRaw(song) : null;
      } catch {
        return null;
      }
    },
    getAlbumDetail: async (track, albumId) => {
      if (!albumId) return null;
      try {
        const payload = await fetchNeteaseJson<Record<string, unknown>>("/album", { id: albumId });
        return parseAlbumDetailRaw(payload);
      } catch {
        return null;
      }
    },
    getArtistDetail: async (track, artistId) => {
      if (!artistId) return null;
      try {
        const payload = await fetchNeteaseJson<Record<string, unknown>>("/artist/detail", { id: artistId });
        return parseArtistDetailRaw(payload);
      } catch {
        return null;
      }
    },
    getLyrics: async (track) => {
      const id = track.neteaseId ?? track.providerTrackId;
      if (!id) return null;
      try {
        const payload = await fetchNeteaseJson<{ lrc?: { lyric?: string } }>("/lyric", { id });
        return payload.lrc?.lyric ?? null;
      } catch {
        return null;
      }
    },
  };
}

export function getSongBriefCachePath(providerTrackId: string, cacheRoot = process.cwd()) {
  return resolve(cacheRoot, "data/song-brief-cache", `${providerTrackId}.json`);
}

export async function buildSongBrief(track: Track, options: BuildSongBriefOptions = {}): Promise<SongBrief> {
  const providerTrackId = getQueuePatchTrackId(track);
  const cachePath = getSongBriefCachePath(providerTrackId, options.cacheRoot);

  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf8")) as SongBrief;
  }

  const dataSource = options.neteaseDataSource ?? createDefaultNeteaseDataSource();
  const externalFactsProvider = options.externalFactsProvider ?? new NullExternalMusicFactsProvider();
  const curator = options.curator ?? new LLMSongBriefCurator({ deepseekClient: new DeepSeekClient() });

  const baseBrief = createBaseBrief(track);
  const songDetail = await dataSource.getSongDetail(track);
  const albumDetail = await dataSource.getAlbumDetail(track, songDetail?.albumId);
  const artistDetail = await dataSource.getArtistDetail(track, songDetail?.artistId);
  const lyric = await dataSource.getLyrics(track);
  const externalFacts = await externalFactsProvider.getFacts({
    providerTrackId,
    title: track.title,
    artist: track.artist,
    album: track.album,
  });

  const localBrief: SongBrief = {
    ...baseBrief,
    title: songDetail?.title ?? track.title,
    artist: songDetail?.artist ?? track.artist,
    album: songDetail?.album ?? track.album,
    releaseDate: songDetail?.releaseDate,
    releaseYear: songDetail?.releaseYear ?? albumDetail?.releaseYear,
    aliases: songDetail?.aliases ?? [],
    sourceFacts: ensureArray([
      songDetail?.releaseDate ? `${songDetail.title ?? track.title} 的发布时间记录为 ${songDetail.releaseDate}。` : undefined,
      albumDetail?.description ? `专辑资料：${albumDetail.description}` : undefined,
      artistDetail?.shortBio ? `歌手资料：${artistDetail.shortBio}` : undefined,
      lyric ? `歌词摘要：${trimExcerpt(lyric, 88)}` : undefined,
      ...externalFacts.map((fact) => fact.content),
    ]).map((content) => ({
      type: content.startsWith("专辑资料")
        ? "netease_album"
        : content.startsWith("歌手资料")
          ? "netease_artist"
          : content.startsWith("歌词摘要")
            ? "netease_lyric"
            : content.includes("发布时间")
              ? "netease_song_detail"
              : (externalFacts.find((fact) => fact.content === content)?.type ?? "manual_cache"),
      content,
      confidence: externalFacts.find((fact) => fact.content === content)?.confidence ?? (content.includes("发布时间") ? "high" : "medium"),
    })),
    lyricBrief: lyric
      ? {
          language: inferLyricLanguage(lyric),
          theme: inferLyricTheme(lyric),
          excerpt: trimExcerpt(lyric, 64),
        }
      : undefined,
    lyricTheme: lyric ? inferLyricTheme(lyric) : undefined,
    lyricExcerpt: lyric ? trimExcerpt(lyric, 64) : undefined,
    artistBrief: artistDetail?.name
      ? {
          name: artistDetail.name,
          knownFor: artistDetail.knownFor,
          style: artistDetail.style,
          era: artistDetail.era,
          shortBio: artistDetail.shortBio,
        }
      : undefined,
    albumBrief: albumDetail?.name || songDetail?.album
      ? {
          name: albumDetail?.name ?? songDetail?.album ?? track.album ?? "",
          releaseYear: albumDetail?.releaseYear ?? songDetail?.releaseYear,
          description: albumDetail?.description,
          style: albumDetail?.style,
        }
      : undefined,
    verifiedFacts: ensureArray([
      songDetail?.releaseDate ? `${songDetail.title ?? track.title} 的发布时间记录为 ${songDetail.releaseDate}。` : undefined,
      albumDetail?.description ? `${songDetail?.album ?? track.album ?? "这张专辑"}：${albumDetail.description}` : undefined,
      artistDetail?.shortBio ? `${artistDetail.name ?? track.artist}：${artistDetail.shortBio}` : undefined,
      lyric ? `歌词主题更接近${inferLyricTheme(lyric) ?? "情绪与自述"}。` : undefined,
      ...externalFacts.filter((fact) => fact.confidence !== "low").map((fact) => fact.content),
    ]),
    uncertainFacts: ensureArray([
      ...externalFacts.filter((fact) => fact.confidence === "low").map((fact) => fact.content),
      songDetail?.aliases?.length ? `${songDetail.title ?? track.title} 还有别名：${songDetail.aliases.join(" / ")}。` : undefined,
    ]),
    talkAngles: localTalkAngles({
      track,
      songDetail,
      albumDetail,
      artistDetail,
      lyric,
      soundHints: inferTrackSoundHints(track),
    }),
    factsInsufficient: !(songDetail?.releaseDate || albumDetail?.description || artistDetail?.shortBio || lyric),
    sourceQuality:
      songDetail?.releaseDate && (albumDetail?.description || artistDetail?.shortBio || lyric)
        ? "rich"
        : songDetail?.releaseDate || albumDetail?.description || artistDetail?.shortBio || lyric
          ? "partial"
          : "thin",
  };

  localBrief.safeToSay = safeToSayFromBrief(localBrief);
  localBrief.avoidSaying = avoidSayingFromBrief(localBrief);

  const curatedBrief = await curator
    .curate({
      track,
      baseBrief: localBrief,
      songDetail,
      albumDetail,
      artistDetail,
      lyric,
      externalFacts,
    })
    .catch(() => localBrief);

  const finalBrief: SongBrief = {
    ...localBrief,
    ...curatedBrief,
    providerTrackId,
    sourceFacts: curatedBrief.sourceFacts?.length ? curatedBrief.sourceFacts : localBrief.sourceFacts,
    talkAngles: curatedBrief.talkAngles?.length ? curatedBrief.talkAngles : localBrief.talkAngles,
    soundProfile: {
      ...localBrief.soundProfile,
      ...curatedBrief.soundProfile,
    },
    safeToSay: curatedBrief.safeToSay?.length ? curatedBrief.safeToSay : safeToSayFromBrief(curatedBrief),
    avoidSaying: curatedBrief.avoidSaying?.length ? curatedBrief.avoidSaying : avoidSayingFromBrief(curatedBrief),
    verifiedFacts: curatedBrief.verifiedFacts?.length ? curatedBrief.verifiedFacts : localBrief.verifiedFacts,
    uncertainFacts: curatedBrief.uncertainFacts?.length ? curatedBrief.uncertainFacts : localBrief.uncertainFacts,
    lyricTheme: curatedBrief.lyricTheme ?? localBrief.lyricTheme,
    lyricExcerpt: curatedBrief.lyricExcerpt ?? localBrief.lyricExcerpt,
    factsInsufficient:
      typeof curatedBrief.factsInsufficient === "boolean"
        ? curatedBrief.factsInsufficient
        : localBrief.factsInsufficient,
    sourceQuality: curatedBrief.sourceQuality ?? localBrief.sourceQuality,
  };

  mkdirSync(join(resolve(options.cacheRoot ?? process.cwd()), "data/song-brief-cache"), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(finalBrief, null, 2), "utf8");

  return finalBrief;
}
