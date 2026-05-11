import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TTSCache } from "@/lib/tts/tts-cache";

describe("TTSCache", () => {
  it("reuses cached audio when provider+voice+speed+pitch+text match", async () => {
    const root = mkdtempSync(join(tmpdir(), "tts-cache-test-"));
    const cache = new TTSCache({ publicDir: root });
    const entry = cache.resolve({
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
      speed: 1,
      pitch: 0,
      text: "我先从你熟悉的旋律开始。",
    });

    writeFileSync(entry.filePath, Buffer.from("mp3"));
    cache.writeMetadata({
      cacheKey: entry.cacheKey,
      publicUrl: entry.publicUrl,
      filePath: entry.filePath,
      text: "我先从你熟悉的旋律开始。",
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
      createdAt: new Date("2026-04-27T00:00:00.000Z").toISOString(),
      durationMs: 4200,
    });

    const hit = await cache.get({
      provider: "edge_tts",
      voice: "zh-CN-XiaoxiaoNeural",
      speed: 1,
      pitch: 0,
      text: "我先从你熟悉的旋律开始。",
    });

    expect(hit?.publicUrl).toBe(entry.publicUrl);
    expect(hit?.metadata.durationMs).toBe(4200);
    expect(readFileSync(hit!.filePath).toString()).toBe("mp3");
  });
});
