import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLXSearchPlayUrl, buildLXSkipNextUrl, buildLXSonglistPlayUrl } from "@/lib/providers/music/lx-music-scheme";
import { LXMusicProvider, mapLXPlayerStatus, resolveLXConnectionState } from "@/lib/providers/music/lx-music-provider";

describe("LX Music scheme urls", () => {
  it("builds searchPlay scheme url", () => {
    expect(buildLXSearchPlayUrl("Blue Metro", "Nora Line")).toBe(
      "lxmusic://music/searchPlay/Blue%20Metro-Nora%20Line",
    );
  });

  it("builds skip next scheme url", () => {
    expect(buildLXSkipNextUrl()).toBe("lxmusic://player/skipNext");
  });

  it("builds songlist play scheme url", () => {
    expect(buildLXSonglistPlayUrl("kw", "12345")).toBe("lxmusic://songlist/play/kw/12345");
  });
});

describe("LX Music provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps LX status payload into UI-safe status", () => {
    const mapped = mapLXPlayerStatus({
      status: "playing",
      name: "Blue Metro",
      singer: "Nora Line",
      albumName: "Window Seat",
      duration: 231000,
      progress: 42000,
      playbackRate: 1,
      picUrl: "https://example.com/cover.jpg",
      lyricLineText: "You fade into the train light",
      lyric: "full lyric",
      volume: 72,
      mute: false,
    });

    expect(mapped).toEqual({
      status: "playing",
      title: "Blue Metro",
      artist: "Nora Line",
      album: "Window Seat",
      duration: 231000,
      progress: 42000,
      playbackRate: 1,
      coverUrl: "https://example.com/cover.jpg",
      lyricLineText: "You fade into the train light",
      lyric: "full lyric",
      volume: 72,
      mute: false,
    });
  });

  it("classifies reachable but no-song status correctly", () => {
    expect(
      resolveLXConnectionState({
        status: "stoped",
        title: "",
        artist: "",
        album: "",
        duration: 0,
        progress: 0,
        playbackRate: 1,
      }),
    ).toBe("api_reachable_no_song");
  });

  it("classifies paused and playing states correctly", () => {
    expect(
      resolveLXConnectionState({
        status: "paused",
        title: "Blue Metro",
        artist: "Nora Line",
        album: "Window Seat",
        duration: 231000,
        progress: 42000,
        playbackRate: 1,
      }),
    ).toBe("paused");

    expect(
      resolveLXConnectionState({
        status: "playing",
        title: "Blue Metro",
        artist: "Nora Line",
        album: "Window Seat",
        duration: 231000,
        progress: 42000,
        playbackRate: 1,
      }),
    ).toBe("playing");
  });

  it("classifies request failures as api_unreachable", () => {
    expect(resolveLXConnectionState(null, true)).toBe("api_unreachable");
  });

  it("healthcheck reports available when LX status responds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: "playing",
        name: "Blue Metro",
        singer: "Nora Line",
        albumName: "Window Seat",
        duration: 231000,
        progress: 42000,
      }),
    });
    const provider = new LXMusicProvider({ apiBaseUrl: "http://127.0.0.1:23330", fetchImpl: fetchMock as typeof fetch });

    const health = await provider.healthcheck();

    expect(health.available).toBe(true);
    expect(health.status).toBe("available");
  });

  it("calls LX control endpoints with the expected paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    });
    const provider = new LXMusicProvider({ apiBaseUrl: "http://127.0.0.1:23330", fetchImpl: fetchMock as typeof fetch });

    await provider.play();
    await provider.pause();
    await provider.next();
    await provider.previous();
    await provider.setVolume(40);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://127.0.0.1:23330/play",
      "http://127.0.0.1:23330/pause",
      "http://127.0.0.1:23330/skip-next",
      "http://127.0.0.1:23330/skip-prev",
      "http://127.0.0.1:23330/volume?volume=40",
    ]);
  });
});
