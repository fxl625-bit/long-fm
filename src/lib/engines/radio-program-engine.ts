import { buildArrangementPrompt } from "@/lib/prompts/arrangement-prompt";
import { buildHostCopyPrompt } from "@/lib/prompts/host-copy-prompt";
import { resolveHostStyleTemplate } from "@/lib/prompts/host-style-templates";
import { buildThemePlanningPrompt } from "@/lib/prompts/theme-planning-prompt";
import { createAIProvider } from "@/lib/providers/ai";
import type { MusicProfileStructured, MusicTrack, ProgramTweak } from "@/lib/types/music";
import type { GeneratedProgram } from "@/lib/types/radio";
import { arrangeProgramByRules } from "./radio-arrangement-strategy";

type ThemePlan = {
  theme: string;
  subtitle: string;
  moodTarget: string;
  targetEnergyCurve: string[];
  selectionRules: string[];
  exclusionRules: string[];
  desiredTrackCount: number;
};

type ArrangementPlan = {
  arrangementLogic: string;
  tracks: Array<{
    trackId: string;
    section: "opening" | "build" | "lift" | "settle" | "outro";
    reason: string;
  }>;
};

type HostCopyPlan = {
  title: string;
  subtitle: string;
  vibeDescription: string;
  introText: string;
  outroText: string;
  transitions: Array<{ trackId: string; transition: string }>;
  posterCopy: string;
};

function normalizeTrackCount(value: number | undefined): number {
  if (!value) {
    return 12;
  }
  return Math.max(10, Math.min(20, value));
}

function fallbackThemePlan(userPrompt: string, desiredTrackCount: number): ThemePlan {
  return {
    theme: `Flowmate 编排：${userPrompt.slice(0, 16)}`,
    subtitle: "基于你的收藏偏好生成的一组可连续播放节目流",
    moodTarget: "克制但不沉闷",
    targetEnergyCurve: ["opening", "build", "lift", "settle", "outro"],
    selectionRules: ["优先高偏好歌曲", "保持风格连续", "控制歌手重复"],
    exclusionRules: ["避免情绪断裂", "避免中后段突然降能量"],
    desiredTrackCount,
  };
}

function fallbackHostCopy(input: {
  theme: string;
  subtitle: string;
  tracks: Array<{ id: string; name: string; section: string }>;
}): HostCopyPlan {
  return {
    title: input.theme,
    subtitle: input.subtitle,
    vibeDescription: "这期先稳住听感，再在中段抬起一点推进力，最后留出安静余韵。",
    introText: "这轮我先用你最熟悉的口味开场，再慢慢把节奏推上去。",
    outroText: "这期先放到这里。你如果要更轻快或更怀旧，我可以马上再来一版。",
    posterCopy: "把喜欢的歌，排成更顺耳的一期节目。",
    transitions: input.tracks.map((item, index) => ({
      trackId: item.id,
      transition:
        index === 0
          ? `先从《${item.name}》开始，把耳朵放进这一轮节奏。`
          : `下一首《${item.name}》，继续这段${item.section === "lift" ? "上扬" : "流动"}。`,
    })),
  };
}

