import { DEFAULT_CHANNEL_NAME, DEFAULT_PROGRAM_HOST_TONE } from "@/lib/constants/product";
import { DJ_BANNED_PHRASES } from "./dj-banned-phrases";
import { DJ_PERSONA_SYSTEM_PROMPT } from "./dj-persona";
import type { DJDirectorContext, DJDirectorTrigger, DJProgramPlan, UserMusicMemory } from "./dj-types";
import type { SongTalkContext } from "./song-background-service";
import type { Track } from "@/lib/radio/radio-types";
import { getQueuePatchTrackId, isImmediateTuneIntent } from "./queue-selector";

function toPromptTrack(track: Track, index?: number) {
  return {
    providerTrackId: getQueuePatchTrackId(track),
    internalId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    languageHint: track.tags?.language,
    energyHint: track.tags?.energy,
    styleHint: track.tags?.style?.[0],
    moodHint: track.tags?.mood?.[0],
    ...(typeof index === "number" ? { position: index + 1 } : {}),
  };
}

function summarizeMemory(userMemory: UserMusicMemory | undefined, fallback = "") {
  if (userMemory?.summary?.trim()) {
    return userMemory.summary.trim();
  }
  return fallback || "喜欢熟悉的声音，但也愿意在中段换一点颜色。";
}

export function buildProgramPlannerSystemPrompt() {
  return [
    DJ_PERSONA_SYSTEM_PROMPT,
    "你现在处于节目准备阶段。",
    "你要先为这一档频道生成完整的 ProgramPlan，再进入播放。",
    "ProgramPlan 必须只包含：title、intent、segments、queueTrackIds。",
    "segments 至少 3 个，queueTrackIds 至少 12 首；如果候选歌不足，就尽量覆盖全部候选歌。",
    "所有 trackIds 必须来自 playableTrackPool 的 providerTrackId。",
    "不要返回内部数据库 id。",
    "不要机械照抄原始歌单顺序；如果候选池不少于 4 首，至少要重新安排其中一部分位置。",
    "只输出结构化编排，不要生成 openingLine、openingLines、hostingMoments、djMoments 或任何口播文案。",
    `频道名固定为 ${DEFAULT_CHANNEL_NAME}。`,
    "节目标题必须根据 timeOfDay 调整：morning 清醒一点，afternoon 稳定一点，evening 有城市和回程感，night 才能适度使用夜间意象。",
    "如果是 morning / afternoon / evening，不要使用深夜、午夜、晚安、夜路等词。",
    "不要提供可复读的模板句，只根据歌曲信息编排结构。输出必须是 JSON。",
  ].join("\n");
}

export function buildProgramPlannerUserPrompt(input: {
  playlistName: string;
  timeOfDay: DJDirectorContext["timeOfDay"];
  userMemorySummary: string;
  playableTrackPool: Track[];
  recentTracks: Track[];
}) {
  return JSON.stringify({
    playlistName: input.playlistName,
    channelName: DEFAULT_CHANNEL_NAME,
    timeOfDay: input.timeOfDay,
    userMemorySummary: input.userMemorySummary,
    recentTracks: input.recentTracks.slice(0, 5).map((track, index) => toPromptTrack(track, index)),
    playableTrackPool: input.playableTrackPool.slice(0, 80).map((track, index) => toPromptTrack(track, index)),
    rules: [
      "queueTrackIds 和 segments.trackIds 必须使用 providerTrackId。",
      "不要返回当前候选池中不存在的歌曲。",
      "不要把 playableTrackPool 的原始顺序整段照搬回去。",
      "节目需要先稳住，再慢慢推进，再适当换颜色。",
      `主持语气默认是：${DEFAULT_PROGRAM_HOST_TONE}。`,
      "频道名固定为 Auralia FM，不要改名。",
      "只有当 timeOfDay 是 night 时，才允许使用夜晚、午夜、晚安、夜路等意象。",
      "如果是 morning / afternoon / evening，不要使用深夜、午夜、晚安、夜路等词。",
      "不要生成 openingLine、openingLines、hostingMoments、djMoments、soundHints、knownContext。",
      `禁句：${DJ_BANNED_PHRASES.join("、")}。`,
    ],
  });
}

export function buildDirectorSystemPrompt() {
  return [
    DJ_PERSONA_SYSTEM_PROMPT,
    "你现在处于节目进行阶段，要根据上下文做一条可执行的 DJDecision。",
    "你不能使用任何套话。",
    "你每次说话必须来自具体歌曲信息。",
    "你必须提到当前歌曲、下一首、歌手、专辑、声音细节或转场逻辑中的至少两个。",
    "不要把节目编排意图说成口号。",
    "不要说空泛情绪。",
    "如果需要换方向，必须返回 queuePatch，trackIds 必须来自 playableTrackPool 的 providerTrackId。",
    "user_tune、shift_style、raise_energy、lower_energy、insert_discovery 时，queuePatch.trackIds 必须返回 3 到 5 首。",
    "如果音乐已经暂停或结束，action 应该是 stop_talking。",
    "If the user intent asks for an immediate change, return action=skip_to_next and queuePatch.mode=skip_now.",
    "If queuePatch.mode=skip_now, pick 1 to 3 providerTrackId values that should become the new next block immediately.",
    "Do not say the change starts on the next song when the user asked for immediate change.",
    `频道名固定为 ${DEFAULT_CHANNEL_NAME}。`,
    "只有当 timeOfDay 是 night 时，才适度使用夜晚、午夜、晚安、夜路等意象。",
    "如果是 morning / afternoon / evening，不要使用深夜、午夜、晚安、夜路等词。",
    `禁句：${DJ_BANNED_PHRASES.join("、")}。`,
    "不要自行改成夜色频道或夜航频率。",
    "输出必须是 JSON。",
  ].join("\n");
}

