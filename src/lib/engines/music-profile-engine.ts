import type { Track } from "@prisma/client";
import { buildUserMusicProfilePrompt } from "@/lib/prompts/profile-prompt";
import { createAIProvider } from "@/lib/providers/ai";
import type { MusicPersonaResult, MusicProfileStructured } from "@/lib/types/music";
import { pickMostFrequent, topNByFrequency } from "@/lib/utils/collections";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";

function inferScenesFromTags(tags: string[]): string[] {
  const scenes = new Set<string>();

  for (const tag of tags) {
    if (tag.includes("深夜") || tag.includes("雨夜") || tag.includes("凌晨") || tag.includes("夜")) {
      scenes.add("深夜");
    }
    if (tag.includes("通勤") || tag.includes("地铁") || tag.includes("上班路")) {
      scenes.add("通勤");
    }
    if (tag.includes("开车") || tag.includes("夜路") || tag.includes("自驾")) {
      scenes.add("开车");
    }
    if (tag.includes("写作") || tag.includes("安静") || tag.includes("留白") || tag.includes("专注")) {
      scenes.add("独处");
    }
    if (tag.includes("工作") || tag.includes("加班")) {
      scenes.add("工作");
    }
  }

  return Array.from(scenes).slice(0, 5);
}

function buildSummary(profile: MusicProfileStructured, metrics: { artistConcentration: number; nightRatio: number }) {
  const topMood = profile.moods.slice(0, 3).join("、");
  const topScene = profile.scenes.slice(0, 3).join("、");
  const topKeywords = profile.keywords.slice(0, 3).join("、");

  const concentrationText =
    metrics.artistConcentration >= 0.38
      ? "你对核心歌手有较高忠诚度，偏好稳定的人声与表达。"
      : "你会主动扩展歌手范围，更在意整体氛围连续而不是单一人设。";

  const nightText =
    metrics.nightRatio >= 0.35
      ? "夜间相关标签占比较高，音乐对你来说也承担情绪整理作用。"
      : "你的场景分布比较均衡，音乐更多承担节奏调节作用。";

  return `你的听歌气质偏向${topMood || "克制"}，常见场景是${topScene || "独处"}。你偏爱${topKeywords || "城市感"}这类有画面感的表达。${concentrationText}${nightText}`;
}

export async function analyzeMusicProfile(tracksFromDb: Track[]): Promise<MusicPersonaResult> {
  const tracks = tracksFromDb.map(mapDbTrackToMusicTrack);

  if (!tracks.length) {
    return {
      structured: {
        moods: ["平静"],
        languages: ["中文"],
        eras: ["2010s"],
        energy: "medium-low",
        scenes: ["独处"],
        keywords: ["留白"],
        topArtists: ["未知"],
        repeatFavorites: [],
        narrativePreference: "偏好克制表达与缓慢推进。",
      },
      summaryText: "当前可分析数据较少，建议先同步喜欢歌曲后再生成更准确画像。",
    };
  }

  const allMoodTags = tracks.flatMap((track) => track.moodTags ?? []);
  const allStyleTags = tracks.flatMap((track) => track.styleTags ?? []);

  const moods = topNByFrequency(allMoodTags, 6);
  const languages = topNByFrequency(tracks.map((track) => track.language ?? "未知"), 3);
  const eras = topNByFrequency(tracks.map((track) => track.era ?? "未知"), 3);
  const topArtists = topNByFrequency(tracks.map((track) => track.artist), 8);
  const repeatFavorites = tracks
    .slice()
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, 6)
    .map((track) => `${track.name} - ${track.artist}`);

  const energies = tracks
    .map((track) => track.energyLevel)
    .filter((item): item is NonNullable<MusicProfileStructured["energy"]> => Boolean(item));
  const energy = pickMostFrequent(energies, "medium-low");

  const keywords = topNByFrequency([...allStyleTags, ...allMoodTags], 8);
  const scenes = inferScenesFromTags([...allMoodTags, ...allStyleTags]);

  const totalPlayCount = tracks.reduce((sum, track) => sum + (track.playCount ?? 0), 0);
  const topArtistPlayCount = tracks
    .filter((track) => topArtists[0] && track.artist === topArtists[0])
    .reduce((sum, track) => sum + (track.playCount ?? 0), 0);
  const artistConcentration = totalPlayCount > 0 ? topArtistPlayCount / totalPlayCount : 0;

  const nightHits = allMoodTags.filter((tag) => tag.includes("夜") || tag.includes("雨夜")).length;
  const nightRatio = allMoodTags.length ? nightHits / allMoodTags.length : 0;

  const structured: MusicProfileStructured = {
    moods: moods.length ? moods : ["平静"],
    languages: languages.length ? languages : ["中文"],
    eras: eras.length ? eras : ["2010s"],
    energy,
    scenes: scenes.length ? scenes : ["独处"],
    keywords: keywords.length ? keywords : ["城市感"],
    topArtists: topArtists.length ? topArtists : ["未知"],
    repeatFavorites,
    narrativePreference:
      energy === "low" || energy === "medium-low"
        ? "偏爱克制留白、慢速推进、情绪后劲型叙事"
        : "偏爱循序抬升、节奏驱动、行动感叙事",
  };

  const ai = createAIProvider();
  const prompt = buildUserMusicProfilePrompt(tracks);

  try {
    const aiResult = await ai.generateJson<MusicPersonaResult>({
      jsonSchemaName: "MusicPersonaResult",
      temperature: 0.45,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });

    if (aiResult?.structured && aiResult?.summaryText) {
      return {
        structured: {
          ...structured,
          ...aiResult.structured,
        },
        summaryText: aiResult.summaryText,
      };
    }
  } catch {
    // fallback summary
  }

  return {
    structured,
    summaryText: buildSummary(structured, { artistConcentration, nightRatio }),
  };
}
