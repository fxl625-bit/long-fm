import { describe, expect, it } from "vitest";
import { buildPlayableQueue, nextTrack, playTrack, syncAudioSource, toPlaybackState } from "@/lib/audio/radio-playback-state";
import { getDemoTracks } from "@/lib/demo/music-data";
import { buildEpisodeTimeline } from "@/lib/engines/episode-timeline";
import type { PlaybackQueueItem, PlaybackSessionState } from "@/lib/types/music";

function makeQueue(): PlaybackQueueItem[] {
  return [
    {
      track: {
        id: "a",
        name: "Track A",
        artist: "Artist A",
        album: "Album A",
        duration: 180000,
        durationMs: 180000,
        audioUrl: "https://example.com/a.mp3",
        sourceType: "DEMO",
        playableStatus: "playable",
      },
      section: "opening",
    },
    {
      track: {
        id: "b",
        name: "Track B",
        artist: "Artist B",
        album: "Album B",
        duration: 190000,
        durationMs: 190000,
        audioUrl: "https://example.com/b.mp3",
        sourceType: "DEMO",
        playableStatus: "playable",
      },
      section: "build",
    },
    {
      track: {
        id: "c",
        name: "Track C",
        artist: "Artist C",
        album: "Album C",
        duration: 200000,
        durationMs: 200000,
        audioUrl: "https://example.com/c.mp3",
        sourceType: "DEMO",
        playableStatus: "playable",
      },
      section: "lift",
    },
  ];
}

describe("radio playback state", () => {
  it("keeps unique audio urls for demo playable tracks", () => {
    const playable = getDemoTracks().filter((track) => track.playableStatus === "playable" && track.audioUrl);
    const unique = new Set(playable.map((track) => track.audioUrl));
    expect(unique.size).toBe(playable.length);
  });

  it("filters metadata-only tracks out of playback queue", () => {
    const queue: PlaybackQueueItem[] = [
      ...makeQueue(),
      {
        track: {
          id: "meta-only",
          name: "Meta Only",
          artist: "No Audio",
          duration: 100000,
          durationMs: 100000,
          sourceType: "NETEASE_OFFICIAL",
          playableStatus: "metadata_only",
        },
        section: "build",
      },
    ];

    const playableQueue = buildPlayableQueue(queue);
    expect(playableQueue.map((item) => item.track.id)).toEqual(["a", "b", "c"]);
  });

  it("drops duplicate playable audio urls from queue", () => {
    const queue = makeQueue();
    queue.push({
      track: {
        id: "dup",
        name: "Duplicate Audio",
        artist: "Artist D",
        duration: 180000,
        durationMs: 180000,
        audioUrl: "https://example.com/b.mp3",
        sourceType: "DEMO",
        playableStatus: "playable",
      },
      section: "build",
    });

    const playableQueue = buildPlayableQueue(queue);
    expect(playableQueue.map((item) => item.track.id)).toEqual(["a", "b", "c"]);
  });

  it("playTrack keeps currentTrack and audio source aligned", () => {
    const session: PlaybackSessionState = {
      currentTrackId: "a",
      queue: makeQueue(),
      currentIndex: 0,
      currentTime: 0,
      isPlaying: false,
      volume: 0.8,
      source: "DEMO",
    };

    const started = playTrack(toPlaybackState(session, "idle"), 1);
    expect(started.currentTrack?.id).toBe("b");

    const audio = { src: "" };
    syncAudioSource(audio, started);
    expect(audio.src).toBe("https://example.com/b.mp3");
  });

  it("nextTrack advances to the next audio source", () => {
    const session: PlaybackSessionState = {
      currentTrackId: "a",
      queue: makeQueue(),
      currentIndex: 0,
      currentTime: 0,
      isPlaying: true,
      volume: 0.8,
      source: "DEMO",
    };

    const first = playTrack(toPlaybackState(session, "playing"), 0);
    const second = nextTrack(first);
    expect(second.currentTrack?.id).toBe("b");
    expect(second.audioUrl).toBe("https://example.com/b.mp3");
  });
});

describe("episode timeline", () => {
  it("starts with dj intro and inserts bridge before the 3rd track (index 2)", () => {
    const timeline = buildEpisodeTimeline(makeQueue(), 2);
    expect(timeline[0]?.type).toBe("dj_intro");
    expect(
      timeline.some((item) => item.type === "dj_bridge" && item.beforeTrackIndex === 2),
    ).toBe(true);
  });
});
