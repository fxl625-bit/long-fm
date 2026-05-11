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
    "你要为这一档频道生成完整的 ProgramPlan：title、intent、segments、queueTrackIds。",
    "",
    "=== 节目结构 ===",
    "segments 至少 4 个（开场稳住 / 逐步推进 / 换色拓展 / 收束余韵），每个 segment 4-5 首歌。",
    "queueTrackIds 至少 16 首，尽量覆盖全部候选歌。",
    "每个 segment 必须设定 purpose（warmup / main / shift / discovery / cooldown）和 targetEnergy（low / medium / high）。",
    "",
    "=== 编排原则 ===",
    "1. 开场稳住 (warmup)：用最近常听、熟悉的歌锚定基调，energy 从 low 到 medium。",
    "2. 逐步推进 (main)：保持连贯但逐渐加入节奏或色彩变化，energy 在 medium 附近。",
    "3. 换色拓展 (shift/discovery)：引入新歌手、新语种或不同年代的作品，拓宽听感边界。",
    "4. 收束余韵 (cooldown)：用有沉淀感的作品收尾，energy 回到 low-medium，让人自然停下来或循环。",
    "",
    "=== 编排规则 ===",
    "同一歌手不要在连续 2 首中出现。",
    "同一语种的歌不要连续超过 3 首（除非候选池语种单一）。",
    "energy 曲线要有起伏：不要全程平，也不要大起大落。",
    "不要机械照抄原始歌单顺序。候选池超过 4 首时必须重新安排。",
    "所有 trackIds 必须来自 playableTrackPool 的 providerTrackId，不要返回内部数据库 id。",
    "",
    "=== 时段适配 ===",
    "你需要根据 scene 中的 season、weatherHint、dayOfWeek、weekdayType、likelyScene 来编排节目。",
    "morning：工作日偏清醒启动、节奏紧凑；周末偏松弛慢启。",
    "afternoon：工作日偏稳定专注；周末可以稍深、更自由。",
    "evening：工作日有归途感，适合从紧绷过渡到放松；周末傍晚可以更温暖、更随性。",
    "night：整体 energy 偏低，允许使用夜间意象。工作日晚上偏收束，周末晚上可以稍沉一点、更沉浸。",
    "春天：偏清新、轻快、有生机。夏天：偏清凉或热烈，看具体时间。秋天：偏温暖、怀旧、有沉淀感。冬天：偏沉静、内省、温暖收束。",
    "只有 night 才允许用 深夜/午夜/晚安/夜路 等词。",
    "",
    "=== 输出 ===",
    "只输出结构化编排，不要生成 openingLine、openingLines、hostingMoments、djMoments、soundHints、knownContext 或任何口播文案。",
    `频道名固定为 ${DEFAULT_CHANNEL_NAME}。`,
    "输出必须是 JSON。",
  ].join("\n");
}

