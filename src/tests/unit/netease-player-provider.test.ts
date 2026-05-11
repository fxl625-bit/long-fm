import { describe, expect, it } from "vitest";
import { shouldRefreshNeteaseLibrary } from "@/lib/providers/netease/netease-player-provider";

describe("shouldRefreshNeteaseLibrary", () => {
  it("forces a resync when the database has netease playlists but no synced tracks", () => {
    expect(
      shouldRefreshNeteaseLibrary({
        playlistCount: 1,
        trackCount: 0,
        likedPlaylistTrackCount: 0,
      }),
    ).toBe(true);
  });

  it("keeps the current library when netease playlists and tracks are already present", () => {
    expect(
      shouldRefreshNeteaseLibrary({
        playlistCount: 3,
        trackCount: 120,
        likedPlaylistTrackCount: 80,
      }),
    ).toBe(false);
  });
});
