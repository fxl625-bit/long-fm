import { describe, expect, it } from "vitest";
import {
  extractPlaylistTracksDebugPayload,
  mapPlaylistTracksDebugError,
} from "@/lib/providers/netease/netease-playlist-debug";

describe("extractPlaylistTracksDebugPayload", () => {
  it("extracts tracks from playlist.tracks", () => {
    const result = extractPlaylistTracksDebugPayload(
      {
        playlist: {
          id: 95204435,
          name: "我喜欢的音乐",
          trackCount: 943,
          tracks: [
            {
              id: 1,
              name: "红豆",
              ar: [{ name: "王菲" }],
              al: { name: "唱游", picUrl: "https://example.com/cover.jpg" },
              dt: 240000,
            },
          ],
        },
      },
      20,
    );

    expect(result.debug.rawShape).toBe("playlist.tracks");
    expect(result.trackCount).toBe(943);
    expect(result.tracks).toEqual([
      {
        id: "1",
        title: "红豆",
        artist: "王菲",
        album: "唱游",
        durationMs: 240000,
        coverUrl: "https://example.com/cover.jpg",
      },
    ]);
  });

  it("falls back to playlist.trackIds when track list is missing", () => {
    const result = extractPlaylistTracksDebugPayload(
      {
        playlist: {
          id: 95204435,
          name: "我喜欢的音乐",
          trackCount: 943,
          trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
      },
      2,
      [
        {
          id: 1,
          name: "Blue",
          artists: [{ name: "Yerin Baek" }],
          album: { name: "Every letter I sent you.", picUrl: "https://example.com/blue.jpg" },
          duration: 210000,
        },
        {
          id: 2,
          name: "Hotel California",
          ar: [{ name: "Eagles" }],
          al: { name: "Hotel California", picUrl: "https://example.com/hotel.jpg" },
          dt: 390000,
        },
      ],
    );

    expect(result.debug.rawShape).toBe("playlist.trackIds+song.detail");
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]?.artist).toBe("Yerin Baek");
    expect(result.tracks[1]?.artist).toBe("Eagles");
  });
});

describe("mapPlaylistTracksDebugError", () => {
  it("maps known error shapes to explicit reasons", () => {
    expect(mapPlaylistTracksDebugError(new Error("playlistId is required"))).toBe("playlist_id_missing");
    expect(mapPlaylistTracksDebugError(new Error("No tracks in response"))).toBe("no_tracks_in_response");
    expect(mapPlaylistTracksDebugError(new Error("Invalid playlist detail response shape"))).toBe("invalid_response_shape");
  });
});
