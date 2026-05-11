import { describe, expect, it } from "vitest";
import { NeteasePlayableService } from "@/lib/providers/netease/netease-playable-service";

describe("NeteasePlayableService", () => {
  it("builds a playable queue from tracks that resolve real audio urls", async () => {
    const service = new NeteasePlayableService({
      cookieResolver: async () => "MUSIC_U=test-cookie",
      trackLoader: async () => ({
        playlistId: "95204435",
        playlistName: "我喜欢的音乐",
        tracks: [
          {
            id: "1",
            neteaseId: "1",
            name: "Goodbye Henry. (feat. Al Green)",
            artist: "RAYE / Al Green",
            album: "THIS MUSIC MAY CONTAIN HOPE.",
            duration: 320434,
            durationMs: 320434,
            coverUrl: "https://example.com/cover-1.jpg",
            sourceType: "NETEASE_EXPERIMENTAL",
            playableStatus: "unknown",
          },
          {
            id: "2",
            neteaseId: "2",
            name: "Red Bean",
            artist: "Faye Wong",
            album: "唱游",
            duration: 240000,
            durationMs: 240000,
            coverUrl: "https://example.com/cover-2.jpg",
            sourceType: "NETEASE_EXPERIMENTAL",
            playableStatus: "unknown",
          },
        ],
      }),
      resolver: async (track) =>
        track.id === "1"
          ? {
              songId: track.id,
              loggedIn: true,
              hasCookie: true,
              apiMode: "remote",
              attempts: [],
              final: {
                playable: true,
                audioUrl: "https://audio.example/goodbye-henry.mp3",
                reason: null,
              },
              debug: {
                rawKeys: ["data"],
                sampleRaw: { data: [{ url: "https://audio.example/goodbye-henry.mp3" }] },
              },
            }
          : {
              songId: track.id,
              loggedIn: true,
              hasCookie: true,
              apiMode: "remote",
              attempts: [],
              final: {
                playable: false,
                audioUrl: null,
                reason: "vip_only",
              },
              debug: {
                rawKeys: ["data"],
                sampleRaw: { data: [{ url: null }] },
              },
            },
    });

    const result = await service.buildPlayableQueue("95204435", { limit: 2 });

    expect(result.playlistId).toBe("95204435");
    expect(result.playlistName).toBe("我喜欢的音乐");
    expect(result.playableTracks).toEqual([
      {
        id: "1",
        neteaseId: "1",
        providerTrackId: "1",
        title: "Goodbye Henry. (feat. Al Green)",
        artist: "RAYE / Al Green",
        album: "THIS MUSIC MAY CONTAIN HOPE.",
        coverUrl: "https://example.com/cover-1.jpg",
        durationMs: 320434,
        audioUrl: "https://audio.example/goodbye-henry.mp3",
        sourceType: "netease",
        playableStatus: "playable",
      },
    ]);
    expect(result.failedTracks).toEqual([
      expect.objectContaining({
        id: "2",
        title: "Red Bean",
        reason: "vip_only",
      }),
    ]);
    expect(result.stats).toEqual({
      total: 2,
      playable: 1,
      failed: 1,
      noUrl: 0,
      vipOnly: 1,
      copyrightUnavailable: 0,
      apiError: 0,
    });
  });
});
