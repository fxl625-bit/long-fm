import { describe, expect, it } from "vitest";
import { classifyNeteaseSongPlayableStatus } from "@/lib/providers/netease/netease-url-resolver";

describe("classifyNeteaseSongPlayableStatus", () => {
  it("marks songs with a real url as playable", () => {
    expect(
      classifyNeteaseSongPlayableStatus({
        url: "https://music.163.com/song/media/outer/url?id=123.mp3",
      }),
    ).toEqual({
      playableStatus: "playable",
      reason: "Playable URL resolved",
    });
  });

  it("marks VIP-restricted songs when fee metadata indicates paid playback", () => {
    expect(
      classifyNeteaseSongPlayableStatus({
        url: "",
        songMeta: {
          fee: 1,
        },
      }),
    ).toEqual({
      playableStatus: "vip_only",
      reason: "Song requires VIP playback",
    });
  });

  it("marks copyright-restricted songs when copyright metadata is present", () => {
    expect(
      classifyNeteaseSongPlayableStatus({
        url: null,
        songMeta: {
          noCopyrightRcmd: {
            type: 2,
          },
        },
      }),
    ).toEqual({
      playableStatus: "copyright_unavailable",
      reason: "Song is unavailable because of copyright restrictions",
    });
  });

  it("falls back to no_url when the song has no playable url and no stronger restriction signal", () => {
    expect(
      classifyNeteaseSongPlayableStatus({
        url: undefined,
        songMeta: {
          fee: 0,
        },
      }),
    ).toEqual({
      playableStatus: "no_url",
      reason: "Song URL is missing",
    });
  });
});
