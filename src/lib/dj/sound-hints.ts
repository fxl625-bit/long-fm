import type { Track } from "@/lib/radio/radio-types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function lower(text: string) {
  return text.toLowerCase();
}

function containsChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function addIfMatch(hints: string[], haystack: string, patterns: Array<[RegExp, string[]]>) {
  for (const [pattern, values] of patterns) {
    if (pattern.test(haystack)) {
      hints.push(...values);
    }
  }
}

export function inferSoundHintsFromMetadata(input: {
  title?: string;
  artist?: string;
  album?: string;
  tags?: Track["tags"];
}) {
  const hints: string[] = [];
  const rawText = `${input.title ?? ""} ${input.artist ?? ""} ${input.album ?? ""}`;
  const haystack = lower(rawText);

  addIfMatch(hints, haystack, [
    [/(adele|love in the dark)/, ["厚重人声", "慢速", "钢琴感", "情绪较沉", "适合收束"]],
    [/(何真真|彩蝶舞夏)/, ["器乐", "轻旋律", "东方感", "画面感", "适合过渡"]],
    [/(imagine dragons|wake up|bad liar|i bet my life)/, ["鼓点明显", "摇滚流行", "能量更高", "适合提速"]],
    [/(raye|al green|goodbye henry)/, ["复古灵魂感", "人声靠前", "律动松弛", "适合开场或过门"]],
    [/(glass animals|paradise)/, ["低频明显", "合成器层次", "节奏带动感"]],
    [/(piano|instrumental|stripped|acoustic)/, ["钢琴感", "留白更多", "适合放低频道"]],
    [/(jazz|coffee)/, ["松弛", "器乐细节", "适合工作间隙"]],
    [/(rock|drum|beat|electronic|dance)/, ["鼓点明显", "推进感", "适合提速"]],
  ]);

  if (input.tags?.energy === "low") {
    hints.push("慢速", "留白更多");
  }
  if (input.tags?.energy === "high") {
    hints.push("节奏更强", "推进感");
  }
  if (input.tags?.vocal === "instrumental") {
    hints.push("器乐", "更适合过渡");
  }
  if ((input.tags?.language ?? "") === "中文" || containsChinese(rawText)) {
    hints.push("中文旋律线", "咬字更近");
  } else if ((input.tags?.language ?? "") && input.tags?.language !== "中文") {
    hints.push("英文声线", "发音更松");
  }

  if (!hints.length) {
    hints.push("旋律线清楚", "节奏有轮廓");
  }

  return unique(hints).slice(0, 5);
}

export function inferTrackSoundHints(track?: Track | null) {
  if (!track) {
    return [];
  }

  return inferSoundHintsFromMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    tags: track.tags,
  });
}
