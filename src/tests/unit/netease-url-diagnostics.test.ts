import { describe, expect, it } from "vitest";
import {
  extractDiagnosticUrl,
  resolveOneSongUrlWithDiagnostics,
  type NeteaseSongUrlDiagnosticsClient,
} from "@/lib/providers/netease/netease-url-diagnostics";

describe("extractDiagnosticUrl", () => {
  it("supports multiple raw response shapes and reports rawShape", () => {
    expect(extractDiagnosticUrl({ data: [{ url: "https://a.example/one.mp3", br: 128000 }] })).toEqual(
      expect.objectContaining({
        url: "https://a.example/one.mp3",
        rawShape: "data[0].url",
        br: 128000,
      }),
    );

    expect(extractDiagnosticUrl({ body: { data: [{ url: "https://b.example/two.mp3" }] } })).toEqual(
      expect.objectContaining({
        url: "https://b.example/two.mp3",
        rawShape: "body.data[0].url",
      }),
    );
  });
});

describe("resolveOneSongUrlWithDiagnostics", () => {
  it("tries multiple endpoints and stops when a playable url is found", async () => {
    const attempts: string[] = [];
    const client: NeteaseSongUrlDiagnosticsClient = {
      getSongUrlV1Raw: async (_songId, _cookie, level) => {
        attempts.push(`v1:${level}`);
        if (level === "higher") {
          return { data: [{ url: "https://audio.example/found.mp3", code: 200 }] };
        }
        return { data: [{ url: null, code: 200 }] };
      },
      getSongUrlRaw: async (_songId, _cookie, br) => {
        attempts.push(`legacy:${br}`);
        return { data: [{ url: null, code: 200 }] };
      },
      getSongDetail: async () => ({
        id: "1",
        name: "Song",
        artist: "Artist",
        duration: 180000,
        rawMeta: { fee: 0 },
      }),
    };

    const result = await resolveOneSongUrlWithDiagnostics({
      songId: "1",
      cookie: "cookie=1",
      client,
    });

    expect(result.final.playable).toBe(true);
    expect(result.final.audioUrl).toBe("https://audio.example/found.mp3");
    expect(result.apiMode).toBe("remote");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]?.fee).toBe(null);
    expect(attempts).toEqual(["v1:standard", "v1:higher"]);
  });

  it("returns cookie_missing when no cookie is available", async () => {
    const result = await resolveOneSongUrlWithDiagnostics({
      songId: "1",
      cookie: "",
      client: {
        getSongUrlV1Raw: async () => {
          throw new Error("should not run");
        },
        getSongUrlRaw: async () => {
          throw new Error("should not run");
        },
        getSongDetail: async () => null,
      },
    });

    expect(result.loggedIn).toBe(false);
    expect(result.apiMode).toBe("remote");
    expect(result.final).toEqual({
      playable: false,
      audioUrl: null,
      reason: "cookie_missing",
    });
    expect(result.attempts).toHaveLength(0);
  });
});
