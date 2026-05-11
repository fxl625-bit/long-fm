import { describe, expect, it } from "vitest";
import { resolveLXMusicConfig } from "@/lib/providers/music/lx-music-config";

describe("resolveLXMusicConfig", () => {
  it("uses LX defaults when env is empty", () => {
    expect(resolveLXMusicConfig({})).toEqual({
      apiBaseUrl: "http://127.0.0.1:23330",
      enabled: true,
      useSSE: true,
    });
  });

  it("normalizes explicit env overrides", () => {
    expect(
      resolveLXMusicConfig({
        LX_MUSIC_API_BASE_URL: "http://127.0.0.1:34567/",
        LX_MUSIC_ENABLED: "false",
        LX_MUSIC_USE_SSE: "0",
      }),
    ).toEqual({
      apiBaseUrl: "http://127.0.0.1:34567",
      enabled: false,
      useSSE: false,
    });
  });
});
