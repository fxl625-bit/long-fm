import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import type { MusicPlaylist, MusicTrack, PlaylistDetail } from "@/lib/types/music";
import type { MusicProvider, MusicProviderHealth, MusicProviderLoginInput, MusicProviderLoginResult } from "./types";

const SUPPORTED_AUDIO_EXT = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]);

type LocalFileTrack = {
  id: string;
  path: string;
  name: string;
};

async function walkAudioFiles(rootDir: string): Promise<string[]> {
  if (!rootDir) {
    throw new Error("LOCAL_AUDIO_DIR is not configured");
  }

  const result: string[] = [];
  const queue = [rootDir];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (SUPPORTED_AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

export class LocalAudioProvider implements MusicProvider {
  readonly providerName = "local" as const;

  constructor(private readonly audioDir: string) {}

  async healthcheck(): Promise<MusicProviderHealth> {
    try {
      const files = await walkAudioFiles(this.audioDir);
      if (!files.length) {
        return {
          mode: this.providerName,
          available: false,
          status: "unavailable",
          message: "Local folder is readable but no audio files were found.",
        };
      }

      return {
        mode: this.providerName,
        available: true,
        status: "available",
        message: `Detected ${files.length} local audio files.`,
      };
    } catch (error) {
      return {
        mode: this.providerName,
        available: false,
        status: "unavailable",
        message: error instanceof Error ? error.message : "Local folder is not accessible.",
      };
    }
  }

  async login(input: MusicProviderLoginInput): Promise<MusicProviderLoginResult> {
    void input;
    return { ok: true, message: "Local provider does not require login." };
  }

  async getUserProfile() {
    return {
      id: "local-user",
      nickname: "本地音乐用户",
      avatar: undefined,
    };
  }

  async getUserPlaylists(): Promise<MusicPlaylist[]> {
    const tracks = await this.getLikedSongs();
    return [
      {
        id: "local-liked",
        name: "本地收藏",
        description: "来自本地目录的可播放音频",
        isLikedPlaylist: true,
        trackCount: tracks.length,
      },
    ];
  }

  async getPlaylistDetail(playlistId: string): Promise<PlaylistDetail> {
    if (playlistId !== "local-liked") {
      throw new Error(`Local playlist not found: ${playlistId}`);
    }

    const tracks = await this.getLikedSongs();
    return {
      id: "local-liked",
      name: "本地收藏",
      description: "来自本地目录的可播放音频",
      isLikedPlaylist: true,
      trackCount: tracks.length,
      tracks,
    };
  }

  async getLikedSongs(): Promise<MusicTrack[]> {
    const files = await walkAudioFiles(this.audioDir);
    const mapped: LocalFileTrack[] = files.map((filePath) => {
      const id = createHash("md5").update(filePath).digest("hex").slice(0, 16);
      return {
        id: `local-${id}`,
        path: filePath,
        name: parse(filePath).name,
      };
    });

    return mapped.map((item, index) => {
      const [artist, title] = item.name.includes(" - ") ? item.name.split(" - ", 2) : ["本地音频", item.name];
      return {
        id: item.id,
        name: title || item.name,
        artist: artist || "本地音频",
        album: "Local Library",
        duration: 0,
        durationMs: 0,
        coverUrl: undefined,
        audioUrl: `/api/audio/local/${encodeURIComponent(item.id)}`,
        externalUrl: undefined,
        localPath: item.path,
        sourceType: "LOCAL",
        playableStatus: "playable",
        language: undefined,
        era: "local",
        moodTags: index % 2 ? ["本地", "收藏"] : ["本地", "常听"],
        styleTags: ["Local Audio"],
        energyLevel: "medium",
        rawMeta: {
          localPath: item.path,
        },
      } satisfies MusicTrack;
    });
  }

  async searchSongs(query: string): Promise<MusicTrack[]> {
    const tracks = await this.getLikedSongs();
    const normalized = query.toLowerCase().trim();
    return tracks.filter((track) => `${track.name} ${track.artist}`.toLowerCase().includes(normalized));
  }

  async getSongDetail(songId: string): Promise<MusicTrack | null> {
    const tracks = await this.getLikedSongs();
    return tracks.find((track) => track.id === songId) ?? null;
  }

  async getLyrics(songId: string): Promise<string | null> {
    void songId;
    return null;
  }

  async getSongUrl(songId: string): Promise<string | null> {
    const track = await this.getSongDetail(songId);
    return track?.audioUrl ?? null;
  }

  async createPlaylist(name: string): Promise<{ id: string; name: string }> {
    return {
      id: "local-liked",
      name,
    };
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    void playlistId;
    void trackIds;
    return { success: true };
  }
}