export async function generateRadioProgram(input: {
  userPrompt: string;
  tracks: MusicTrack[];
  profile: MusicProfileStructured;
  desiredTrackCount?: number;
  tweak?: ProgramTweak;
  styleId?: string;
  avoidTrackIds?: string[];
}): Promise<GeneratedProgram> {
  const desiredTrackCount = normalizeTrackCount(input.desiredTrackCount);
  const ai = createAIProvider();

  let themePlan = fallbackThemePlan(input.userPrompt, desiredTrackCount);

  const themePrompt = buildThemePlanningPrompt({
    userPrompt: input.userPrompt,
    profile: input.profile,
    tweak: input.tweak,
  });

  try {
    const aiTheme = await ai.generateJson<ThemePlan>({
      jsonSchemaName: "ThemePlan",
      temperature: 0.65,
      messages: [
        { role: "system", content: themePrompt.system },
        { role: "user", content: themePrompt.user },
      ],
    });

    themePlan = {
      ...themePlan,
      ...aiTheme,
      desiredTrackCount: normalizeTrackCount(aiTheme.desiredTrackCount),
    };
  } catch {
    // fallback theme
  }

  const plannedTracks = arrangeProgramByRules({
    tracks: input.tracks,
    userPrompt: input.userPrompt,
    profile: input.profile,
    desiredTrackCount: themePlan.desiredTrackCount,
    tweak: input.tweak,
    avoidTrackIds: input.avoidTrackIds,
  });

  let arrangement: ArrangementPlan = {
    arrangementLogic: "按进入-铺垫-抬升-回收-留白分段，保持段内连续与段间自然过渡。",
    tracks: plannedTracks.map((item) => ({
      trackId: item.track.id,
      section: item.section,
      reason: item.reason,
    })),
  };

  const arrangementPrompt = buildArrangementPrompt({
    userPrompt: input.userPrompt,
    profile: input.profile,
    candidates: plannedTracks.map((item) => ({
      ...item.track,
      sourceReason: item.reason,
      score: item.score,
    })),
    desiredTrackCount: themePlan.desiredTrackCount,
  });

  try {
    const aiArrangement = await ai.generateJson<ArrangementPlan>({
      jsonSchemaName: "ArrangementPlan",
      temperature: 0.45,
      messages: [
        { role: "system", content: arrangementPrompt.system },
        { role: "user", content: arrangementPrompt.user },
      ],
    });

    const validTrackIds = new Set(plannedTracks.map((item) => item.track.id));
    const filtered = (aiArrangement.tracks ?? []).filter((item) => validTrackIds.has(item.trackId));
    if (filtered.length >= Math.min(8, themePlan.desiredTrackCount)) {
      arrangement = {
        arrangementLogic: aiArrangement.arrangementLogic || arrangement.arrangementLogic,
        tracks: filtered.slice(0, themePlan.desiredTrackCount),
      };
    }
  } catch {
    // fallback arrangement
  }

  const arrangementTracks = arrangement.tracks
    .map((item) => {
      const found = plannedTracks.find((track) => track.track.id === item.trackId);
      if (!found) {
        return null;
      }
      return {
        track: found.track,
        section: item.section,
        reason: item.reason || found.reason,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const style = resolveHostStyleTemplate(input.styleId);
  const hostPrompt = buildHostCopyPrompt({
    style,
    theme: themePlan.theme,
    subtitle: themePlan.subtitle,
    arrangementLogic: arrangement.arrangementLogic,
    tracks: arrangementTracks,
  });

  let hostCopy = fallbackHostCopy({
    theme: themePlan.theme,
    subtitle: themePlan.subtitle,
    tracks: arrangementTracks.map((item) => ({
      id: item.track.id,
      name: item.track.name,
      section: item.section,
    })),
  });

  try {
    const aiHostCopy = await ai.generateJson<HostCopyPlan>({
      jsonSchemaName: "HostCopyPlan",
      temperature: 0.7,
      messages: [
        { role: "system", content: hostPrompt.system },
        { role: "user", content: hostPrompt.user },
      ],
    });

    if (aiHostCopy?.title && aiHostCopy?.introText && aiHostCopy?.outroText) {
      hostCopy = {
        ...hostCopy,
        ...aiHostCopy,
      };
    }
  } catch {
    // fallback host copy
  }

  const transitionMap = new Map(hostCopy.transitions.map((item) => [item.trackId, item.transition]));

  return {
    prompt: input.userPrompt,
    theme: themePlan.theme,
    mood: themePlan.moodTarget,
    title: hostCopy.title,
    subtitle: hostCopy.subtitle,
    vibeDescription: hostCopy.vibeDescription,
    arrangementLogic: arrangement.arrangementLogic,
    introText: hostCopy.introText,
    outroText: hostCopy.outroText,
    hostTone: style.name,
    posterCopy: hostCopy.posterCopy,
    tracks: arrangementTracks.map((item, index) => ({
      trackId: item.track.id,
      position: index + 1,
      reason: item.reason,
      transition: transitionMap.get(item.track.id) ?? `下一首《${item.track.name}》，继续这段节目的流动。`,
      section: item.section,
    })),
    tracksDetailed: arrangementTracks.map((item) => ({
      track: item.track,
      reason: item.reason,
      transition: transitionMap.get(item.track.id) ?? `下一首《${item.track.name}》，继续这段节目的流动。`,
      section: item.section,
    })),
  };
}