export function buildDirectorUserPrompt(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  musicContext: unknown;
  currentProgram?: DJProgramPlan | null;
  currentSongTalk?: SongTalkContext | null;
  previousSongTalk?: SongTalkContext | null;
  nextSongTalk?: SongTalkContext | null;
  transition?: { from: string; to: string; why: string } | null;
  selectedTargetTracks?: SongTalkContext[];
}) {
  const { context } = input;
  const requireImmediateChange = isImmediateTuneIntent(context.userIntent);
  const previousTrack = context.recentTracks.at(-1);
  return JSON.stringify({
    trigger: input.trigger,
    channelName: DEFAULT_CHANNEL_NAME,
    currentTrack: {
      ...toPromptTrack(context.currentTrack),
      lyricExcerpt: input.currentSongTalk?.lyricExcerpt,
      albumContext: input.currentSongTalk?.albumContext,
      artistContext: input.currentSongTalk?.artistContext,
    },
    previousTrack: previousTrack
      ? {
          ...toPromptTrack(previousTrack),
          albumContext: input.previousSongTalk?.albumContext,
          artistContext: input.previousSongTalk?.artistContext,
        }
      : null,
    nextTrack: context.nextTrack
      ? {
          ...toPromptTrack(context.nextTrack),
          lyricExcerpt: input.nextSongTalk?.lyricExcerpt,
          albumContext: input.nextSongTalk?.albumContext,
          artistContext: input.nextSongTalk?.artistContext,
        }
      : null,
    selectedTargetTracks: input.selectedTargetTracks?.map((track) => ({
      providerTrackId: track.providerTrackId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      shortBackground: track.artistContext ?? track.albumContext ?? track.releaseInfo ?? null,
    })),
    transition: input.transition ?? null,
    recentTracks: context.recentTracks.slice(-5).map((track, index) => toPromptTrack(track, index)),
    upcomingTracks: context.upcomingTracks.slice(0, 8).map((track, index) => toPromptTrack(track, index)),
    playableTrackPool: (context.playableTrackPool ?? [context.currentTrack, ...context.upcomingTracks]).slice(0, 80).map((track, index) => toPromptTrack(track, index)),
    playedCount: context.playedCount,
    timeOfDay: context.timeOfDay,
    segment: {
      name: context.currentSegment,
      purpose: context.currentSegment,
      hostNarrative:
        typeof input.musicContext === "object" && input.musicContext && "transition" in (input.musicContext as Record<string, unknown>)
          ? ((input.musicContext as { transition?: { why?: string } }).transition?.why ?? "")
          : "",
    },
    userIntent: context.userIntent ?? null,
    requireImmediateChange,
    recentLines: context.recentLines?.slice(-10) ?? [],
    bannedPhrases: DJ_BANNED_PHRASES,
    musicState: context.musicState ?? null,
    userMemorySummary: summarizeMemory(context.userMemory),
    currentProgram: input.currentProgram
      ? {
          title: input.currentProgram.title,
          intent: input.currentProgram.intent,
        }
      : null,
    musicContext: input.musicContext,
    rules: [
      "你必须只输出 JSON。",
      "queuePatch.trackIds 必须来自 playableTrackPool 的 providerTrackId。",
      requireImmediateChange
        ? "If requireImmediateChange is true, use skip_now and do not wait for the current song to end."
        : "If requireImmediateChange is false, you may keep the current song and only adjust upcoming tracks.",
      "不要说根据你的偏好、为你生成、系统检测。",
      "不要重复当前这首不打断，下一首开始变。",
      "频道名固定为 Auralia FM，不要改名。",
      "如果没有可靠背景资料，就讲听感、气氛、节奏和过渡。",
      "你每次口播至少要落在两个具体锚点上：当前歌、下一首、歌手或专辑、声音细节、转场理由、时间或场景。",
    ],
  });
}

export function buildDirectorRewriteUserPrompt(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  failureReason: string;
  originalLines: string[];
  musicContext: unknown;
  currentSongTalk?: SongTalkContext | null;
  nextSongTalk?: SongTalkContext | null;
  transition?: { from: string; to: string; why: string } | null;
}) {
  return JSON.stringify({
    trigger: input.trigger,
    failureReason: input.failureReason,
    originalLines: input.originalLines,
    currentTrack: {
      title: input.context.currentTrack.title,
      artist: input.context.currentTrack.artist,
      album: input.context.currentTrack.album,
      lyricExcerpt: input.currentSongTalk?.lyricExcerpt ?? null,
      artistContext: input.currentSongTalk?.artistContext ?? null,
    },
    nextTrack: input.context.nextTrack
      ? {
          title: input.context.nextTrack.title,
          artist: input.context.nextTrack.artist,
          album: input.context.nextTrack.album,
          artistContext: input.nextSongTalk?.artistContext ?? null,
        }
      : null,
    transition: input.transition ?? null,
    bannedPhrases: DJ_BANNED_PHRASES,
    rules: [
      "你刚才的口播不合格。",
      "请重新写。",
      "必须提到当前歌曲或歌手。",
      "必须提到下一首或转场方向。",
      "必须提到一个具体声音细节。",
      "不使用禁句。",
      "1 到 2 句。",
      "每句不超过 25 个中文字。",
      "只输出 JSON。",
    ],
    musicContext: input.musicContext,
  });
}
