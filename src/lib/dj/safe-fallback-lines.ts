import { guardDJLines } from "./final-dj-line-guard";
import type { DJTalkBreakEvent } from "./dj-types";
import type { SongBrief } from "./song-brief-service";
import type { Track } from "@/lib/radio/radio-types";

type SafeFallbackInput = {
  event: DJTalkBreakEvent | "manual_test";
  currentTrack?: Track | null;
  previousTrack?: Track | null;
  nextTrack?: Track | null;
  songBrief?: SongBrief | null;
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";
};

function artist(track?: Track | null) {
  return track?.artist?.trim() || "这位歌手";
}

function concreteSound(input: SafeFallbackInput) {
  const profile = input.songBrief?.soundProfile;
  return profile?.vocal || profile?.rhythm || profile?.instruments?.[0] || "人声和节奏";
}

function keepSafe(lines: string[]) {
  return guardDJLines(lines).safeLines.slice(0, 2);
}

export function buildSafeFallbackLines(input: SafeFallbackInput): string[] {
  const currentArtist = artist(input.currentTrack);

  if (input.event === "opening") {
    const lines = ["这里是 Long FM。"];
    if (input.currentTrack) {
      lines.push(`${currentArtist} 的这首歌先放一会儿。`);
    } else {
      lines.push("先从这一首开始。");
    }
    return keepSafe(lines);
  }

  if (input.event === "track_intro" || input.event === "manual_test") {
    if (!input.currentTrack) {
      return keepSafe(["这一首正在播。"]);
    }
    return keepSafe([`${currentArtist} 这首歌正在播。`, `先听它的${concreteSound(input)}。`]);
  }

  if (input.event === "bridge") {
    if (input.previousTrack && input.nextTrack) {
      return keepSafe([`刚才是 ${artist(input.previousTrack)}。`, `下一首换到 ${artist(input.nextTrack)}，声音会不太一样。`]);
    }
    if (input.nextTrack) {
      return keepSafe([`下一首换到 ${artist(input.nextTrack)}。`]);
    }
    return keepSafe(["这一段先留在这里。"]);
  }

  if (input.event === "user_tune") {
    return keepSafe(["好，我现在给你换一首。"]);
  }

  if (input.event === "outro") {
    return keepSafe(["今天这一段先播到这里。"]);
  }

  return keepSafe(input.currentTrack ? [`${currentArtist} 的这首歌先放一会儿。`] : ["这一首先放一会儿。"]);
}
