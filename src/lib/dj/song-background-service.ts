import { buildSongBrief } from "./song-brief-service";
import type { Track } from "@/lib/radio/radio-types";

export type SongTalkContext = {
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  aliases?: string[];
  releaseInfo?: string;
  lyricExcerpt?: string;
  albumContext?: string;
  artistContext?: string;
  soundNotes?: string[];
  safeTalkAngles: string[];
};

function buildSafeTalkAngles(track: Track, soundNotes: string[]) {
  const angles = [
    `${track.artist} 的《${track.title}》适合拿来做这一段的入口。`,
    track.album ? `《${track.album}》的质感让这首更容易挂住空气。` : "",
    ...soundNotes.map((note) => `${track.title} 这一段更像 ${note}。`),
  ].filter(Boolean);

  return Array.from(new Set(angles)).slice(0, 5);
}

export async function buildSongTalkContext(track: Track): Promise<SongTalkContext> {
  const brief = await buildSongBrief(track);
  const soundNotes = [
    brief.soundProfile.vocal,
    brief.soundProfile.rhythm,
    ...(brief.soundProfile.instruments ?? []),
    ...(brief.soundProfile.texture ?? []),
    ...(brief.soundProfile.mood ?? []),
  ].filter(Boolean) as string[];

  return {
    providerTrackId: brief.providerTrackId,
    title: brief.title,
    artist: brief.artist,
    album: brief.album,
    aliases: brief.aliases ?? [],
    releaseInfo: brief.releaseYear ?? brief.releaseDate,
    lyricExcerpt: brief.lyricBrief?.excerpt,
    albumContext: brief.albumBrief?.description,
    artistContext: brief.artistBrief?.shortBio ?? brief.artistBrief?.knownFor,
    soundNotes,
    safeTalkAngles: brief.safeToSay.length ? brief.safeToSay : buildSafeTalkAngles(track, soundNotes),
  };
}
