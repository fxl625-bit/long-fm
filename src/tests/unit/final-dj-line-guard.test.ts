import { describe, expect, it } from "vitest";
import { guardDJLines } from "@/lib/dj/final-dj-line-guard";

describe("guardDJLines", () => {
  it("shouldBlockCloseVocalLine", () => {
    const result = guardDJLines(["我先用一首靠近一点的人声把节目接上。"]);
    expect(result.ok).toBe(false);
    expect(result.safeLines).toEqual([]);
    expect(result.blockedLines[0]?.reason).toMatch(/靠近|人声|接上/);
  });

  it("shouldBlockSimilarCloseVocalLine", () => {
    const result = guardDJLines(["我用一段靠近的人声接上这一段。"]);
    expect(result.ok).toBe(false);
    expect(result.safeLines).toEqual([]);
    expect(result.blockedLines[0]?.reason).toMatch(/靠近|人声|接上/);
  });

  it("shouldBlockBrightnessDrumLine", () => {
    const result = guardDJLines(["后面的亮度和鼓点会慢慢往前推。"]);
    expect(result.ok).toBe(false);
    expect(result.safeLines).toEqual([]);
    expect(result.blockedLines[0]?.reason).toMatch(/亮度|鼓点|推/);
  });

  it("shouldBlockProgramConnectLine", () => {
    const result = guardDJLines(["这首歌把节目接上。"]);
    expect(result.ok).toBe(false);
    expect(result.safeLines).toEqual([]);
    expect(result.blockedLines[0]?.reason).toMatch(/接上/);
  });

  it("keeps concrete safe lines", () => {
    const result = guardDJLines(["Al Green 一进来，这首歌就像突然借来了一点老灵魂乐的光。"]);
    expect(result.ok).toBe(true);
    expect(result.safeLines).toEqual(["Al Green 一进来，这首歌就像突然借来了一点老灵魂乐的光。"]);
    expect(result.blockedLines).toEqual([]);
  });
});
