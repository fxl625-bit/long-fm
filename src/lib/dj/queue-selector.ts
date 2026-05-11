import type { DJDirectingDecision } from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";

export type QueueIntent =
  | "lighter"
  | "quieter"
  | "nostalgic"
  | "more_chinese"
  | "more_english"
  | "more_rhythm"
  | "surprise";

export function isImmediateTuneIntent(intent?: string) {
  const text = (intent ?? "").trim().toLowerCase();
  return text.endsWith("_now") || /(立即|立刻|马上|right now)/i.test(text);
}

function isChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function looksEnglish(text: string) {
  return /[A-Za-z]/.test(text) && !isChineseText(text);
}

function normalized(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

export function getQueuePatchTrackId(track: Track) {
  return String(track.providerTrackId ?? track.neteaseId ?? track.id);
}

function inferLanguage(track: Track) {
  const tag = track.tags?.language?.trim();
  if (tag) {
    return tag;
  }
  if (isChineseText(`${track.title} ${track.artist}`)) {
    return "中文";
  }
  if (looksEnglish(`${track.title} ${track.artist}`)) {
    return "English";
  }
  return "unknown";
}

function energyScore(track: Track) {
  if (track.tags?.energy === "high") return 3;
  if (track.tags?.energy === "low") return 1;
  const text = `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase();
  if (/(wake up|rock|dance|beat|rhythm|electronic|remix)/.test(text)) return 3;
  if (/(piano|night|dark|stripped|acoustic|sleep|calm)/.test(text)) return 1;
  return 2;
}

function nostalgiaScore(track: Track) {
  const era = track.tags?.era ?? "";
  const text = `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase();
  if (/(classic|old|gold|memory|nostalgia|retro)/.test(text)) return 3;
  if (/19\d\d|200\d|2010/.test(era)) return 2;
  return 1;
}

function rhythmScore(track: Track) {
  const text = `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase();
  if (/(beat|wake up|rock|dance|drum|electronic|paradise)/.test(text)) return 3;
  return energyScore(track);
}

function relaxedScore(track: Track) {
  const text = `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase();
  let score = 0;
  if (track.tags?.energy === "low") score += 4;
  if (track.tags?.energy === "medium") score += 2;
  if (track.tags?.vocal === "instrumental") score += 3;
  if (/(acoustic|piano|jazz|coffee|soft|love|night|instrumental|guitar)/.test(text)) score += 4;
  if (/(吉他|钢琴|纯音|爵士|咖啡|慢)/.test(`${track.title} ${track.artist} ${track.album ?? ""}`)) score += 4;
  if (/(wake up|bad liar|heavy|rock)/.test(text)) score -= 3;
  const durationMinutes = (track.durationMs ?? 0) / 60000;
  if (durationMinutes >= 2 && durationMinutes <= 5) score += 1;
  return score;
}

export function inferQueueIntent(intent: string): QueueIntent {
  const text = intent.trim().toLowerCase().replace(/_now$/, "");
  if (/(\u8f7b\u677e|lighter|relax|ease|soften)/i.test(text)) return "lighter";
  if (/(\u5b89\u9759|quiet|quieter|soft|\u67d4\u548c)/i.test(text)) return "quieter";
  if (/(\u8f7b\u5feb|\u8282\u594f|\u66f4\u6709\u52b2|rhythm|beat|brighter|\u5feb\u4e00\u70b9)/i.test(text)) return "more_rhythm";
  if (/(\u6000\u65e7|\u56de\u5fc6|nostalgic|retro|\u8001\u4e00\u70b9|\u65e7\u4e00\u70b9)/i.test(text)) return "nostalgic";
  if (/(\u4e2d\u6587|\u56fd\u8bed|\u534e\u8bed|chinese)/i.test(text)) return "more_chinese";
  if (/(\u82f1\u6587|\u6b27\u7f8e|english)/i.test(text)) return "more_english";
  if (/(\u60ca\u559c|surprise|\u4e0d\u4e00\u6837)/i.test(text)) return "surprise";
  return "lighter";
}

function dedupeTracks(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const patchId = getQueuePatchTrackId(track);
    if (seen.has(patchId)) {
      return false;
    }
    seen.add(patchId);
    return true;
  });
}

function avoidRecentAndCurrent(tracks: Track[], currentTrack: Track, recentTracks: Track[]) {
  const recentIds = new Set(recentTracks.slice(-5).map((track) => getQueuePatchTrackId(track)));
  const recentArtists = new Set(recentTracks.slice(-5).map((track) => normalized(track.artist)));
  const currentArtist = normalized(currentTrack.artist);

  return tracks.filter((track) => {
    const patchId = getQueuePatchTrackId(track);
    return (
      patchId !== getQueuePatchTrackId(currentTrack) &&
      !recentIds.has(patchId) &&
      normalized(track.artist) !== currentArtist &&
      !recentArtists.has(normalized(track.artist))
    );
  });
}

