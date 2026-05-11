import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { scanPublicAudioTracks } from "@/lib/radio/public-audio-source";

let tempDir: string | null = null;

async function makeTempPublicAudioDir() {
  tempDir = await mkdtemp(join(tmpdir(), "auralia-public-audio-"));
  return tempDir;
}

describe("public audio source", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("scans real audio files as unique playable public tracks", async () => {
    const root = await makeTempPublicAudioDir();
    await writeFile(join(root, "Nora Line - Blue Metro.mp3"), "not real mp3 bytes");
    await writeFile(join(root, "June Harbor - Paper Lamp.wav"), "not real wav bytes");
    await writeFile(join(root, "notes.txt"), "ignore me");

    const tracks = await scanPublicAudioTracks(root);

    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.title).sort()).toEqual(["Blue Metro", "Paper Lamp"]);
    expect(tracks.map((track) => track.artist).sort()).toEqual(["June Harbor", "Nora Line"]);
    expect(tracks.every((track) => track.playableStatus === "playable")).toBe(true);
    expect(new Set(tracks.map((track) => track.audioUrl)).size).toBe(2);
    expect(tracks.map((track) => track.audioUrl).sort()).toEqual([
      "/audio/June%20Harbor%20-%20Paper%20Lamp.wav",
      "/audio/Nora%20Line%20-%20Blue%20Metro.mp3",
    ]);
  });
});
