import type { MusicProfileStructured, MusicTrack, ProgramTweak } from "@/lib/types/music";
import { chunkBySections } from "@/lib/utils/collections";
import { parsePromptIntent } from "@/lib/utils/prompt-intent";

export type SectionKey = "opening" | "build" | "lift" | "settle" | "outro";

export type PlannedTrack = {
  track: MusicTrack;
  score: number;
  section: SectionKey;
  reason: string;
};

const sectionRatios: Array<{ key: SectionKey; ratio: number }> = [
  { key: "opening", ratio: 1.2 },
  { key: "build", ratio: 2.2 },
  { key: "lift", ratio: 2.3 },
  { key: "settle", ratio: 1.8 },
  { key: "outro", ratio: 1.1 },
];

const femaleVocalArtists = ["白柠", "李千语", "许可念", "Nora Line", "Iris Vale"];

function tagsOf(track: MusicTrack): string[] {
  return [...(track.moodTags ?? []), ...(track.styleTags ?? [])];
}

function hasAnyTag(track: MusicTrack, patterns: string[]): boolean {
  const source = tagsOf(track).join(" ");
  return patterns.some((pattern) => source.toLowerCase().includes(pattern.toLowerCase()));
}

function isFemaleVocalTrack(track: MusicTrack): boolean {
  const rawGender = String((track.rawMeta?.vocalGender as string | undefined) ?? "").toLowerCase();
  if (rawGender === "female") {
    return true;
  }

  if (hasAnyTag(track, ["女声", "female vocal", "female"])) {
    return true;
  }

  return femaleVocalArtists.some((artist) => track.artist.includes(artist));
}

function isCityNightTrack(track: MusicTrack): boolean {
  return hasAnyTag(track, ["城市", "深夜", "雨夜", "夜行", "通勤", "City Pop", "Lo-fi", "霓虹"]);
}

function baseScore(track: MusicTrack, profile: MusicProfileStructured): number {
  let score = 0;

  if (profile.topArtists.some((artist) => track.artist.includes(artist))) {
    score += 2.4;
  }

  if (profile.languages.includes(track.language ?? "")) {
    score += 1.4;
  }

  if (profile.eras.includes(track.era ?? "")) {
    score += 1.2;
  }

  const moodHit = (track.moodTags ?? []).filter((mood) => profile.moods.includes(mood)).length;
  score += moodHit * 0.85;

  const keywordHit = tagsOf(track).filter((value) => profile.keywords.includes(value)).length;
  score += keywordHit * 0.65;

  score += Math.min(2.2, (track.playCount ?? 0) / 30);
  return score;
}

function promptScore(track: MusicTrack, userPrompt: string): number {
  const intent = parsePromptIntent(userPrompt);
  let score = 0;

  if (intent.preferredLanguage && intent.preferredLanguage === track.language) {
    score += 1.4;
  }

  if (
    intent.preferredEra &&
    (track.era?.includes(intent.preferredEra) || String(track.releasedYear ?? "").includes(intent.preferredEra))
  ) {
    score += 1.3;
  }

  const moodTags = track.moodTags ?? [];
  for (const mood of intent.targetMoods) {
    if (moodTags.some((tag) => tag.includes(mood) || mood.includes(tag))) {
      score += 1.2;
    }
  }

  const searchable = `${track.name} ${track.artist} ${track.album ?? ""} ${tagsOf(track).join(" ")}`.toLowerCase();
  for (const keyword of intent.keywords) {
    if (searchable.includes(keyword.toLowerCase())) {
      score += 0.5;
    }
  }

  return score;
}

function tweakScore(track: MusicTrack, tweak?: ProgramTweak): number {
  if (!tweak) {
    return 0;
  }

  switch (tweak) {
    case "less_sad": {
      const sadHit = hasAnyTag(track, ["丧", "悲", "痛", "失落", "慢"]);
      if (sadHit) {
        return -2;
      }

      return track.energyLevel === "medium" || track.energyLevel === "medium-high" ? 0.8 : 0.1;
    }
    case "more_nostalgic": {
      const nostalgicHit =
        (track.era ?? "").includes("2000") || hasAnyTag(track, ["怀旧", "回忆", "旧", "磁带", "颗粒"]);
      return nostalgicHit ? 1.8 : 0;
    }
    case "more_rhythm": {
      const rhythmHit = hasAnyTag(track, ["律动", "电子", "Synth", "Dance", "Funk", "R&B"]);
      if (track.energyLevel === "high" || track.energyLevel === "medium-high") {
        return rhythmHit ? 1.8 : 1.3;
      }
      return rhythmHit ? 0.8 : -0.2;
    }
    case "more_female_vocal":
      return isFemaleVocalTrack(track) ? 2 : -0.25;
    case "more_city_night":
      return isCityNightTrack(track) ? 1.7 : -0.2;
    case "more_chinese":
      return track.language === "中文" ? 1.8 : -0.2;
    case "fit_work": {
      const workHit = hasAnyTag(track, ["专注", "工作", "低打扰", "留白", "通勤"]);
      const stableEnergy = track.energyLevel === "low" || track.energyLevel === "medium-low" || track.energyLevel === "medium";
      return workHit ? 1.8 : stableEnergy ? 0.6 : -0.3;
    }
    case "fit_drive": {
      const driveHit = hasAnyTag(track, ["开车", "自驾", "路上", "夜行", "通勤"]);
      const movingEnergy = track.energyLevel === "medium" || track.energyLevel === "medium-high" || track.energyLevel === "high";
      return driveHit ? 1.8 : movingEnergy ? 0.7 : -0.4;
    }
    default:
      return 0;
  }
}

