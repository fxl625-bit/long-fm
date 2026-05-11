import type { MusicProfileStructured, MusicTrack } from "@/lib/types/music";

export type DJScriptMode = "opening" | "transition" | "manual";

export type DJScriptInput = {
  mode: DJScriptMode;
  currentTrack: MusicTrack | null;
  nextTrack?: MusicTrack | null;
  queueReason?: string;
  profile?: MusicProfileStructured | null;
  historyCount?: number;
};

export type DJScriptOutput = {
  text: string;
  keywords: string[];
};

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) {
    throw new Error("Cannot pick from empty array");
  }
  return arr[Math.abs(seed) % arr.length];
}

function createSeed(parts: Array<string | number | undefined>): number {
  return parts.join("|").split("").reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);
}

function toEnergyHint(track?: MusicTrack | null): string {
  if (!track?.energyLevel) {
    return "先把气氛放稳一点";
  }

  switch (track.energyLevel) {
    case "high":
    case "medium-high":
      return "先把节奏托起来，再慢慢收住";
    case "medium":
      return "先把速度放在舒服区间";
    default:
      return "先把情绪压在轻一点的位置";
  }
}

function compactText(value?: string): string {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function clipSentence(text: string): string {
  const normalized = compactText(text);
  if (normalized.length <= 52) {
    return normalized;
  }
  return `${normalized.slice(0, 50)}…`;
}

export function generateDJScript(input: DJScriptInput): DJScriptOutput {
  const current = input.currentTrack;
  const next = input.nextTrack;
  const profile = input.profile;

  const keywords = [
    current?.name,
    current?.artist,
    next?.name,
    profile?.keywords?.[0],
    profile?.languages?.[0],
    profile?.moods?.[0],
  ].filter((item): item is string => Boolean(item && item.trim()));

  const seed = createSeed([input.mode, current?.id, next?.id, input.historyCount ?? 0]);
  const reasonHint = clipSentence(input.queueReason ?? "");

  if (input.mode === "opening") {
    const templates = [
      `我先帮你从熟悉的节奏开始。${toEnergyHint(current)}，今天这组不会太重。`,
      `开场我先放你最近常回听的质感。${toEnergyHint(current)}，后面再把节奏提半档。`,
      `这组先从顺耳的段落起步。${toEnergyHint(current)}，等你进入状态再加层次。`,
    ];
    return {
      text: pick(templates, seed),
      keywords: keywords.slice(0, 3),
    };
  }

  if (input.mode === "manual") {
    const templates = [
      `收到，我把下一段往你现在的感觉靠。${next ? `接下来会切到 ${next.name}。` : ""}`,
      `这轮我已经微调好了。先保留熟悉感，再做一点变化。`,
      `我先不走大转弯，保持连贯。再慢慢把你要的方向提上来。`,
    ];
    return {
      text: pick(templates, seed),
      keywords: keywords.slice(0, 4),
    };
  }

  const transitionTemplates = [
    `这首先把氛围稳住，下一首我会切到 ${next?.name ?? "更有层次的段落"}。`,
    `你最近常回到这类质感，所以先给熟悉感，后面再提一点变化。`,
    `我把过渡放得更顺一点。${next ? `下一首是 ${next.name}。` : "接下来会往前推一步。"}${reasonHint ? ` ${reasonHint}` : ""}`,
  ];

  return {
    text: pick(transitionTemplates, seed),
    keywords: keywords.slice(0, 4),
  };
}
