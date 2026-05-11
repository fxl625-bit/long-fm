import type { SongBrief } from "./song-brief-service";

export type RadioLikenessTrack = {
  title?: string;
  artist?: string;
  album?: string;
  soundHints?: string[];
};

export type RadioLikenessContext = {
  currentTrack?: RadioLikenessTrack | null;
  previousTrack?: RadioLikenessTrack | null;
  nextTrack?: RadioLikenessTrack | null;
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";
  segment?: {
    name?: string;
    purpose?: string;
    mood?: string[];
    hostNarrative?: string;
  } | null;
  currentSongBrief?: SongBrief | null;
  usedFacts?: string[];
};

export type RadioLikenessResult = {
  pass: boolean;
  score: number;
  failures: string[];
  strengths: string[];
  rewriteNeeded: boolean;
};

const LISTENER_WORDS = ["你", "我们", "路上", "换台", "先别急", "待一会儿", "车窗", "房间", "陪", "坐一会儿"];
const NARRATIVE_WORDS = ["像", "好像", "突然", "刚刚", "不只是", "先", "再", "一下子", "留在", "散掉", "借来", "把", "让"];
const TAG_TERMS = ["人声", "钢琴", "鼓点", "低频", "复古", "灵魂", "旋律", "松弛感", "情绪", "留白", "厚重"];
const ANNOUNCEMENT_PATTERNS = [/^接下来/, /^下一首/, /^后面/, /^Current Artist/i, /^Current Song/i];
const PLACEHOLDERS = ["Current Artist", "Current Song", "placeholder"];
const AI_SLOGANS = ["接上节目", "往前推", "慢慢往前", "空气流动", "频道透口气", "靠近一点的人声", "把频道放低"];
const SCENE_WORDS = ["下午", "晚上", "早上", "通勤", "车窗", "房间", "城市", "咖啡", "路上", "电梯口"];

function normalize(text: string) {
  return text.replace(/[，。！？；：、“”‘’（）()《》【】\[\]…,.!?;:'"\s]/g, "").trim().toLowerCase();
}

function similarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftChars = new Set(a.split(""));
  const rightChars = new Set(b.split(""));
  const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
  return overlap / Math.max(leftChars.size, rightChars.size, 1);
}

function startsWithTrackOrArtist(firstLine: string, context: RadioLikenessContext) {
  const normalizedFirstLine = normalize(firstLine);
  const starters = [
    context.currentTrack?.title,
    context.currentTrack?.artist,
    context.nextTrack?.title,
    context.nextTrack?.artist,
    context.previousTrack?.title,
    context.previousTrack?.artist,
  ]
    .filter(Boolean)
    .flatMap((value) => {
      const item = String(value);
      const base = item.split("(")[0]?.trim();
      return [item, base].filter(Boolean);
    }) as string[];
  return starters.some((value) => normalizedFirstLine.startsWith(normalize(value)));
}

function countTagTerms(text: string) {
  return TAG_TERMS.filter((term) => text.includes(term)).length;
}

function hasNarrative(text: string) {
  return NARRATIVE_WORDS.some((term) => text.includes(term));
}

function hasListenerAddress(text: string) {
  return LISTENER_WORDS.some((term) => text.includes(term));
}

function hasScene(text: string) {
  return SCENE_WORDS.some((term) => text.includes(term));
}

function hasSpecificMusicMaterial(text: string, context: RadioLikenessContext) {
  const refs = [
    context.currentTrack?.title,
    context.currentTrack?.artist,
    context.currentTrack?.album,
    context.nextTrack?.title,
    context.nextTrack?.artist,
    context.previousTrack?.title,
    context.previousTrack?.artist,
    ...(context.currentTrack?.soundHints ?? []),
    ...(context.currentSongBrief?.verifiedFacts ?? []),
  ].filter(Boolean) as string[];
  return refs.some((value) => text.includes(value)) || countTagTerms(text) >= 2;
}

export function evaluateRadioLikeness(lines: string[], context: RadioLikenessContext): RadioLikenessResult {
  const compactLines = lines.map((line) => line.trim()).filter(Boolean);
  const text = compactLines.join(" ");
  const firstLine = compactLines[0] ?? "";
  const failures: string[] = [];
  const strengths: string[] = [];
  const severeFailures = new Set<string>();
  let score = 100;

  if (!compactLines.length) {
    return { pass: false, score: 0, failures: ["empty_script"], strengths: [], rewriteNeeded: true };
  }

  if (PLACEHOLDERS.some((item) => text.includes(item))) {
    failures.push("placeholder_leak");
    severeFailures.add("placeholder_leak");
    score -= 90;
  }

  if (startsWithTrackOrArtist(firstLine, context)) {
    failures.push("starts_with_track_title");
    severeFailures.add("starts_with_track_title");
    score -= 18;
  }

  const negativeHit = AI_SLOGANS.find((example) => similarity(text, example) > 0.55);
  if (negativeHit) {
    failures.push("ai_slogan");
    severeFailures.add("ai_slogan");
    score -= 24;
  }

  if (ANNOUNCEMENT_PATTERNS.some((pattern) => pattern.test(firstLine)) || /下一首我接|接下来|后面我接/.test(text)) {
    failures.push("announcement_like");
    severeFailures.add("announcement_like");
    score -= 20;
  }

  if ((/下一首|接下来|后面/.test(text) && /《.+?》|Adele|RAYE|Goodbye Henry/i.test(text)) || /这首.+下一首/.test(text)) {
    failures.push("playlist_commentary");
    severeFailures.add("playlist_commentary");
    score -= 14;
  }

  if (countTagTerms(text) >= 2 && !hasNarrative(text)) {
    failures.push("tag_like_description");
    severeFailures.add("tag_like_description");
    score -= 22;
  }

  if (!hasNarrative(text)) {
    failures.push("no_narrative_flow");
    severeFailures.add("no_narrative_flow");
    score -= 16;
  } else {
    strengths.push("narrative_flow");
  }

  if (!hasListenerAddress(text) && !hasScene(text)) {
    score -= 4;
  } else {
    strengths.push("listener_address");
  }

  if (/换|接|转|切/.test(text) && countTagTerms(text) < 2 && !hasSpecificMusicMaterial(text, context)) {
    failures.push("vague_transition");
    score -= 12;
  }

  if (hasSpecificMusicMaterial(text, context)) {
    strengths.push("specific_music_detail");
  } else {
    score -= 10;
  }

  if (hasScene(text) || context.segment?.hostNarrative || context.timeOfDay) {
    strengths.push("station_feel");
  }

  if (/(像|好像|突然|借来|先别急|多待一会儿|坐一会儿)/.test(text)) {
    strengths.push("human_imperfection");
  } else {
    score -= 6;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    pass: score >= 75 && severeFailures.size === 0,
    score,
    failures,
    strengths,
    rewriteNeeded: score < 75,
  };
}
