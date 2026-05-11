import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import { DJ_PERSONA_SYSTEM_PROMPT } from "./dj-persona";
import { DJ_BANNED_PHRASES } from "./dj-banned-phrases";
import { getFewShotsForPattern } from "./corpus/radio-host-fewshots";
import { RADIO_HOST_NEGATIVE_EXAMPLES } from "./corpus/radio-host-negative-examples";
import { getRadioHostPatternDefinition, type RadioHostPattern } from "./corpus/radio-host-patterns";
import { getStorySeeds } from "./story-seeds";
import type { DJDirectorContext, DJDirectorTrigger } from "./dj-types";
import type { SongBrief } from "./song-brief-service";
import type { TalkBreakPlan } from "./radio-host-planner";

export type PatternStructure =
  | "scene_to_song"
  | "aftertaste_to_next"
  | "fact_to_emotion"
  | "theme_to_song"
  | "life_note_to_music";

export type TalkBreakSelfCritique = {
  radioLike: boolean;
  tooAnnouncing: boolean;
  tooGeneric: boolean;
  hasListenerAddress: boolean;
  hasNarrative: boolean;
  usesConcreteMusicDetail: boolean;
};

export type TalkBreakCandidate = {
  lines: string[];
  selfCritique: TalkBreakSelfCritique;
};

export type TalkBreakScript = {
  pattern: RadioHostPattern;
  patternStructure?: PatternStructure;
  lines: string[];
  usedAnchors: string[];
  usedFacts: string[];
  usedAngles: Array<
    "song_background" | "artist_story" | "album_context" | "lyric_theme" | "sound_detail" | "era_memory" | "transition"
  >;
  avoidedBecause?: string[];
  confidence: "high" | "medium" | "low";
  qualityNotes: string;
  radioLikenessScore?: number;
  candidates?: TalkBreakCandidate[];
  selectedIndex?: number;
  rawPrompt?: string;
  rawResponse?: string;
};

type TalkBreakWriterResponse = {
  candidates: TalkBreakCandidate[];
  selectedIndex: number;
  final: {
    patternStructure: PatternStructure;
    lines: string[];
    usedAnchors: string[];
    usedFacts: string[];
    usedAngles?: Array<
      "song_background" | "artist_story" | "album_context" | "lyric_theme" | "sound_detail" | "era_memory" | "transition"
    >;
    radioLikenessScore: number;
    confidence?: "high" | "medium" | "low";
    qualityNotes?: string;
  };
};

function isTalkBreakWriterResponse(input: TalkBreakWriterResponse | TalkBreakScript): input is TalkBreakWriterResponse {
  return "final" in input;
}

function suggestedStructures(trigger: DJDirectorTrigger, pattern: RadioHostPattern): PatternStructure[] {
  if (trigger === "opening") {
    return ["theme_to_song", "scene_to_song", "life_note_to_music"];
  }
  if (trigger === "bridge_to_next" || trigger === "user_tune" || trigger === "shift_style") {
    return ["aftertaste_to_next", "scene_to_song", "life_note_to_music"];
  }
  if (pattern === "song_background" || pattern === "artist_context" || pattern === "album_context") {
    return ["fact_to_emotion", "theme_to_song", "life_note_to_music"];
  }
  return ["life_note_to_music", "scene_to_song", "aftertaste_to_next"];
}

function buildSystemPrompt() {
  return [
    DJ_PERSONA_SYSTEM_PROMPT,
    "你现在要做三件事：先写 3 个候选 talk break，再像审稿人一样自评，最后选出最像电台的一版。",
    "你不是报幕员，不是歌单讲解员，不是功能提示器。",
    "你必须先服从 selectedPattern 和 patternStructure，再用 SongBrief 写。",
    "不要离开 SongBrief 自由发挥事实。",
    "不要把歌曲信息写成标签串，不要把主持词写成‘这首是什么、下一首是什么’。",
    "如果 sourceQuality=thin，只能讲具体听感和转场，不能讲发行背景、录音故事、年代轶事。",
    `禁句：${DJ_BANNED_PHRASES.join("；")}`,
    `负面示例：${RADIO_HOST_NEGATIVE_EXAMPLES.join("；")}`,
    "每个候选 1 到 4 句，每句不超过 30 个中文字。",
    "至少一个候选要带一点听众对象感，但不能鸡汤。",
    "只输出 JSON，格式必须是 { candidates, selectedIndex, final }。",
  ].join("\n");
}

