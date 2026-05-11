import { afterEach, describe, expect, it, vi } from "vitest";
import { DJVoiceQueue } from "@/lib/dj/dj-voice-queue";

describe("DJVoiceQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("plays multiple DJ lines sequentially and keeps going when one line fails", async () => {
    vi.useFakeTimers();

    const djEngine = {
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
      speak: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("tts failed"))
        .mockResolvedValueOnce(undefined),
    };

    const queue = new DJVoiceQueue({
      djEngine: djEngine as never,
      gapMs: 500,
    });

    const run = queue.enqueue([
      "RAYE 这首的人声先贴近一点。",
      "下一首接《彩蝶舞夏》，钢琴会把边缘放松。",
      "如果你要改方向，我再把后面的歌重排。",
    ]);

    expect(queue.isActive()).toBe(true);

    await vi.runAllTimersAsync();
    await run;

    expect(djEngine.beginSpeechGroup).toHaveBeenCalledTimes(1);
    expect(djEngine.speak).toHaveBeenCalledTimes(3);
    expect(djEngine.speak.mock.calls[0]?.[1]).toMatchObject({ withinGroup: true });
    expect(djEngine.speak.mock.calls[1]?.[1]).toMatchObject({ withinGroup: true });
    expect(djEngine.speak.mock.calls[2]?.[1]).toMatchObject({ withinGroup: true });
    expect(djEngine.endSpeechGroup).toHaveBeenCalledTimes(1);
    expect(queue.isActive()).toBe(false);
  });

  it("skips recently repeated lines so the host does not loop the same copy", async () => {
    vi.useFakeTimers();

    const djEngine = {
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
      speak: vi.fn().mockResolvedValue(undefined),
    };

    const queue = new DJVoiceQueue({
      djEngine: djEngine as never,
      gapMs: 100,
    });

    const repeated = "Adele 那首的人声很厚。";
    const variant = "下一首接《彩蝶舞夏》，钢琴会把房间放松一点。";
    const firstRun = queue.enqueue([repeated, variant]);
    await vi.runAllTimersAsync();
    await firstRun;

    const secondRun = queue.enqueue([repeated, variant]);
    await vi.runAllTimersAsync();
    await secondRun;

    const spokenLines = djEngine.speak.mock.calls.map((call) => call[0]);
    expect(spokenLines.filter((line) => line === repeated)).toHaveLength(1);
  });

  it("clears recent spoken history when the queue is reset for a new session", async () => {
    vi.useFakeTimers();

    const djEngine = {
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
      speak: vi.fn().mockResolvedValue(undefined),
    };

    const queue = new DJVoiceQueue({
      djEngine: djEngine as never,
      gapMs: 100,
    });

    const repeated = "这首歌先把房间里的边角照出来。";
    await queue.enqueue([repeated]);
    await vi.runAllTimersAsync();

    queue.clear();

    await queue.enqueue([repeated]);
    await vi.runAllTimersAsync();

    expect(djEngine.speak.mock.calls.map((call) => call[0]).filter((line) => line === repeated)).toHaveLength(2);
  });

  it("blocks banned lines before they reach the DJ engine", async () => {
    vi.useFakeTimers();

    const djEngine = {
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
      speak: vi.fn().mockResolvedValue(undefined),
    };

    const queue = new DJVoiceQueue({
      djEngine: djEngine as never,
      gapMs: 100,
    });

    const run = queue.enqueue([
      "我先用一首靠近一点的人声把节目接上。",
      "Al Green 一进来，这首歌就像突然借来了一点老灵魂乐的光。",
    ]);

    await vi.runAllTimersAsync();
    await run;

    expect(djEngine.speak).toHaveBeenCalledTimes(1);
    expect(djEngine.speak).toHaveBeenCalledWith(
      "Al Green 一进来，这首歌就像突然借来了一点老灵魂乐的光。",
      expect.objectContaining({ withinGroup: true }),
    );
  });

  it("uses safe fallback lines when every original line is blocked", async () => {
    vi.useFakeTimers();

    const djEngine = {
      beginSpeechGroup: vi.fn(),
      endSpeechGroup: vi.fn(),
      isSpeaking: vi.fn(() => false),
      speak: vi.fn().mockResolvedValue(undefined),
    };

    const queue = new DJVoiceQueue({
      djEngine: djEngine as never,
      gapMs: 100,
    });

    const run = queue.enqueue(["Current Song: Goodbye Henry."], {
      fallbackLines: ["RAYE / Al Green 的这首歌先放一会儿。"],
    });

    await vi.runAllTimersAsync();
    await run;

    expect(djEngine.speak).toHaveBeenCalledTimes(1);
    expect(djEngine.speak).toHaveBeenCalledWith(
      "RAYE / Al Green 的这首歌先放一会儿。",
      expect.objectContaining({ withinGroup: true }),
    );
  });
});
