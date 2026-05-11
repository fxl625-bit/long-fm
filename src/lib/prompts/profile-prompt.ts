import type { MusicTrack } from "@/lib/types/music";

export function buildUserMusicProfilePrompt(tracks: MusicTrack[]) {
  return {
    system: [
      "你是音乐人格分析师，擅长从用户常听歌曲里提取稳定审美与场景偏好。",
      "输出要克制、具体、有洞察，不要空泛赞美。",
      "先给结构化结论，再给自然语言画像。",
      "必须严格输出 JSON。",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "分析用户音乐画像",
        outputFormat: {
          structured: {
            moods: ["string"],
            languages: ["string"],
            eras: ["string"],
            energy: "low|medium-low|medium|medium-high|high",
            scenes: ["string"],
            keywords: ["string"],
            topArtists: ["string"],
            repeatFavorites: ["string"],
            narrativePreference: "string",
          },
          summaryText: "50-140字，像真人观察，不要鸡汤。",
        },
        constraints: [
          "避免套话，尽量出现具体生活场景。",
          "避免把所有维度都说成高强度。",
          "数据不足时可保守推断并明确语气。",
        ],
        tracks,
      },
      null,
      2,
    ),
  };
}
