import { describe, expect, it } from "vitest";
import { extractSongUrl, resolvePlayableTracksWithNetease } from "@/lib/providers/netease/netease-playable-resolver";
import type { MusicTrack } from "@/lib/types/music";

function makeTrack(id: string, name: string, artist: string): MusicTrack {
  return {
    id,
    name,
    artist,
    duration: 180000,
    durationMs: 180000,
    sourceType: "NETEASE_EXPERIMENTAL",
    playableStatus: "unknown",
    rawMeta: {
      fee: 0,
    },
  };
}

describe("extractSongUrl", () => {
  it("supports multiple raw response shapes", () => {
    expect(extractSongUrl({ body: { data: [{ url: "https://a.example/test.mp3", br: 320000 }] } })).toEqual(
      expect.objectContaining({
        url: "https://a.example/test.mp3",
        br: 320000,
      }),
    );

    expect(extractSongUrl({ data: { data: [{ url: "https://b.example/test.mp3" }] } })).toEqual(
      expect.objectContaining({
        url: "https://b.example/test.mp3",
      }),
    );
  });
});

describe("resolvePlayableTracksWithNetease", () => {
  it("builds playable tracks and uses search fallback when originals have no direct url", async () => {
    const original = makeTrack("1", "Original Song", "Original Artist");
    const replacement = {
      ...makeTrack("2", "Replacement Song", "Replacement Artist"),
      audioUrl: "https://audio.example/replacement.mp3",
      playableStatus: "playable" as const,
    };

    const result = await resolvePlayableTracksWithNetease(
      [original],
      {
        resolveSongUrl: async (songId: string) =>
          songId === "1"
            ? {
                songId,
                playableStatus: "no_url",
                reason: "Song URL is missing",
              }
            : {
                songId,
                playableStatus: "playable",
                url: "https://audio.example/replacement.mp3",
                reason: "Playable URL resolved",
              },
        searchSongs: async () => [replacement],
      },
      {
        allowSearchFallback: true,
      },
    );

    expect(result.playableTracks).toHaveLength(1);
    expect(result.playableTracks[0]?.audioUrl).toBe("https://audio.example/replacement.mp3");
    expect(result.playableTracks[0]?.rawMeta).toEqual(
      expect.objectContaining({
        replacementSource: "search",
        replacementFor: "1",
      }),
    );
    expect(result.stats.playable).toBe(1);
    expect(result.stats.noUrl).toBe(1);
  });
});