function sectionReason(section: SectionKey): string {
  switch (section) {
    case "opening":
      return "开场先把耳朵带进当下，情绪不急着推进。";
    case "build":
      return "这段负责铺垫，让状态从分散慢慢聚拢。";
    case "lift":
      return "中段抬升，给这期节目一个清晰峰值。";
    case "settle":
      return "后段回收，把情绪留在可呼吸的位置。";
    case "outro":
      return "收尾留白，结束后仍有一点余韵。";
    default:
      return "匹配当前段落。";
  }
}

function uniqueByTrackId(input: MusicTrack[]): MusicTrack[] {
  const seen = new Set<string>();
  const output: MusicTrack[] = [];
  for (const track of input) {
    if (seen.has(track.id)) {
      continue;
    }
    seen.add(track.id);
    output.push(track);
  }
  return output;
}

function diversifyByArtist(tracks: Array<{ track: MusicTrack; score: number }>, take: number) {
  const output: Array<{ track: MusicTrack; score: number }> = [];
  const artistCount = new Map<string, number>();

  for (const item of tracks) {
    if (output.length >= take) {
      break;
    }

    const count = artistCount.get(item.track.artist) ?? 0;
    if (count >= 2) {
      continue;
    }

    artistCount.set(item.track.artist, count + 1);
    output.push(item);
  }

  if (output.length < take) {
    for (const item of tracks) {
      if (output.length >= take) {
        break;
      }
      if (output.some((selected) => selected.track.id === item.track.id)) {
        continue;
      }
      output.push(item);
    }
  }

  return output;
}

function continuityScore(a: MusicTrack, b: MusicTrack): number {
  const aTags = new Set(tagsOf(a));
  const bTags = new Set(tagsOf(b));
  let overlap = 0;
  for (const tag of aTags) {
    if (bTags.has(tag)) {
      overlap += 1;
    }
  }

  const languageBonus = a.language && b.language && a.language === b.language ? 0.5 : 0;
  const eraBonus = a.era && b.era && a.era === b.era ? 0.35 : 0;

  const energyRank = { low: 1, "medium-low": 2, medium: 3, "medium-high": 4, high: 5 } as const;
  const aEnergy = energyRank[a.energyLevel ?? "medium"];
  const bEnergy = energyRank[b.energyLevel ?? "medium"];
  const energyPenalty = Math.abs(aEnergy - bEnergy) * 0.25;

  return overlap + languageBonus + eraBonus - energyPenalty;
}

function arrangeWithinSection(items: Array<{ track: MusicTrack; score: number }>): Array<{ track: MusicTrack; score: number }> {
  if (items.length <= 2) {
    return items;
  }

  const pool = [...items];
  pool.sort((a, b) => b.score - a.score);

  const arranged: Array<{ track: MusicTrack; score: number }> = [pool.shift() as { track: MusicTrack; score: number }];

  while (pool.length) {
    const last = arranged[arranged.length - 1];
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const value = continuityScore(last.track, candidate.track) + candidate.score * 0.08;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    arranged.push(pool.splice(bestIndex, 1)[0]);
  }

  return arranged;
}

export function arrangeProgramByRules(input: {
  tracks: MusicTrack[];
  userPrompt: string;
  profile: MusicProfileStructured;
  desiredTrackCount: number;
  tweak?: ProgramTweak;
  avoidTrackIds?: string[];
}): PlannedTrack[] {
  const deduped = uniqueByTrackId(input.tracks);
  const avoidSet = new Set(input.avoidTrackIds ?? []);

  const scored = deduped
    .map((track) => {
      let score = baseScore(track, input.profile) + promptScore(track, input.userPrompt);
      score += tweakScore(track, input.tweak);

      if (avoidSet.has(track.id)) {
        score -= 1.1;
      }

      return { track, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = diversifyByArtist(scored, Math.min(input.desiredTrackCount, scored.length));
  const sections = chunkBySections(selected, sectionRatios);
  const planned: PlannedTrack[] = [];

  for (const section of sections) {
    const ordered = arrangeWithinSection(section.items);
    for (const item of ordered) {
      planned.push({
        track: item.track,
        score: item.score,
        section: section.key,
        reason: sectionReason(section.key),
      });
    }
  }

  return planned;
}
