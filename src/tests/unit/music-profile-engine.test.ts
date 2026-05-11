import { randomUUID } from "node:crypto";
import type { Track } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { analyzeMusicProfile } from "@/lib/engines/music-profile-engine";

function buildTrack(partial: Partial<Track>): Track {
  const now = new Date();

  return {
    id: partial.id ?? randomUUID(),
    providerTrackId: partial.providerTrackId ?? "mock-id",
    source: partial.source ?? "MOCK",
    sourceType: partial.sourceType ?? "DEMO",
    name: partial.name ?? "雨后环城线",
    artist: partial.artist ?? "林川",
    album: partial.album ?? "午夜窗口",
    duration: partial.duration ?? 240000,
    durationMs: partial.durationMs ?? 240000,
    coverUrl: partial.coverUrl ?? null,
    audioUrl: partial.audioUrl ?? null,
    externalUrl: partial.externalUrl ?? null,
    localPath: partial.localPath ?? null,
    playableStatus: partial.playableStatus ?? "playable",
    language: partial.language ?? "中文",
    era: partial.era ?? "2010s",
    moodTags: partial.moodTags ?? ["深夜", "克制", "怀旧"],
    styleTags: partial.styleTags ?? ["City Pop"],
    energyLevel: partial.energyLevel ?? "medium-low",
    lyrics: partial.lyrics ?? null,
    rawMeta: partial.rawMeta ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  } as Track;
}

describe("analyzeMusicProfile", () => {
  it("builds structured profile from user tracks", async () => {
    const tracks: Track[] = [
      buildTrack({ id: "1", artist: "林川", moodTags: ["深夜", "克制", "雨夜"] }),
      buildTrack({ id: "2", artist: "林川", moodTags: ["通勤", "城市感"], language: "中文" }),
      buildTrack({ id: "3", artist: "Mile North", language: "英文", era: "2000s", moodTags: ["怀旧"] }),
    ];

    const result = await analyzeMusicProfile(tracks);

    expect(result.structured.moods.length).toBeGreaterThan(0);
    expect(result.structured.languages).toContain("中文");
    expect(result.structured.topArtists[0]).toBe("林川");
    expect(result.summaryText.length).toBeGreaterThan(20);
  });
});
