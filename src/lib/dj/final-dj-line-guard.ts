export const ABSOLUTE_BANNED_DJ_LINES = [
  "我先用一首靠近一点的人声把节目接上",
  "靠近一点的人声",
  "把节目接上",
  "后面的亮度和鼓点会慢慢往前推",
  "亮度和鼓点",
  "慢慢往前推",
  "让空气流动一下",
  "让频道透口气",
  "当前这首不打断",
  "下一首开始变",
  "根据你的偏好",
  "为你生成",
  "系统检测",
  "个性化推荐",
  "播放列表",
  "我将为你",
  "以下是",
] as const;

export type BlockedDJLine = {
  line: string;
  reason: string;
};

function normalize(text: string) {
  return text.replace(/[，。！？；：、“”‘’（）()《》【】\[\]…,.!?;:'"\s-]/g, "").trim().toLowerCase();
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

function findReason(line: string) {
  if (!line.trim()) {
    return "empty_line";
  }

  if (/(Current Song|Current Artist|当前歌曲|下一首歌曲)/i.test(line)) {
    return "placeholder_leak";
  }

  const bannedHit = ABSOLUTE_BANNED_DJ_LINES.find((phrase) => similarity(line, phrase) > 0.55 || line.includes(phrase));
  if (bannedHit) {
    return `absolute_banned:${bannedHit}`;
  }

  if (/靠近.{0,6}人声|人声.{0,6}靠近/.test(line)) {
    return "close_vocal_combo";
  }

  if (/接上/.test(line) && /(节目|频道|这一段|这段|这一首|这首)/.test(line)) {
    return "program_connect_template";
  }

  if (/用一.{0,4}(人声|声音).{0,8}接上/.test(line)) {
    return "connective_hosting_template";
  }

  if (/亮度/.test(line) && /鼓点/.test(line) && /(推|往前|走)/.test(line)) {
    return "brightness_drum_push_template";
  }

  if (/播放列表|推荐|偏好|生成|系统/.test(line)) {
    return "ai_system_wording";
  }

  return null;
}

export function guardDJLines(lines: string[]): {
  ok: boolean;
  safeLines: string[];
  blockedLines: BlockedDJLine[];
} {
  const safeLines: string[] = [];
  const blockedLines: BlockedDJLine[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const reason = findReason(line);
    if (reason) {
      blockedLines.push({ line, reason });
      continue;
    }

    safeLines.push(line);
  }

  return {
    ok: blockedLines.length === 0 && safeLines.length > 0,
    safeLines,
    blockedLines,
  };
}
