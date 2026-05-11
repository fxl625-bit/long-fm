import { describe, expect, it } from "vitest";
import { TTSManager } from "@/lib/tts/tts-manager";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@/lib/tts/tts-provider";

class FakeProvider implements TTSProvider {
  public readonly requests: TTSRequest[] = [];

  constructor(
    public readonly id: string,
    private readonly available: boolean,
    private readonly result: TTSResult,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async listVoices(): Promise<TTSVoice[]> {
    return [
      {
        id: `${this.id}-voice`,
        name: `${this.id} voice`,
        provider: this.id as TTSVoice["provider"],
      },
    ];
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    this.requests.push(request);
    return {
      ...this.result,
      text: request.text,
      provider: this.id,
    };
  }
}

describe("TTSManager", () => {
  it("falls back to subtitle_only when preferred providers are unavailable", async () => {
    const manager = new TTSManager({
      providerOrder: ["edge_tts", "subtitle_only"],
      fallbackProvider: "subtitle_only",
      providers: {
        edge_tts: new FakeProvider("edge_tts", false, {
          mode: "audio",
          audioUrl: "/tts-cache/edge.mp3",
          text: "",
          provider: "edge_tts",
        }),
        subtitle_only: new FakeProvider("subtitle_only", true, {
          mode: "subtitle_only",
          text: "",
          provider: "subtitle_only",
        }),
      },
    });

    const result = await manager.synthesize({ text: "这是一句测试口播。" });

    expect(result.mode).toBe("subtitle_only");
    expect(result.provider).toBe("subtitle_only");
  });

  it("uses preferred provider when available", async () => {
    const manager = new TTSManager({
      providerOrder: ["edge_tts", "subtitle_only"],
      fallbackProvider: "subtitle_only",
      providers: {
        edge_tts: new FakeProvider("edge_tts", true, {
          mode: "audio",
          audioUrl: "/tts-cache/edge.mp3",
          text: "",
          provider: "edge_tts",
          voice: "zh-CN-XiaoxiaoNeural",
        }),
        subtitle_only: new FakeProvider("subtitle_only", true, {
          mode: "subtitle_only",
          text: "",
          provider: "subtitle_only",
        }),
      },
    });

    const result = await manager.synthesize({ text: "刚刚这几首都偏安静。" });

    expect(result.mode).toBe("audio");
    expect(result.provider).toBe("edge_tts");
    expect(result.audioUrl).toBe("/tts-cache/edge.mp3");
  });

  it("prefers the most natural available provider by default", async () => {
    const openai = new FakeProvider("openai", true, {
      mode: "audio",
      audioUrl: "/tts-cache/openai.mp3",
      text: "",
      provider: "openai",
      voice: "marin",
    });
    const edge = new FakeProvider("edge_tts", true, {
      mode: "audio",
      audioUrl: "/tts-cache/edge.mp3",
      text: "",
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
    });
    const manager = new TTSManager({
      fallbackProvider: "subtitle_only",
      providers: {
        openai,
        edge_tts: edge,
        subtitle_only: new FakeProvider("subtitle_only", true, {
          mode: "subtitle_only",
          text: "",
          provider: "subtitle_only",
        }),
      },
    });

    const result = await manager.synthesize({ text: "Long FM wants the more natural voice path." });

    expect(result.provider).toBe("openai");
    expect(result.audioUrl).toBe("/tts-cache/openai.mp3");
    expect(openai.requests).toHaveLength(1);
    expect(edge.requests).toHaveLength(0);
  });

  it("respects an explicit provider override even when a more natural provider is available", async () => {
    const openai = new FakeProvider("openai", true, {
      mode: "audio",
      audioUrl: "/tts-cache/openai.mp3",
      text: "",
      provider: "openai",
      voice: "marin",
    });
    const edge = new FakeProvider("edge_tts", true, {
      mode: "audio",
      audioUrl: "/tts-cache/edge.mp3",
      text: "",
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
    });
    const manager = new TTSManager({
      fallbackProvider: "subtitle_only",
      providers: {
        openai,
        edge_tts: edge,
        subtitle_only: new FakeProvider("subtitle_only", true, {
          mode: "subtitle_only",
          text: "",
          provider: "subtitle_only",
        }),
      },
    });

    const result = await manager.synthesize({
      text: "Use the explicitly selected provider.",
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
    });

    expect(result.provider).toBe("edge_tts");
    expect(result.audioUrl).toBe("/tts-cache/edge.mp3");
    expect(edge.requests).toHaveLength(1);
    expect(openai.requests).toHaveLength(0);
  });
});
