import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import { DJ_BANNED_PHRASES } from "./dj-banned-phrases";
import { DJ_PERSONA_SYSTEM_PROMPT } from "./dj-persona";
import type { DJDirectorContext, DJDirectorTrigger } from "./dj-types";
import type { SongBrief } from "./song-brief-service";

export type RadioHostWriterResult = {
  lines: string[];
  usedFacts: string[];
  usedAngles: Array<
    "song_background" | "artist_story" | "album_context" | "lyric_theme" | "sound_detail" | "era_memory" | "transition"
  >;
  qualityNotes: string;
  rawPrompt?: string;
  rawResponse?: string;
};

function buildSystemPrompt() {
  return [
    DJ_PERSONA_SYSTEM_PROMPT,
    "你必须基于 SongBrief 写。",
    "不要离开 SongBrief 自由发挥事实。",
    "可以使用听感和场景，但必须具体。",
    "会讲歌曲背景、歌手故事、年代、专辑、歌词主题。",
    "如果没有可靠背景资料，就讲具体听感，不要编造事实。",
    `禁止使用以下表达：${DJ_BANNED_PHRASES.join("、")}。`,
    "每次输出 1 到 4 句；每句不要超过 30 个中文字。",
    "至少包含一个具体事实或具体听感。",
    "至少连接当前歌曲和节目段落。",
    "如果有下一首，要说明为什么接得上。",
    "不要像诗歌朗诵，不要堆形容词。",
    "输出 JSON：{ lines, usedFacts, usedAngles, qualityNotes }。",
  ].join("\n");
}

function buildUserPrompt(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  currentSongBrief: SongBrief;
  previousSongBrief?: SongBrief | null;
  nextSongBrief?: SongBrief | null;
  selectedTargetBriefs?: SongBrief[];
  transition?: { from: string; to: string; why: string } | null;
  failureReason?: string;
  originalLines?: string[];
}) {
  return JSON.stringify({
    trigger: input.trigger,
    timeOfDay: input.context.timeOfDay,
    currentSegment: input.context.currentSegment,
    userIntent: input.context.userIntent ?? null,
    currentSongBrief: input.currentSongBrief,
    previousSongBrief: input.previousSongBrief ?? null,
    nextSongBrief: input.nextSongBrief ?? null,
    selectedTargetBriefs: input.selectedTargetBriefs ?? [],
    transition: input.transition ?? null,
    recentLines: input.context.recentLines?.slice(-10) ?? [],
    failureReason: input.failureReason ?? null,
    originalLines: input.originalLines ?? [],
    rules: [
      "必须引用 SongBrief 里的事实或 talkAngles。",
      "usedFacts 必须写出你真正使用的事实句。",
      "usedAngles 必须只填实际使用到的 angle。",
      "如果是 user_tune，要解释为什么现在要切到目标歌。",
      "如果资料不足，就用 soundProfile 的具体乐器、节奏、音色来写。",
    ],
  });
}

export class LLMRadioHostWriter {
  private readonly deepseekClient: Pick<DeepSeekClient, "chatJson" | "isConfigured">;

  constructor(input: { deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured"> } = {}) {
    this.deepseekClient = input.deepseekClient ?? new DeepSeekClient();
  }

  async write(input: {
    trigger: DJDirectorTrigger;
    context: DJDirectorContext;
    currentSongBrief: SongBrief;
    previousSongBrief?: SongBrief | null;
    nextSongBrief?: SongBrief | null;
    selectedTargetBriefs?: SongBrief[];
    transition?: { from: string; to: string; why: string } | null;
    failureReason?: string;
    originalLines?: string[];
  }): Promise<RadioHostWriterResult> {
    const configured = typeof this.deepseekClient.isConfigured === "function" ? this.deepseekClient.isConfigured() : true;
    if (!configured) {
      return {
        lines: [],
        usedFacts: [],
        usedAngles: [],
        qualityNotes: "DeepSeek unavailable for host writing.",
      };
    }

    const rawPrompt = buildUserPrompt(input);
    const response = await this.deepseekClient.chatJson<RadioHostWriterResult>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: rawPrompt,
      temperature: input.failureReason ? 0.45 : 0.72,
      maxTokens: 900,
    });

    if (!response.ok || !response.data) {
      return {
        lines: [],
        usedFacts: [],
        usedAngles: [],
        qualityNotes: response.error?.message ?? "Host writer failed.",
        rawPrompt,
        rawResponse: response.rawText,
      };
    }

    return {
      lines: Array.isArray(response.data.lines) ? response.data.lines : [],
      usedFacts: Array.isArray(response.data.usedFacts) ? response.data.usedFacts : [],
      usedAngles: Array.isArray(response.data.usedAngles) ? response.data.usedAngles : [],
      qualityNotes: response.data.qualityNotes ?? "",
      rawPrompt,
      rawResponse: response.rawText,
    };
  }
}
