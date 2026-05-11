import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import type { Track } from "./radio-types";

const SUPPORTED_PUBLIC_AUDIO_EXT = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]);

function parseArtistAndTitle(fileName: string) {
  const baseName = parse(fileName).name.trim();
  const [artist, title] = baseName.includes(" - ") ? baseName.split(" - ", 2) : ["Local Radio", baseName];
  return {
    artist: artist.trim() || "Local Radio",
    title: title.trim() || baseName,
  };
}

function publicAudioUrl(fileName: string) {
  return `/audio/${encodeURIComponent(fileName).replace(/%2F/gi, "/")}`;
}

export async function scanPublicAudioTracks(audioDir: string): Promise<Track[]> {
  const entries = (await readdir(audioDir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name));
  const tracks: Track[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_PUBLIC_AUDIO_EXT.has(ext)) {
      continue;
    }

    const { artist, title } = parseArtistAndTitle(entry.name);
    const id = createHash("md5").update(join(audioDir, entry.name)).digest("hex").slice(0, 16);

    tracks.push({
      id: `public-${id}`,
      providerTrackId: entry.name,
      title,
      artist,
      album: "Public Audio",
      audioUrl: publicAudioUrl(entry.name),
      durationMs: 0,
      sourceType: "public",
      playableStatus: "playable",
      tags: {
        mood: ["本地", "电台"],
        style: ["Public Audio"],
        language: undefined,
        energy: "medium",
      },
    });
  }

  return tracks;
}
