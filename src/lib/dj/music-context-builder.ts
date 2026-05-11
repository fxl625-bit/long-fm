import { inferTrackSoundHints } from "./sound-hints";
import type { DJDirectorContext } from "./dj-types";

export type MusicContext = {
  currentSong: {
    title: string;
    artist: string;
    album?: string;
    durationMs?: number;
    lyricExcerpt?: string;
    aliases?: string[];
    knownInfo?: string[];
    soundHints: string[];
  };
  previousSong?: {
    title: string;
    artist: string;
    album?: string;
    soundHints: string[];
  };
  nextSong?: {
    title: string;
    artist: string;
    album?: string;
    transitionAngle?: string;
    soundHints: string[];
  };
  transition: {
    from: string;
    to: string;
    why: string;
  };
  recentFlow: {
    summary: string;
    repeatedArtist?: string;
    energyTrend?: "rising" | "falling" | "flat";
    languageMix?: string;
  };
  userTaste: {
    summary: string;
    likelyReasonThisFits: string;
  };
};

function energyValue(value?: "low" | "medium" | "high") {
  if (value === "low") return 1;
  if (value === "high") return 3;
  return 2;
}

function inferEnergyTrend(context: DJDirectorContext): MusicContext["recentFlow"]["energyTrend"] {
  const recent = context.recentTracks.slice(-3);
  if (recent.length < 2) {
    return "flat";
  }
  const first = energyValue(recent[0]?.tags?.energy);
  const last = energyValue(recent[recent.length - 1]?.tags?.energy);
  if (last > first) return "rising";
  if (last < first) return "falling";
  return "flat";
}

function inferLanguageMix(context: DJDirectorContext) {
  const languages = [...context.recentTracks, ...context.upcomingTracks.slice(0, 2)]
    .map((track) => track.tags?.language)
    .filter(Boolean);
  if (!languages.length) {
    return "mixed";
  }
  return Array.from(new Set(languages)).join(" / ");
}

function repeatedArtist(context: DJDirectorContext) {
  const artists = context.recentTracks.slice(-3).map((track) => track.artist);
  return artists.length >= 2 && artists[artists.length - 1] === artists[artists.length - 2] ? artists[artists.length - 1] : undefined;
}

function describeTransition(context: DJDirectorContext) {
  const currentHints = inferTrackSoundHints(context.currentTrack);
  const nextHints = inferTrackSoundHints(context.nextTrack);
  const currentLead = currentHints[0] ?? "当前这首的声线";
  const nextLead = nextHints[0] ?? "下一首的旋律";
  const why =
    energyValue(context.nextTrack?.tags?.energy) > energyValue(context.currentTrack.tags?.energy)
      ? "从更收的段落抬到更亮的推进。"
      : energyValue(context.nextTrack?.tags?.energy) < energyValue(context.currentTrack.tags?.energy)
        ? "从较满的情绪收回到更松的空间。"
        : "保持连贯，但把颜色换一层。";

  return {
    from: `${context.currentTrack.artist} 的${currentLead}`,
    to: context.nextTrack ? `${context.nextTrack.artist} 的${nextLead}` : "后面更轻一点的声线",
    why,
  };
}

export function buildMusicContext(context: DJDirectorContext): MusicContext {
  const currentTrack = context.currentTrack;
  const previousTrack = context.recentTracks.at(-1);
  const nextTrack = context.nextTrack;
  const currentHints = inferTrackSoundHints(currentTrack);
  const previousHints = inferTrackSoundHints(previousTrack);
  const nextHints = inferTrackSoundHints(nextTrack);
  const energyTrend = inferEnergyTrend(context);
  const userMemorySummary = typeof context.userMemory?.summary === "string" ? context.userMemory.summary : "";
  const topArtists = Array.isArray(context.userMemory?.topArtists) ? context.userMemory.topArtists : [];

  return {
    currentSong: {
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      durationMs: currentTrack.durationMs,
      knownInfo: [
        currentTrack.tags?.style?.[0] ? `style:${currentTrack.tags.style[0]}` : "",
        currentTrack.tags?.energy ? `energy:${currentTrack.tags.energy}` : "",
        currentTrack.tags?.language ? `language:${currentTrack.tags.language}` : "",
      ].filter(Boolean),
      soundHints: currentHints,
    },
    previousSong: previousTrack
      ? {
          title: previousTrack.title,
          artist: previousTrack.artist,
          album: previousTrack.album,
          soundHints: previousHints,
        }
      : undefined,
    nextSong: nextTrack
      ? {
          title: nextTrack.title,
          artist: nextTrack.artist,
          album: nextTrack.album,
          soundHints: nextHints,
          transitionAngle: describeTransition(context).why,
        }
      : undefined,
    transition: describeTransition(context),
    recentFlow: {
      summary: `最近这一段以 ${context.recentTracks.slice(-2).map((track) => track.title).join(" / ") || currentTrack.title} 为主，正在${
        energyTrend === "rising" ? "往前推" : energyTrend === "falling" ? "慢慢收" : "平稳滑行"
      }。`,
      repeatedArtist: repeatedArtist(context),
      energyTrend,
      languageMix: inferLanguageMix(context),
    },
    userTaste: {
      summary: userMemorySummary || "这档频道先用熟悉的声音接住你，再慢慢把颜色打开。",
      likelyReasonThisFits: topArtists.includes(currentTrack.artist)
        ? "这首和用户熟悉的歌手重合度高，适合做稳定入口。"
        : "这首的声音细节和最近流向接得上，适合放在当前时段。",
    },
  };
}