function buildUserPrompt(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  plan: TalkBreakPlan;
  currentSongBrief: SongBrief;
  previousSongBrief?: SongBrief | null;
  nextSongBrief?: SongBrief | null;
  selectedTargetBriefs?: SongBrief[];
  transition?: { from: string; to: string; why: string } | null;
  failureReason?: string;
  originalLines?: string[];
}) {
  const patternDefinition = getRadioHostPatternDefinition(input.plan.pattern);
  return JSON.stringify({
    trigger: input.trigger,
    timeOfDay: input.context.timeOfDay,
    currentSegment: input.context.currentSegment,
    userIntent: input.context.userIntent ?? null,
    selectedPattern: input.plan.pattern,
    patternDefinition,
    suggestedPatternStructures: suggestedStructures(input.trigger, input.plan.pattern),
    talkBreakPlan: input.plan,
    currentSongBrief: input.currentSongBrief,
    previousSongBrief: input.previousSongBrief ?? null,
    nextSongBrief: input.nextSongBrief ?? null,
    selectedTargetBriefs: input.selectedTargetBriefs ?? [],
    transition: input.transition ?? null,
    storySeeds: getStorySeeds(input.context.timeOfDay),
    recentLines: input.context.recentLines?.slice(-10) ?? [],
    failureReason: input.failureReason ?? null,
    originalLines: input.originalLines ?? [],
    fewShots: getFewShotsForPattern(input.plan.pattern),
    rules: [
      "先写 3 个候选。",
      "每个候选都要自评是不是像电台、是不是像报幕。",
      "final 必须选出最像电台的一版。",
      "final.patternStructure 必须是 scene_to_song / aftertaste_to_next / fact_to_emotion / theme_to_song / life_note_to_music 之一。",
      "usedAnchors 只写你真的用到的 anchors。",
      "usedFacts 只写你真的引用的事实或具体听感。",
      "radioLikenessScore 是你作为审稿人的自评分，0-100。",
      "如果是 opening，要先建立场景和频道感，再自然落到音乐。",
      "如果是 bridge_to_next / user_tune，要把上一段余味和下一段变化说清楚，不要报幕。",
      "如果 sourceQuality=thin，不要讲背景故事。",
      "不要每句都报歌名。",
    ],
  });
}

function coerceFinal(input: TalkBreakWriterResponse | TalkBreakScript, plan: TalkBreakPlan): TalkBreakScript {
  if (isTalkBreakWriterResponse(input) && input.final) {
    return {
      pattern: plan.pattern,
      patternStructure: input.final.patternStructure,
      lines: Array.isArray(input.final.lines) ? input.final.lines : [],
      usedAnchors: Array.isArray(input.final.usedAnchors) ? input.final.usedAnchors : [],
      usedFacts: Array.isArray(input.final.usedFacts) ? input.final.usedFacts : [],
      usedAngles: Array.isArray(input.final.usedAngles) ? input.final.usedAngles : [],
      avoidedBecause: [],
      confidence: input.final.confidence ?? "medium",
      qualityNotes: input.final.qualityNotes ?? "",
      radioLikenessScore: input.final.radioLikenessScore,
      candidates: Array.isArray(input.candidates) ? input.candidates : [],
      selectedIndex: typeof input.selectedIndex === "number" ? input.selectedIndex : 0,
    };
  }

  const script = input as TalkBreakScript;
  return {
    pattern: script.pattern || plan.pattern,
    patternStructure: script.patternStructure,
    lines: Array.isArray(script.lines) ? script.lines : [],
    usedAnchors: Array.isArray(script.usedAnchors) ? script.usedAnchors : [],
    usedFacts: Array.isArray(script.usedFacts) ? script.usedFacts : [],
    usedAngles: Array.isArray(script.usedAngles) ? script.usedAngles : [],
    avoidedBecause: Array.isArray(script.avoidedBecause) ? script.avoidedBecause : [],
    confidence: script.confidence ?? "medium",
    qualityNotes: script.qualityNotes ?? "",
    radioLikenessScore: script.radioLikenessScore,
    candidates: Array.isArray(script.candidates) ? script.candidates : [],
    selectedIndex: typeof script.selectedIndex === "number" ? script.selectedIndex : 0,
  };
}

export class RadioHostWriter {
  private readonly deepseekClient: Pick<DeepSeekClient, "chatJson" | "isConfigured">;

  constructor(input: { deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured"> } = {}) {
    this.deepseekClient = input.deepseekClient ?? new DeepSeekClient();
  }

  async write(input: {
    trigger: DJDirectorTrigger;
    context: DJDirectorContext;
    plan: TalkBreakPlan;
    currentSongBrief: SongBrief;
    previousSongBrief?: SongBrief | null;
    nextSongBrief?: SongBrief | null;
    selectedTargetBriefs?: SongBrief[];
    transition?: { from: string; to: string; why: string } | null;
    failureReason?: string;
    originalLines?: string[];
  }): Promise<TalkBreakScript> {
    const configured = typeof this.deepseekClient.isConfigured === "function" ? this.deepseekClient.isConfigured() : true;
    if (!configured) {
      return {
        pattern: input.plan.pattern,
        lines: [],
        usedAnchors: [],
        usedFacts: [],
        usedAngles: [],
        avoidedBecause: ["DeepSeek unavailable for host writing."],
        confidence: "low",
        qualityNotes: "DeepSeek unavailable for host writing.",
        candidates: [],
        selectedIndex: 0,
      };
    }

    const rawPrompt = buildUserPrompt(input);
    const response = await this.deepseekClient.chatJson<TalkBreakWriterResponse | TalkBreakScript>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: rawPrompt,
      temperature: input.failureReason ? 0.38 : 0.7,
      maxTokens: 1400,
    });

    if (!response.ok || !response.data) {
      return {
        pattern: input.plan.pattern,
        lines: [],
        usedAnchors: [],
        usedFacts: [],
        usedAngles: [],
        avoidedBecause: [response.error?.message ?? "Host writer failed."],
        confidence: "low",
        qualityNotes: response.error?.message ?? "Host writer failed.",
        candidates: [],
        selectedIndex: 0,
        rawPrompt,
        rawResponse: response.rawText,
      };
    }

    const final = coerceFinal(response.data, input.plan);
    return {
      ...final,
      rawPrompt,
      rawResponse: response.rawText,
    };
  }
}
