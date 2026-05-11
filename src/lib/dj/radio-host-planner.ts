import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import { DJ_PERSONA_SYSTEM_PROMPT } from "./dj-persona";
import { getFewShotsForPattern } from "./corpus/radio-host-fewshots";
import { RADIO_HOST_NEGATIVE_EXAMPLES } from "./corpus/radio-host-negative-examples";
import {
  RADIO_HOST_PATTERNS,
  getRadioHostPatternDefinition,
  type RadioHostPattern,
} from "./corpus/radio-host-patterns";
import type { SongBrief } from "./song-brief-service";

export type TalkBreakPlan = {
  pattern: RadioHostPattern;
  purpose: string;
  requiredAnchors: Array<
    | "time"
    | "current_song"
    | "previous_song"
    | "next_song"
    | "artist"
    | "album"
    | "lyric"
    | "sound_detail"
    | "era"
    | "listener_scene"
  >;
  sourceMaterialNeeded: string[];
};

export type TalkBreakPlanInput = {
  event: "opening" | "introduce_current" | "bridge_to_next" | "user_tune" | "shift_style" | "outro";
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  currentSongBrief: SongBrief;
  previousSongBrief?: SongBrief | null;
  nextSongBrief?: SongBrief | null;
  recentLines: string[];
  failureReason?: string;
};

function buildFallbackPlan(input: TalkBreakPlanInput): TalkBreakPlan {
  const sourceQuality = input.currentSongBrief.sourceQuality ?? (input.currentSongBrief.factsInsufficient ? "thin" : "partial");

  if (input.event === "opening") {
    return {
      pattern: sourceQuality === "thin" ? "time_check" : "station_id",
      purpose: "像真正开场那样先建立播出感，再落到第一首歌和本段主题。",
      requiredAnchors: ["time", "current_song", "artist"],
      sourceMaterialNeeded: ["currentSongBrief", "timeOfDay", "current segment theme"],
    };
  }

  if (input.event === "bridge_to_next" || input.event === "user_tune" || input.event === "shift_style") {
    return {
      pattern: "emotional_bridge",
      purpose: "说明上一首留下了什么、下一首会怎样变化，以及为什么这样接。",
      requiredAnchors: ["previous_song", "next_song", "sound_detail"],
      sourceMaterialNeeded: ["previousSongBrief", "nextSongBrief", "soundProfile", "transition reason"],
    };
  }

  if (sourceQuality === "thin") {
    return {
      pattern: "sound_description",
      purpose: "资料不够时只讲具体听感，不讲虚构背景。",
      requiredAnchors: ["current_song", "sound_detail"],
      sourceMaterialNeeded: ["currentSongBrief.soundProfile", "currentSongBrief.talkAngles"],
    };
  }

  if (input.currentSongBrief.verifiedFacts?.some((fact) => /专辑|收录|合作|发行|年份/.test(fact))) {
    return {
      pattern: "song_background",
      purpose: "用可核实的歌曲事实介绍当前曲目。",
      requiredAnchors: ["current_song", "artist", "album"],
      sourceMaterialNeeded: ["currentSongBrief.verifiedFacts", "currentSongBrief.albumBrief", "currentSongBrief.artistBrief"],
    };
  }

  return {
    pattern: "artist_context",
    purpose: "从歌手声音和身份切入当前歌曲。",
    requiredAnchors: ["current_song", "artist", "sound_detail"],
    sourceMaterialNeeded: ["currentSongBrief.artistBrief", "currentSongBrief.soundProfile"],
  };
}

function buildSystemPrompt() {
  return [
    DJ_PERSONA_SYSTEM_PROMPT,
    "你现在不是直接写主持词，你是电台 talk break 的编排员。",
    "你要先选择一个最合适的主持模式，再说明它需要哪些素材。",
    "如果素材不足，就换一个更保守的模式，不要硬编背景故事。",
    "优先使用这些模式：time_check、station_id、story_opening、song_background、artist_context、album_context、lyric_theme、sound_description、back_announce、forward_announce、emotional_bridge、listener_note、memory_lane、era_context、segment_transition、outro。",
    "如果 currentSongBrief.sourceQuality 是 thin，禁止选择 song_background、artist_context、album_context、lyric_theme、era_context 这种依赖事实的模式。",
    `这些是明确禁止的 AI 套话：${RADIO_HOST_NEGATIVE_EXAMPLES.join("；")}`,
    "只输出 JSON，格式必须是 { pattern, purpose, requiredAnchors, sourceMaterialNeeded }。",
  ].join("\n");
}

function buildUserPrompt(input: TalkBreakPlanInput) {
  return JSON.stringify({
    event: input.event,
    timeOfDay: input.timeOfDay,
    currentSongBrief: input.currentSongBrief,
    previousSongBrief: input.previousSongBrief ?? null,
    nextSongBrief: input.nextSongBrief ?? null,
    recentLines: input.recentLines.slice(-10),
    failureReason: input.failureReason ?? null,
    availablePatterns: RADIO_HOST_PATTERNS,
    patternFewShots: RADIO_HOST_PATTERNS.flatMap((item) => getFewShotsForPattern(item.pattern).slice(0, 1)),
    rules: [
      "先选模式，再输出所需素材。",
      "requiredAnchors 至少要有两个。",
      "如果是 bridge_to_next / user_tune，优先 emotional_bridge、forward_announce、back_announce。",
      "如果是 opening，优先 time_check、station_id、story_opening。",
      "如果 currentSongBrief.sourceQuality=thin，优先 sound_description。",
    ],
  });
}

export class RadioHostPlanner {
  private readonly deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured">;

  constructor(input: { deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured"> } = {}) {
    this.deepseekClient = input.deepseekClient;
  }

  async plan(input: TalkBreakPlanInput): Promise<TalkBreakPlan> {
    const configured =
      this.deepseekClient && typeof this.deepseekClient.isConfigured === "function"
        ? this.deepseekClient.isConfigured()
        : false;

    if (!configured || !this.deepseekClient) {
      return buildFallbackPlan(input);
    }

    const response = await this.deepseekClient.chatJson<TalkBreakPlan>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(input),
      temperature: 0.25,
      maxTokens: 500,
    });

    if (!response.ok || !response.data) {
      return buildFallbackPlan(input);
    }

    const fallback = buildFallbackPlan(input);
    const candidate = response.data;
    const patternDefinition = getRadioHostPatternDefinition(candidate.pattern);
    const currentQuality = input.currentSongBrief.sourceQuality ?? (input.currentSongBrief.factsInsufficient ? "thin" : "partial");

    if (!patternDefinition) {
      return fallback;
    }

    if (patternDefinition.avoidWhenSourceThin && currentQuality === "thin") {
      return fallback;
    }

    return {
      pattern: candidate.pattern,
      purpose: candidate.purpose || fallback.purpose,
      requiredAnchors: Array.isArray(candidate.requiredAnchors) && candidate.requiredAnchors.length >= 2
        ? candidate.requiredAnchors
        : patternDefinition.requiredAnchors,
      sourceMaterialNeeded: Array.isArray(candidate.sourceMaterialNeeded) && candidate.sourceMaterialNeeded.length > 0
        ? candidate.sourceMaterialNeeded
        : fallback.sourceMaterialNeeded,
    };
  }
}

export async function createTalkBreakPlan(input: TalkBreakPlanInput) {
  const planner = new RadioHostPlanner();
  return planner.plan(input);
}
