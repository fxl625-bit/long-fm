import { mkdtempSync, readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildSongBrief } from "@/lib/dj/song-brief-service";
import type { Track } from "@/lib/radio/radio-types";

function makeTrack(): Track {
  return {
    id: "internal-3363281756",
    providerTrackId: "3363281756",
    neteaseId: "3363281756",
    title: "Goodbye Henry. (feat. Al Green)",
    artist: "RAYE / Al Green",
    album: "THIS MUSIC MAY CONTAIN HOPE.",
    audioUrl: "https://audio.example/3363281756.mp3",
    durationMs: 320434,
    sourceType: "netease",
    playableStatus: "playable",
    tags: {
      language: "English",
      energy: "medium",
      style: ["soul"],
      mood: ["city"],
      vocal: "mixed",
    },
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("buildSongBrief", () => {
  it("builds a cached SongBrief from source details and preserves concrete facts", async () => {
    const cacheRoot = mkdtempSync(join(tmpdir(), "song-brief-test-"));
    tempDirs.push(cacheRoot);

    const brief = await buildSongBrief(makeTrack(), {
      cacheRoot,
      neteaseDataSource: {
        getSongDetail: async () => ({
          title: "Goodbye Henry. (feat. Al Green)",
          artist: "RAYE / Al Green",
          album: "THIS MUSIC MAY CONTAIN HOPE.",
          releaseDate: "2024-02-02",
          releaseYear: "2024",
          aliases: ["Goodbye Henry"],
          artistId: "1086247",
          albumId: "188104245",
        }),
        getAlbumDetail: async () => ({
          name: "THIS MUSIC MAY CONTAIN HOPE.",
          releaseYear: "2024",
          description: "RAYE 的专辑条目，延续流行与灵魂乐的混合质地。",
          style: "pop / soul",
        }),
        getArtistDetail: async () => ({
          name: "RAYE",
          knownFor: "英国创作型歌手",
          style: "pop / soul",
          era: "2020s",
          shortBio: "近年以兼具流行写作和灵魂唱法受到关注。",
        }),
        getLyrics: async () => "Goodbye Henry\nI still hear the room move\nWhen Al Green comes in",
      },
      externalFactsProvider: {
        getFacts: async () => [],
      },
      curator: {
        curate: async (input) => ({
          ...input.baseBrief,
          releaseYear: "2024",
          sourceFacts: [
            ...input.baseBrief.sourceFacts,
            {
              type: "manual_cache",
              content: "这首歌收录在 THIS MUSIC MAY CONTAIN HOPE.，并以 RAYE / Al Green 的合作关系为可讲重点。",
              confidence: "high",
            },
          ],
          verifiedFacts: [
            ...input.baseBrief.verifiedFacts,
            "这首歌收录在 THIS MUSIC MAY CONTAIN HOPE.，并以 RAYE / Al Green 的合作关系为可讲重点。",
          ],
          uncertainFacts: input.baseBrief.uncertainFacts,
          lyricBrief: {
            language: "en",
            theme: "回望一段关系留下的余波",
            excerpt: "I still hear the room move",
          },
          lyricTheme: "回望一段关系留下的余波",
          lyricExcerpt: "I still hear the room move",
          talkAngles: [
            {
              angle: "artist_story",
              text: "RAYE 和 Al Green 的合作关系，本身就让这首歌带出新旧灵魂乐的对照。",
              confidence: "high",
            },
            {
              angle: "album_context",
              text: "它放在 THIS MUSIC MAY CONTAIN HOPE. 里，更像专辑中一段向复古灵魂乐借光的章节。",
              confidence: "medium",
            },
          ],
          safeToSay: [
            "RAYE / Al Green 的合作关系是这首歌最直接的入口。",
            "它挂着明显的复古灵魂乐影子。",
          ],
          avoidSaying: ["不要编造成具体录音轶事。"],
          factsInsufficient: false,
          sourceQuality: "rich",
        }),
      },
    });

    expect(brief.title).toBe("Goodbye Henry. (feat. Al Green)");
    expect(brief.artist).toBe("RAYE / Al Green");
    expect(brief.album).toBe("THIS MUSIC MAY CONTAIN HOPE.");
    expect(brief.releaseYear).toBe("2024");
    expect(brief.soundProfile.energy).toBe("medium");
    expect(brief.talkAngles.some((item) => item.angle === "artist_story")).toBe(true);
    expect(brief.safeToSay.join(" ")).toContain("合作关系");

    const cached = JSON.parse(readFileSync(join(cacheRoot, "data/song-brief-cache/3363281756.json"), "utf8")) as typeof brief;
    expect(cached.providerTrackId).toBe("3363281756");
    expect(cached.releaseYear).toBe("2024");
  });
});
