import { describe, expect, it } from "vitest";
import {
  buildNeteasePlaylistExternalUrl,
  buildNeteaseSongExternalUrl,
  isValidExternalUrl,
} from "@/lib/utils/external-links";

describe("external link builders", () => {
  it("builds netease song external url", () => {
    expect(buildNeteaseSongExternalUrl("2609698825")).toBe("https://music.163.com/#/song?id=2609698825");
  });

  it("builds netease playlist external url", () => {
    expect(buildNeteasePlaylistExternalUrl("95204435")).toBe("https://music.163.com/#/playlist?id=95204435");
  });

  it("returns undefined for missing song id", () => {
    expect(buildNeteaseSongExternalUrl("")).toBeUndefined();
    expect(buildNeteaseSongExternalUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for invalid id", () => {
    expect(buildNeteaseSongExternalUrl("abc123")).toBeUndefined();
    expect(buildNeteasePlaylistExternalUrl("playlist-001")).toBeUndefined();
  });

  it("validates generic external links", () => {
    expect(isValidExternalUrl("https://music.163.com/#/song?id=1")).toBe(true);
    expect(isValidExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isValidExternalUrl("")).toBe(false);
  });
});

