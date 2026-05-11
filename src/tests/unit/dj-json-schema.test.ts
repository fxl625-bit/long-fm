import { describe, expect, it } from "vitest";
import { normalizeDJDecision } from "@/lib/llm/dj-json-schema";

describe("normalizeDJDecision", () => {
  it("keeps stop_talking and filters invented track ids out of queue patches", () => {
    const decision = normalizeDJDecision(
      {
        action: "stop_talking",
        priority: "high",
        shouldSpeak: false,
        lines: ["频道暂停了，我先不打扰。"],
        queuePatch: {
          mode: "skip_now",
          trackIds: ["track-2", "made-up"],
        },
        reason: "Music is paused.",
      },
      {
        allowedTrackIds: ["track-1", "track-2", "track-3"],
      },
    );

    expect(decision.action).toBe("stop_talking");
    expect(decision.queuePatch?.mode).toBe("skip_now");
    expect(decision.queuePatch?.trackIds).toEqual(["track-2"]);
    expect(decision.shouldSpeak).toBe(false);
  });

  it("falls back to a safe user_tune queue patch when the model returns unusable ids", () => {
    const decision = normalizeDJDecision(
      {
        action: "user_tune",
        priority: "normal",
        shouldSpeak: true,
        lines: ["可以，我把后面几首重新排一下。"],
        queuePatch: {
          mode: "reorder_upcoming",
          trackIds: ["ghost-track"],
        },
        reason: "Shift the next few songs.",
      },
      {
        allowedTrackIds: ["track-1", "track-2", "track-3"],
        fallbackTrackIds: ["track-3", "track-2"],
      },
    );

    expect(decision.queuePatch?.mode).toBe("reorder_upcoming");
    expect(decision.queuePatch?.trackIds).toEqual(["track-3", "track-2"]);
    expect(decision.lines[0]).toContain("可以");
  });
});