export function selectTracksForIntent(input: {
  intent: QueueIntent | string;
  currentTrack: Track;
  recentTracks: Track[];
  upcomingTracks: Track[];
  pool: Track[];
  count?: number;
}) {
  const count = Math.max(3, Math.min(input.count ?? 4, 5));
  const resolvedIntent = typeof input.intent === "string" ? inferQueueIntent(input.intent) : input.intent;
  const basePool = dedupeTracks(input.pool.filter((track) => track.playableStatus === "playable" && track.audioUrl));
  const safePool = avoidRecentAndCurrent(basePool, input.currentTrack, input.recentTracks);
  const fallbackPool = safePool.length ? safePool : dedupeTracks(basePool.filter((track) => track.id !== input.currentTrack.id));
  const upcomingProviderIds = input.upcomingTracks.slice(0, 3).map((track) => getQueuePatchTrackId(track));

  const sorted = [...fallbackPool].sort((left, right) => {
    let leftScore = 0;
    let rightScore = 0;

    if (resolvedIntent === "more_chinese") {
      leftScore = inferLanguage(left) === "中文" ? 3 : 0;
      rightScore = inferLanguage(right) === "中文" ? 3 : 0;
    } else if (resolvedIntent === "more_english") {
      leftScore = inferLanguage(left) !== "中文" ? 3 : 0;
      rightScore = inferLanguage(right) !== "中文" ? 3 : 0;
    } else if (resolvedIntent === "quieter") {
      leftScore = 4 - energyScore(left);
      rightScore = 4 - energyScore(right);
    } else if (resolvedIntent === "more_rhythm") {
      leftScore = rhythmScore(left);
      rightScore = rhythmScore(right);
    } else if (resolvedIntent === "nostalgic") {
      leftScore = nostalgiaScore(left);
      rightScore = nostalgiaScore(right);
    } else if (resolvedIntent === "surprise") {
      leftScore = normalized(left.artist) === normalized(input.currentTrack.artist) ? 0 : 2;
      rightScore = normalized(right.artist) === normalized(input.currentTrack.artist) ? 0 : 2;
      leftScore += normalized(left.tags?.style?.[0]) !== normalized(input.currentTrack.tags?.style?.[0]) ? 1 : 0;
      rightScore += normalized(right.tags?.style?.[0]) !== normalized(input.currentTrack.tags?.style?.[0]) ? 1 : 0;
    } else {
      leftScore = relaxedScore(left);
      rightScore = relaxedScore(right);
    }

    const leftUpcomingIndex = upcomingProviderIds.indexOf(getQueuePatchTrackId(left));
    const rightUpcomingIndex = upcomingProviderIds.indexOf(getQueuePatchTrackId(right));
    leftScore -= leftUpcomingIndex >= 0 ? 3 - leftUpcomingIndex : 0;
    rightScore -= rightUpcomingIndex >= 0 ? 3 - rightUpcomingIndex : 0;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });

  return sorted.slice(0, count).map((track) => getQueuePatchTrackId(track));
}

export function selectTracksForDirection(input: {
  targetDirection?: DJDirectingDecision["targetDirection"];
  userIntent?: string;
  currentTrack: Track;
  recentTracks: Track[];
  upcomingTracks: Track[];
  pool: Track[];
  count?: number;
}) {
  const derivedIntent =
    input.userIntent ??
    (input.targetDirection?.language === "中文"
      ? "more_chinese"
      : input.targetDirection?.language
        ? "more_english"
        : input.targetDirection?.energy === "high"
          ? "more_rhythm"
          : input.targetDirection?.energy === "low"
            ? "quieter"
            : input.targetDirection?.mood?.includes("nostalgic")
              ? "nostalgic"
              : "surprise");

  return selectTracksForIntent({
    intent: derivedIntent,
    currentTrack: input.currentTrack,
    recentTracks: input.recentTracks,
    upcomingTracks: input.upcomingTracks,
    pool: input.pool,
    count: input.count,
  });
}

export function ensureQueuePatchForDecision(input: {
  decision: DJDirectingDecision;
  currentTrack: Track;
  recentTracks: Track[];
  upcomingTracks: Track[];
  pool: Track[];
  userIntent?: string;
}) {
  const existingIds = input.decision.queuePatch?.trackIds ?? [];
  const needsPatch =
    input.decision.action === "user_tune" ||
    input.decision.action === "shift_style" ||
    input.decision.action === "raise_energy" ||
    input.decision.action === "lower_energy" ||
    input.decision.action === "insert_discovery";

  if (!needsPatch && existingIds.length) {
    return input.decision;
  }

  const selectorIntent =
    input.decision.action === "raise_energy"
      ? "more_rhythm"
      : input.decision.action === "lower_energy"
        ? "quieter"
        : input.decision.action === "insert_discovery"
          ? "surprise"
          : input.userIntent ??
            input.decision.targetDirection?.language ??
            (input.decision.targetDirection?.energy === "high"
              ? "more_rhythm"
              : input.decision.targetDirection?.energy === "low"
                ? "quieter"
                : "lighter");

  const selectorIds = selectTracksForIntent({
    intent: typeof selectorIntent === "string" ? selectorIntent : "lighter",
    currentTrack: input.currentTrack,
    recentTracks: input.recentTracks,
    upcomingTracks: input.upcomingTracks,
    pool: input.pool,
    count: 5,
  });

  const mergedTrackIds = [...existingIds, ...selectorIds.filter((trackId) => !existingIds.includes(trackId))].slice(0, 5);
  const immediate = isImmediateTuneIntent(input.userIntent);

  if (!needsPatch || !mergedTrackIds.length) {
    return input.decision;
  }

  const mode: NonNullable<DJDirectingDecision["queuePatch"]>["mode"] =
    immediate
      ? "skip_now"
      : input.decision.action === "insert_discovery"
        ? "insert_after_current"
        : "reorder_upcoming";
  return {
    ...input.decision,
    action: immediate ? "skip_to_next" : input.decision.action,
    queuePatch: {
      mode: immediate ? "skip_now" : (input.decision.queuePatch?.mode ?? mode),
      trackIds: mergedTrackIds,
      explanation: input.decision.queuePatch?.explanation ?? "Selector fallback applied to keep the upcoming block actionable.",
    },
  };
}
