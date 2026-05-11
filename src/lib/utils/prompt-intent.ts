const moodLexicon: Record<string, string[]> = {
  治愈: ["治愈", "放松", "平静", "安静", "舒缓"],
  怀旧: ["怀旧", "回忆", "旧", "2000", "90"],
  深夜: ["深夜", "凌晨", "夜", "夜晚"],
  通勤: ["通勤", "地铁", "上班路", "下班路"],
  开车: ["开车", "自驾", "路上", "高速"],
  下雨天: ["雨", "下雨", "雨天"],
  节奏: ["节奏", "提神", "动起来", "律动"],
  女声: ["女声", "female vocal", "female"],
  城市夜晚: ["城市", "霓虹", "夜行", "city night", "city pop"],
};

export type ParsedPromptIntent = {
  keywords: string[];
  targetMoods: string[];
  preferredLanguage?: "中文" | "英文";
  preferredEra?: string;
  hints: {
    femaleVocal: boolean;
    cityNight: boolean;
  };
};

export function parsePromptIntent(userPrompt: string): ParsedPromptIntent {
  const lower = userPrompt.toLowerCase();

  const targetMoods = Object.entries(moodLexicon)
    .filter(([, words]) => words.some((word) => lower.includes(word.toLowerCase())))
    .map(([mood]) => mood);

  const keywords = userPrompt
    .replace(/[，。！？,.!?]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .slice(0, 10);

  const preferredLanguage = lower.includes("中文") ? "中文" : lower.includes("英文") ? "英文" : undefined;
  const eraMatch = lower.match(/(19\d{2}|20\d{2}|2000s|2010s|2020s)/);

  return {
    keywords,
    targetMoods,
    preferredLanguage,
    preferredEra: eraMatch?.[0],
    hints: {
      femaleVocal: targetMoods.includes("女声"),
      cityNight: targetMoods.includes("城市夜晚") || targetMoods.includes("深夜"),
    },
  };
}
