import type { DJContext, DJContextTrack, DJDirectorContext, ListeningContext } from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";

function inferTimeOfDay(hour: number): ListeningContext["timeOfDay"] {
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function inferWeekdayType(day: number): ListeningContext["weekdayType"] {
  return day === 0 || day === 6 ? "weekend" : "workday";
}

export function buildListeningContext(now = new Date()): ListeningContext {
  const timeOfDay = inferTimeOfDay(now.getHours());
  const weekdayType = inferWeekdayType(now.getDay());

  if (timeOfDay === "morning") {
    return {
      timeOfDay,
      weekdayType,
      likelyScene: weekdayType === "workday" ? "commute" : "relax",
      energyTarget: "medium",
      recommendedMood: ["轻快", "清醒", "熟悉感"],
      reason: "早间先从熟悉和中等能量进入，避免一下太重。",
    };
  }

  if (timeOfDay === "afternoon") {
    return {
      timeOfDay,
      weekdayType,
      likelyScene: weekdayType === "workday" ? "work" : "focus",
      energyTarget: "medium",
      recommendedMood: ["稳定", "专注", "不过冲"],
      reason: "下午更适合稳定节奏，减少风格突然跳转。",
    };
  }

  if (timeOfDay === "evening") {
    return {
      timeOfDay,
      weekdayType,
      likelyScene: "relax",
      energyTarget: "medium",
      recommendedMood: ["放松", "城市感", "缓慢推进"],
      reason: "傍晚适合从放松过渡到轻度推进。",
    };
  }

  return {
    timeOfDay,
    weekdayType,
    likelyScene: "sleep",
    energyTarget: "low",
    recommendedMood: ["舒缓", "怀旧", "克制"],
    reason: "夜间优先中低能量，避免高刺激。",
  };
}

function toContextTrack(track: Track | null | undefined): DJContextTrack | null {
  if (!track) {
    return null;
  }

  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
  };
}

function toContextTracks(tracks: Track[], limit: number) {
  return tracks.slice(0, limit).map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
  }));
}

export function buildDJContext(input: {
  event: DJContext["event"];
  context: DJDirectorContext;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  recentLines: string[];
}): DJContext {
  return {
    event: input.event,
    currentTrack: toContextTrack(input.context.currentTrack),
    nextTrack: toContextTrack(input.context.nextTrack),
    recentTracks: toContextTracks(input.context.recentTracks, 5),
    upcomingTracks: toContextTracks(input.context.upcomingTracks, 8),
    playableTrackPool: toContextTracks(input.context.playableTrackPool ?? input.context.upcomingTracks, 80),
    playedCount: input.context.playedCount,
    timeOfDay: input.context.timeOfDay,
    userIntent: input.context.userIntent,
    musicState: {
      isPlaying: input.isPlaying,
      isPaused: !input.isPlaying,
      currentTime: input.currentTime,
      duration: input.duration,
    },
    recentLines: input.recentLines.slice(-8),
  };
}
