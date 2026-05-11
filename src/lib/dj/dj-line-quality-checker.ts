import { DJ_BANNED_PHRASES, findBannedPhrases } from "./dj-banned-phrases";
import { RADIO_HOST_NEGATIVE_EXAMPLES } from "./corpus/radio-host-negative-examples";
import { evaluateRadioLikeness } from "./radio-likeness-checker";
import type { SongBrief } from "./song-brief-service";

export type DJLineValidationTrack = {
  providerTrackId?: string;
  title?: string;
  artist?: string;
  album?: string;
  soundHints?: string[];
  lyricExcerpt?: string;
  albumContext?: string;
  artistContext?: string;
};

export type DJLineValidationContext = {
  currentTrack?: DJLineValidationTrack | null;
  previousTrack?: DJLineValidationTrack | null;
  nextTrack?: DJLineValidationTrack | null;
  transition?: {
    from?: string;
    to?: string;
    why?: string;
  } | null;
  segment?: {
    name?: string;
    purpose?: string;
    mood?: string[];
    hostNarrative?: string;
  } | null;
  recentLines?: string[];
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";
  currentSongBrief?: SongBrief | null;
  previousSongBrief?: SongBrief | null;
  nextSongBrief?: SongBrief | null;
  usedFacts?: string[];
  usedAngles?: string[];
};

export type DJLineValidationResult = {
  ok: boolean;
  bannedHits: string[];
  anchorCount: number;
  anchorTypes: string[];
  tooGeneric: boolean;
  reason: string;
  radioLikenessScore?: number;
  radioFailures?: string[];
  radioStrengths?: string[];
};

const SONIC_KEYWORDS = [
  "人声",
  "鼓点",
  "低频",
  "吉他",
  "钢琴",
  "采样",
  "合成器",
  "旋律",
  "节奏",
  "留白",
  "声场",
  "和声",
  "贝斯",
  "器乐",
];

const TRANSITION_KEYWORDS = ["从", "到", "换到", "切到", "转到", "接", "收住", "提亮", "压低", "松开"];
const SCENE_KEYWORDS = ["早上", "上午", "下午", "傍晚", "晚上", "通勤", "工作间隙", "咖啡", "车窗", "城市", "路上", "房间"];
const GENERIC_ABSTRACT_WORDS = ["节目", "频道", "气氛", "感觉", "亮度", "情绪", "往前推", "接上", "透气", "放低"];
const RECOMMENDER_WORDS = ["偏好", "系统", "生成", "推荐"];
const THIN_SOURCE_BACKGROUND_WORDS = ["发行", "录音棚", "幕后", "当年", "年份", "专辑故事", "创作背景", "录制"];
const PLACEHOLDERS = ["Current Artist", "Current Song", "placeholder"];

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

function mentionsAny(text: string, values: Array<string | undefined>) {
  return values.filter(Boolean).some((value) => text.includes(String(value)));
}

function collectSoundTerms(context: DJLineValidationContext) {
  return [
    ...(context.currentTrack?.soundHints ?? []),
    ...(context.previousTrack?.soundHints ?? []),
    ...(context.nextTrack?.soundHints ?? []),
    ...(context.currentSongBrief?.soundProfile.instruments ?? []),
    ...(context.currentSongBrief?.soundProfile.texture ?? []),
    ...(context.currentSongBrief?.soundProfile.mood ?? []),
    context.currentSongBrief?.soundProfile.vocal,
    context.currentSongBrief?.soundProfile.rhythm,
  ].filter(Boolean) as string[];
}

function countConcreteSoundHits(text: string, soundTerms: string[]) {
  const hits = new Set<string>();
  for (const keyword of SONIC_KEYWORDS) {
    if (text.includes(keyword)) {
      hits.add(keyword);
    }
  }
  for (const term of soundTerms) {
    if (term && text.includes(term)) {
      hits.add(term);
    }
  }
  return hits.size;
}

function collectConcreteRefs(context: DJLineValidationContext) {
  return [
    context.currentTrack?.title,
    context.currentTrack?.artist,
    context.currentTrack?.album,
    context.previousTrack?.title,
    context.previousTrack?.artist,
    context.nextTrack?.title,
    context.nextTrack?.artist,
    context.nextTrack?.album,
    context.currentSongBrief?.releaseYear,
    context.currentSongBrief?.lyricTheme,
  ].filter(Boolean) as string[];
}

function findNegativeExampleHit(text: string) {
  return RADIO_HOST_NEGATIVE_EXAMPLES.find((example) => similarity(text, example) > 0.55);
}

