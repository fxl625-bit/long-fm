import type { UserMusicMemory } from "./dj-types";
import { OpenAIDJProvider } from "./openai-dj-provider";
import type { Track } from "@/lib/radio/radio-types";

type BuildMemoryInput = {
  tracks: Track[];
  recentPlayed?: Track[];
  recentSkipped?: Track[];
  enableLLMSummary?: boolean;
};

function topN(values: string[], limit: number): string[] {
  const counter = new Map<string, number>();
  for (const item of values) {
    const key = item.trim();
    if (!key) continue;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function inferEnergyProfile(tracks: Track[]): UserMusicMemory["energyProfile"] {
  if (!tracks.length) {
    return "mixed";
  }
  const energies = tracks.map((track) => track.tags?.energy ?? "medium");
  const low = energies.filter((item) => item === "low").length;
  const high = energies.filter((item) => item === "high").length;
  const medium = energies.length - low - high;

  if (low > medium && low > high) return "low";
  if (high > medium && high > low) return "high";
  if (medium >= low && medium >= high) return "medium";
  return "mixed";
}

function fallbackSummary(memory: UserMusicMemory): string {
  const langs = memory.topLanguages.slice(0, 2).join("、") || "多语种";
  const styles = memory.inferredStyles.slice(0, 2).join("、") || "流行";
  return `你更偏向${memory.energyProfile}能量的${langs}音乐，主风格集中在${styles}，整体偏好先熟悉再轻探索。`;
}

export async function buildUserMusicMemory(input: BuildMemoryInput): Promise<UserMusicMemory> {
  const tracks = input.tracks.slice(0, 200);
  const recentPlayed = input.recentPlayed ?? [];
  const recentSkipped = input.recentSkipped ?? [];

  const topArtists = topN(tracks.map((t) => t.artist), 8);
  const topLanguages = topN(tracks.map((t) => t.tags?.language ?? ""), 4);
  const topEras = topN(tracks.map((t) => t.tags?.era ?? ""), 4);
  const inferredMoods = topN(tracks.flatMap((t) => t.tags?.mood ?? []), 6);
  const inferredStyles = topN(tracks.flatMap((t) => t.tags?.style ?? []), 6);

  const memory: UserMusicMemory = {
    topArtists,
    topLanguages,
    topEras,
    inferredMoods,
    inferredStyles,
    energyProfile: inferEnergyProfile(tracks),
    familiarityPreference: recentPlayed.length > recentSkipped.length ? "familiar_first" : "balanced",
    discoveryTolerance: recentSkipped.length > 8 ? "low" : recentSkipped.length > 3 ? "medium" : "high",
    avoidPatterns: recentSkipped.slice(-5).map((item) => `${item.artist}-${item.title}`),
    favoriteExamples: tracks.slice(0, 10).map((item) => ({
      title: item.title,
      artist: item.artist,
      tags: [...(item.tags?.style ?? []), ...(item.tags?.mood ?? [])].slice(0, 4),
    })),
    timeSlotPreferences: {
      morning: {
        moods: ["清醒", "轻快"],
        styles: inferredStyles.slice(0, 2),
        energy: "medium",
        languages: topLanguages.slice(0, 2),
        notes: "早间避免过于沉重，先熟悉后提速。",
      },
      afternoon: {
        moods: ["稳定", "专注"],
        styles: inferredStyles.slice(0, 2),
        energy: "medium",
        languages: topLanguages.slice(0, 2),
        notes: "工作时保持稳定节奏，不做大跳转。",
      },
      evening: {
        moods: ["放松", "城市感"],
        styles: inferredStyles.slice(0, 3),
        energy: "medium",
        languages: topLanguages.slice(0, 2),
        notes: "下班场景允许少量探索。",
      },
      night: {
        moods: ["舒缓", "怀旧"],
        styles: inferredStyles.slice(0, 2),
        energy: "low",
        languages: topLanguages.slice(0, 2),
        notes: "夜间优先中低能量，避免过激。",
      },
    },
    summary: "",
  };

  if (!input.enableLLMSummary) {
    memory.summary = fallbackSummary(memory);
    return memory;
  }

  try {
    const provider = new OpenAIDJProvider();
    const summary = await provider.generateText(
      [
        {
          role: "system",
          content:
            "你是私人DJ的用户画像总结器。请输出1-2句中文，总结要具体、克制，不提算法，不要空泛。",
        },
        {
          role: "user",
          content: JSON.stringify({
            topArtists: memory.topArtists,
            topLanguages: memory.topLanguages,
            topEras: memory.topEras,
            inferredMoods: memory.inferredMoods,
            inferredStyles: memory.inferredStyles,
            energyProfile: memory.energyProfile,
            familiarityPreference: memory.familiarityPreference,
            discoveryTolerance: memory.discoveryTolerance,
            favorites: memory.favoriteExamples.slice(0, 8),
          }),
        },
      ],
      { temperature: 0.55 },
    );
    memory.summary = summary || fallbackSummary(memory);
  } catch {
    memory.summary = fallbackSummary(memory);
  }

  return memory;
}