export function buildProgramPlannerUserPrompt(input: {
  playlistName: string;
  timeOfDay: DJDirectorContext["timeOfDay"];
  userMemorySummary: string;
  playableTrackPool: Track[];
  recentTracks: Track[];
  listeningContext?: {
    season?: string;
    weatherHint?: string;
    dayOfWeek?: string;
    weekdayType?: string;
    likelyScene?: string;
    energyTarget?: string;
    recommendedMood?: string[];
  };
}) {
  const artistCounts = new Map<string, number>();
  for (const track of input.playableTrackPool) {
    const artist = track.artist.split(" / ")[0].trim();
    artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
  }
  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist, count]) => `${artist}(${count}首)`);

  return JSON.stringify({
    playlistName: input.playlistName,
    channelName: DEFAULT_CHANNEL_NAME,
    timeOfDay: input.timeOfDay,
    scene: input.listeningContext ? {
      season: input.listeningContext.season,
      weatherHint: input.listeningContext.weatherHint,
      dayOfWeek: input.listeningContext.dayOfWeek,
      weekdayType: input.listeningContext.weekdayType,
      likelyScene: input.listeningContext.likelyScene,
      energyTarget: input.listeningContext.energyTarget,
      recommendedMood: input.listeningContext.recommendedMood,
    } : undefined,
    userMemorySummary: input.userMemorySummary,
    recentTracks: input.recentTracks.slice(0, 5).map((track, index) => toPromptTrack(track, index)),
    playableTrackPool: input.playableTrackPool.slice(0, 80).map((track, index) => toPromptTrack(track, index)),
    poolStats: {
      totalTracks: input.playableTrackPool.length,
      topArtists,
      energyDistribution: {
        low: input.playableTrackPool.filter((track) => track.tags?.energy === "low" || (track.durationMs ?? 0) >= 280000).length,
        medium: input.playableTrackPool.filter((track) => track.tags?.energy === "medium" || ((track.durationMs ?? 0) >= 210000 && (track.durationMs ?? 0) < 280000)).length,
        high: input.playableTrackPool.filter((track) => track.tags?.energy === "high" || ((track.durationMs ?? 0) > 0 && (track.durationMs ?? 0) < 210000)).length,
      },
    },
    rules: [
      "queueTrackIds 和 segments.trackIds 必须使用 providerTrackId。",
      "不要返回当前候选池中不存在的歌曲。",
      "不要把 playableTrackPool 的原始顺序整段照搬回去。",
      "节目需要先稳住，再慢慢推进，再适当换颜色，最后收束。",
      "同一歌手不要在连续 2 首中出现。",
      "energy 曲线要有起伏，不要全程平，也不要大起大落。",
      "请根据 scene 中的 season、weatherHint、dayOfWeek、likelyScene 来调整节目编排。",
      "工作日早上偏清醒启动，周末早上偏松弛慢启；工作日傍晚有归途感，周末傍晚可以更自由。",
      "春天偏清新轻快，夏天偏清凉或热烈，秋天偏温暖怀旧，冬天偏沉静内省。",
      `主持语气默认是：${DEFAULT_PROGRAM_HOST_TONE}。`,
      "频道名固定为 Long FM，不要改名。",
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
    "",
    "=== 开口内容 ===",
    "你每次说话必须来自具体歌曲信息，不能使用套话。",
    "你必须提到当前歌曲、下一首、歌手、专辑、声音细节或转场逻辑中的至少两个锚点。",
    "提到歌名时自然地嵌在句子里，不要用书名号或引号框住。",
    "不要把节目编排意图说成口号，不要说空泛情绪。",
    "如果有音乐背景资料（songTalk），优先从中提取有趣的事实或角度。",
    "如果没有背景资料，就讲听感、节奏、气氛、配器、人声质感——像真人在描述听到的东西。",
    "",
    "=== 转场描述 ===",
    "把两首歌之间的过渡翻译成感受：节奏怎么变、颜色怎么换、空间感怎么移。",
    "不要用'下一首'、'接下来'开头每句话。可以从前一首的尾音或感受自然过渡到下一首。",
    "",
    "=== 行为 ===",
    "如果需要换方向，必须返回 queuePatch，trackIds 必须来自 playableTrackPool 的 providerTrackId。",
    "user_tune、shift_style、raise_energy、lower_energy、insert_discovery 时，queuePatch.trackIds 必须返回 3 到 5 首。",
    "选歌时要考虑歌手多样性：不要连续选同一个歌手的歌。",
    "如果音乐已经暂停或结束，action 应该是 stop_talking。",
    "If the user intent asks for an immediate change, return action=skip_to_next and queuePatch.mode=skip_now.",
    "If queuePatch.mode=skip_now, pick 1 to 3 providerTrackId values that should become the new next block immediately.",
    `频道名固定为 ${DEFAULT_CHANNEL_NAME}。`,
    "只有当 timeOfDay 是 night 时，才适度使用夜晚、午夜、晚安、夜路等意象。",
    "如果是 morning / afternoon / evening，不要使用深夜、午夜、晚安、夜路等词。",
    `禁句：${DJ_BANNED_PHRASES.join("、")}。`,
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
      "频道名固定为 Long FM，不要改名。",
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