export function validateDJLines(lines: string[], context: DJLineValidationContext): DJLineValidationResult {
  const compactLines = lines.map((line) => line.trim()).filter(Boolean);
  const fullText = compactLines.join(" ");
  const bannedHits = findBannedPhrases(fullText);
  const anchorTypes = new Set<string>();
  const soundTerms = collectSoundTerms(context);
  const concreteRefs = collectConcreteRefs(context);

  if (!compactLines.length) {
    return { ok: false, bannedHits, anchorCount: 0, anchorTypes: [], tooGeneric: true, reason: "No lines to validate." };
  }

  if (PLACEHOLDERS.some((value) => fullText.includes(value))) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount: 0,
      anchorTypes: [],
      tooGeneric: true,
      reason: "placeholder_leak",
    };
  }

  if (bannedHits.length) {
    return {
      ok: false,
      bannedHits,
      anchorCount: 0,
      anchorTypes: [],
      tooGeneric: true,
      reason: `Banned phrase hit: ${bannedHits.join(", ")}`,
    };
  }

  const negativeExampleHit = findNegativeExampleHit(fullText);

  if (RECOMMENDER_WORDS.some((keyword) => fullText.includes(keyword))) {
    return {
      ok: false,
      bannedHits: DJ_BANNED_PHRASES.filter((phrase) => RECOMMENDER_WORDS.some((keyword) => phrase.includes(keyword))),
      anchorCount: 0,
      anchorTypes: [],
      tooGeneric: true,
      reason: "Contains recommendation-system wording.",
    };
  }

  if (!context.currentTrack || !context.nextTrack) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount: 0,
      anchorTypes: [],
      tooGeneric: true,
      reason: "Missing currentTrack or nextTrack context.",
    };
  }

  if (mentionsAny(fullText, [context.currentTrack.title, context.currentTrack.artist, context.currentTrack.album])) {
    anchorTypes.add("current_track");
  }
  if (mentionsAny(fullText, [context.previousTrack?.title, context.previousTrack?.artist])) {
    anchorTypes.add("previous_track");
  }
  if (mentionsAny(fullText, [context.nextTrack.title, context.nextTrack.artist, context.nextTrack.album])) {
    anchorTypes.add("next_track");
  }
  if (mentionsAny(fullText, [context.currentTrack.artist, context.currentTrack.album, context.nextTrack.artist, context.nextTrack.album, context.previousTrack?.artist, context.previousTrack?.album])) {
    anchorTypes.add("artist_or_album");
  }
  if (countConcreteSoundHits(fullText, soundTerms) > 0) {
    anchorTypes.add("sonic_detail");
  }
  if (TRANSITION_KEYWORDS.some((keyword) => fullText.includes(keyword)) || mentionsAny(fullText, [context.transition?.from, context.transition?.to, context.transition?.why])) {
    anchorTypes.add("transition_logic");
  }
  if (SCENE_KEYWORDS.some((keyword) => fullText.includes(keyword))) {
    anchorTypes.add("time_or_scene");
  }
  if (context.currentSongBrief?.lyricTheme && fullText.includes(context.currentSongBrief.lyricTheme)) {
    anchorTypes.add("lyric_theme");
  }
  if (context.currentSongBrief?.releaseYear && fullText.includes(context.currentSongBrief.releaseYear)) {
    anchorTypes.add("era_context");
  }

  const anchorCount = anchorTypes.size;
  const recentLines = context.recentLines ?? [];
  const tooSimilar = recentLines.some((recent) => similarity(fullText, recent) > 0.72);
  if (tooSimilar) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: true,
      reason: "Too similar to recent lines.",
    };
  }

  const concreteSoundHits = countConcreteSoundHits(fullText, soundTerms);
  const hasConcreteRefs = mentionsAny(fullText, concreteRefs) || concreteSoundHits > 0;
  const genericOnly = GENERIC_ABSTRACT_WORDS.some((keyword) => fullText.includes(keyword)) && !hasConcreteRefs;
  if (genericOnly) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: true,
      reason: "Too generic and not grounded in track detail.",
    };
  }

  const hasSongBrief = Boolean(context.currentSongBrief || context.previousSongBrief || context.nextSongBrief);
  const currentSourceQuality = context.currentSongBrief?.sourceQuality ?? (context.currentSongBrief?.factsInsufficient ? "thin" : "partial");
  if (currentSourceQuality === "thin" && THIN_SOURCE_BACKGROUND_WORDS.some((keyword) => fullText.includes(keyword))) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: false,
      reason: "Thin source cannot support background-story claims.",
    };
  }

  const usedFacts = context.usedFacts ?? [];
  const usedAngles = context.usedAngles ?? [];
  const hasUsedBriefMaterial = usedFacts.length > 0 || usedAngles.length > 0;

  if (currentSourceQuality === "thin") {
    if (concreteSoundHits < 2) {
      return {
        ok: false,
        bannedHits: [],
        anchorCount,
        anchorTypes: [...anchorTypes],
        tooGeneric: true,
        reason: "Thin source requires at least two concrete sonic details.",
      };
    }
  } else if (hasSongBrief && !hasUsedBriefMaterial) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: true,
      reason: "SongBrief facts or talk angles were not used.",
    };
  }

  const radio = evaluateRadioLikeness(compactLines, context);
  if (!radio.pass) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: true,
      reason: radio.failures[0] ?? (negativeExampleHit ? `negative_example_match:${negativeExampleHit}` : "radio_likeness_failed"),
      radioLikenessScore: radio.score,
      radioFailures: negativeExampleHit ? [...new Set([`negative_example_match:${negativeExampleHit}`, ...radio.failures])] : radio.failures,
      radioStrengths: radio.strengths,
    };
  }

  if (anchorCount < 1 && !hasUsedBriefMaterial) {
    return {
      ok: false,
      bannedHits: [],
      anchorCount,
      anchorTypes: [...anchorTypes],
      tooGeneric: true,
      reason: "Fewer than one concrete anchor.",
      radioLikenessScore: radio.score,
      radioFailures: radio.failures,
      radioStrengths: radio.strengths,
    };
  }

  return {
    ok: true,
    bannedHits: [],
    anchorCount,
    anchorTypes: [...anchorTypes],
    tooGeneric: false,
    reason: "ok",
    radioLikenessScore: radio.score,
    radioFailures: radio.failures,
    radioStrengths: radio.strengths,
  };
}
