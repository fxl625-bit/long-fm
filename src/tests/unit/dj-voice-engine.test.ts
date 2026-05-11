import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDJVoice, synthesizeDJVoice } from "@/lib/dj/dj-voice-engine";

describe("renderDJVoice", () => {
  afterEach(() => {
    delete process.env.TTS_PROVIDER;
    delete process.env.TTS_FALLBACK_PROVIDER;
    vi.restoreAllMocks();
  });

  it("returns subtitle-only output when subtitle provider is selected", async () => {
    process.env.TTS_PROVIDER = "subtitle_only";
    process.env.TTS_FALLBACK_PROVIDER = "subtitle_only";

    const output = await renderDJVoice("这是一句测试口播。");

    expect(output.subtitle).toBe("这是一句测试口播。");
    expect(output.mode).toBe("subtitle_only");
    expect(output.provider).toBe("subtitle_only");
  });

  it("returns audio debug info when TTS synthesis succeeds", async () => {
    const output = await synthesizeDJVoice("测试 DJ 是否能单独说话。", {
      synthesize: vi.fn().mockResolvedValue({
        mode: "audio",
        audioUrl: "/tts-cache/test.mp3",
        durationMs: 4200,
        text: "测试 DJ 是否能单独说话。",
        provider: "edge_tts",
        cached: true,
      }),
    } as never);

    expect(output).toEqual({
      ok: true,
      mode: "audio",
      provider: "edge_tts",
      audioUrl: "/tts-cache/test.mp3",
      durationMs: 4200,
      text: "测试 DJ 是否能单独说话。",
      cached: true,
      error: null,
    });
  });
});
