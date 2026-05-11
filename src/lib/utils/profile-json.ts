import type { MusicProfileStructured } from "@/lib/types/music";

export function parseStructuredProfile(payload: unknown): MusicProfileStructured {
  const object = (payload ?? {}) as Record<string, unknown>;

  const fallback: MusicProfileStructured = {
    moods: ["平静"],
    languages: ["中文"],
    eras: ["2010s"],
    energy: "medium-low",
    scenes: ["独处"],
    keywords: ["城市感"],
    topArtists: ["未知"],
    repeatFavorites: [],
    narrativePreference: "偏好克制表达",
  };

  return {
    moods: Array.isArray(object.moods) ? object.moods.map(String) : fallback.moods,
    languages: Array.isArray(object.languages) ? object.languages.map(String) : fallback.languages,
    eras: Array.isArray(object.eras) ? object.eras.map(String) : fallback.eras,
    energy: (typeof object.energy === "string" ? object.energy : fallback.energy) as MusicProfileStructured["energy"],
    scenes: Array.isArray(object.scenes) ? object.scenes.map(String) : fallback.scenes,
    keywords: Array.isArray(object.keywords) ? object.keywords.map(String) : fallback.keywords,
    topArtists: Array.isArray(object.topArtists) ? object.topArtists.map(String) : fallback.topArtists,
    repeatFavorites: Array.isArray(object.repeatFavorites)
      ? object.repeatFavorites.map(String)
      : fallback.repeatFavorites,
    narrativePreference:
      typeof object.narrativePreference === "string" ? object.narrativePreference : fallback.narrativePreference,
  };
}
