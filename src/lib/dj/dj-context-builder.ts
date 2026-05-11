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

function inferDayOfWeek(day: number): ListeningContext["dayOfWeek"] {
  const days: ListeningContext["dayOfWeek"][] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[day];
}

function inferSeason(month: number): ListeningContext["season"] {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function inferWeatherHint(season: ListeningContext["season"], timeOfDay: ListeningContext["timeOfDay"]): string {
  const hints: Record<string, Record<string, string>> = {
    spring: {
      morning: "春天早晨，空气还有点凉，光线正在变软。",
      afternoon: "春日午后，温度刚好，适合开着窗让风进来。",
      evening: "春天的傍晚暗得慢，空气里有花粉和湿润的泥土味。",
      night: "春夜微凉，外面偶尔有虫鸣，适合安静收束。",
    },
    summer: {
      morning: "夏日清晨，阳光已经很亮了但还没开始热，空气干净。",
      afternoon: "盛夏午后，外面热浪翻滚，屋里开空调正好听点清凉的。",
      evening: "夏天的傍晚终于凉下来，天空从橙色变紫，适合出门或开窗。",
      night: "夏夜闷热但不烦躁，偶尔有风从窗缝进来。",
    },
    autumn: {
      morning: "秋天的早晨有点凉，光线偏金色，适合清醒地开始。",
      afternoon: "秋日午后，天空高远光线柔和，适合专注或走神。",
      evening: "秋天的傍晚暗得快，路灯亮得早，空气里有干燥的叶子味。",
      night: "秋夜微凉，适合裹着毯子听歌，声音会显得更近。",
    },
    winter: {
      morning: "冬天早晨天还没全亮，被窝外面有点冷，需要慢慢暖起来。",
      afternoon: "冬日午后阳光最珍贵，抓紧那一点暖意。",
      evening: "冬天傍晚天早就黑了，街上的灯比平时更亮，适合回家路上听。",
      night: "冬夜很长，外面安静得像世界按了暂停，适合深一点的歌。",
    },
  };
  return hints[season]?.[timeOfDay] ?? "天气和光线跟平时一样，适合让音乐自己说话。";
}

type SceneConfig = {
  likelyScene: ListeningContext["likelyScene"];
  energyTarget: ListeningContext["energyTarget"];
  recommendedMood: string[];
};

function inferSceneConfig(
  timeOfDay: ListeningContext["timeOfDay"],
  weekdayType: ListeningContext["weekdayType"],
): SceneConfig {
  if (timeOfDay === "morning") {
    return {
      likelyScene: weekdayType === "workday" ? "commute" : "relax",
      energyTarget: weekdayType === "workday" ? "medium" : "medium",
      recommendedMood: weekdayType === "workday" ? ["清醒", "轻快", "启动感"] : ["松弛", "缓慢启动", "不赶时间"],
    };
  }
  if (timeOfDay === "afternoon") {
    return {
      likelyScene: weekdayType === "workday" ? "work" : "focus",
      energyTarget: "medium",
      recommendedMood: weekdayType === "workday" ? ["稳定", "专注", "不过冲"] : ["沉浸", "自由", "稍深一点"],
    };
  }
  if (timeOfDay === "evening") {
    return {
      likelyScene: weekdayType === "workday" ? "commute" : "relax",
      energyTarget: "medium",
      recommendedMood: weekdayType === "workday" ? ["归途感", "放松", "城市感"] : ["放松", "温暖", "慢慢过渡"],
    };
  }
  return {
    likelyScene: weekdayType === "workday" ? "relax" : "sleep",
    energyTarget: "low",
    recommendedMood: weekdayType === "workday" ? ["舒缓", "收束", "明天再说"] : ["安静", "怀旧", "深度聆听"],
  };
}

function buildReason(
  timeOfDay: ListeningContext["timeOfDay"],
  weekdayType: ListeningContext["weekdayType"],
  season: ListeningContext["season"],
  weatherHint: string,
): string {
  const dayLabel = weekdayType === "workday" ? "工作日" : "周末";
  const seasonLabel = { spring: "春天", summer: "夏天", autumn: "秋天", winter: "冬天" }[season];
  return `${dayLabel}${timeOfDay === "morning" ? "早晨" : timeOfDay === "afternoon" ? "午后" : timeOfDay === "evening" ? "傍晚" : "深夜"}，${seasonLabel}。${weatherHint}`;
}

export function buildListeningContext(now = new Date()): ListeningContext {
  const timeOfDay = inferTimeOfDay(now.getHours());
  const weekdayType = inferWeekdayType(now.getDay());
  const dayOfWeek = inferDayOfWeek(now.getDay());
  const season = inferSeason(now.getMonth());
  const weatherHint = inferWeatherHint(season, timeOfDay);
  const scene = inferSceneConfig(timeOfDay, weekdayType);
  const reason = buildReason(timeOfDay, weekdayType, season, weatherHint);

  return {
    timeOfDay,
    weekdayType,
    dayOfWeek,
    season,
    weatherHint,
    likelyScene: scene.likelyScene,
    energyTarget: scene.energyTarget,
    recommendedMood: scene.recommendedMood,
    reason,
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
