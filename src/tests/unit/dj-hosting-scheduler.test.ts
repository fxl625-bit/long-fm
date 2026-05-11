import { describe, expect, it, vi } from "vitest";
import { DJHostingScheduler } from "@/lib/dj/dj-hosting-scheduler";
import type { DJProgramPlan, DJTalkBreakResult } from "@/lib/dj/dj-types";
import type { Track } from "@/lib/radio/radio-types";

function makeTrack(id: string): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    audioUrl: `https://audio.example/${id}.mp3`,
    playableStatus: "playable",
    sourceType: "netease",
    durationMs: 180000,
  };
}

function makePlan(): DJProgramPlan {
  return {
    title: "Today",
    intent: "Start gently",
    segments: [
      {
        name: "Warmup",
        purpose: "warmup",
        targetMood: ["familiar"],
        targetEnergy: "low",
        trackIds: ["t-1", "t-2"],
        reason: "Settle in",
      },
    ],
    queueTrackIds: ["t-1", "t-2", "t-3", "t-4"],
  };
}

describe("DJHostingScheduler", () => {
  it("requests opening speech from the director", async () => {
    const requestDecision = vi.fn(async (): Promise<DJTalkBreakResult> => ({
      attemptedLines: ["opening line"],
      spokenLines: ["opening line"],
      blockedLines: [],
      guardResult: {
        ok: true,
        safeLines: ["opening line"],
        blockedLines: [],
      },
    }));
    const scheduler = new DJHostingScheduler({
      voiceQueue: {
        enqueue: vi.fn(async () => undefined),
        clear: vi.fn(),
        isActive: vi.fn(() => false),
      } as never,
      requestDecision,
    });

    scheduler.start(makePlan(), {
      currentTrack: makeTrack("t-1"),
      currentIndex: 0,
      queueLength: 4,
    });

    await Promise.resolve();

    expect(requestDecision).toHaveBeenCalledWith("opening", expect.anything());
    expect(scheduler.getDebugState().openingDone).toBe(true);
    expect(scheduler.getDebugState().openingLinesSpoken).toEqual(["opening line"]);
  });

  it("routes track intro and bridge moments through the director", async () => {
    const requestDecision = vi.fn(async (): Promise<DJTalkBreakResult> => ({
      attemptedLines: ["director line"],
      spokenLines: ["director line"],
      blockedLines: [],
      guardResult: {
        ok: true,
        safeLines: ["director line"],
        blockedLines: [],
      },
    }));
    const scheduler = new DJHostingScheduler({
      voiceQueue: {
        enqueue: vi.fn(async () => undefined),
        clear: vi.fn(),
        isActive: vi.fn(() => false),
      } as never,
      requestDecision,
    });

    scheduler.start(makePlan(), {
      currentTrack: makeTrack("t-1"),
      currentIndex: 0,
      queueLength: 4,
    });
    requestDecision.mockClear();

    scheduler.onTrackStart(makeTrack("t-2"), 1, 4);
    scheduler.onTimeTick(10, makeTrack("t-2"), 1, 4);
    expect(requestDecision).toHaveBeenCalledWith("introduce_current", expect.anything());
    expect(scheduler.getDebugState().currentTrackIntroDoneTrackId).toBe("t-2");

    requestDecision.mockClear();
    scheduler.onTrackEnd(makeTrack("t-1"), 0, 4);
    scheduler.onTrackEnd(makeTrack("t-2"), 1, 4);
    expect(requestDecision).toHaveBeenCalledWith("bridge_to_next", expect.anything());
    expect(scheduler.getDebugState().playedCount).toBe(2);
    expect(scheduler.getDebugState().lastTalkBreakEvent).toBe("bridge");
  });

  it("keeps debug state when the opening produces no lines", async () => {
    const requestDecision = vi.fn(async () => undefined);
    const scheduler = new DJHostingScheduler({
      voiceQueue: {
        enqueue: vi.fn(async () => undefined),
        clear: vi.fn(),
        isActive: vi.fn(() => false),
      } as never,
      requestDecision,
    });

    scheduler.start(makePlan(), {
      currentTrack: makeTrack("t-1"),
      currentIndex: 0,
      queueLength: 4,
    });

    await Promise.resolve();

    expect(requestDecision).toHaveBeenCalledTimes(1);
    expect(scheduler.getDebugState().openingDone).toBe(true);
    expect(scheduler.getDebugState().openingLinesAttempted).toEqual([]);
  });

  it("keeps host debug fields when paused", () => {
    const scheduler = new DJHostingScheduler({
      voiceQueue: {
        enqueue: vi.fn(async () => undefined),
        clear: vi.fn(),
        isActive: vi.fn(() => false),
      } as never,
      canHostNow: () => false,
    });

    scheduler.start(makePlan(), {
      currentTrack: makeTrack("t-1"),
      currentIndex: 0,
      queueLength: 4,
    });
    scheduler.notifyPaused();

    expect(scheduler.getDebugState().schedulerRunning).toBe(false);
    expect(scheduler.getDebugState().state).toBe("paused");
  });
});
