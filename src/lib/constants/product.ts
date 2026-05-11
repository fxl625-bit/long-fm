import type { ProgramTweak } from "@/lib/types/music";

export const PRODUCT_NAME = "Long FM";
export const PRODUCT_TAGLINE = "你的私人 AI DJ 电台";
export const DEFAULT_CHANNEL_NAME = "Long FM";
export const DEFAULT_DJ_NAME = "Long";
export const DEFAULT_PROGRAM_HOST_TONE = "全天候、克制、自然，会随时间调整语气";
export const DEFAULT_PROGRAM_INTENT = "先接住熟悉感，再慢慢推进，让这一段频道自然流动。";

export const PLAYER_MODES = ["我的 DJ", "推荐流", "歌单模式"] as const;
export type PlayerMode = (typeof PLAYER_MODES)[number];

export const QUICK_SCENES = ["通勤", "专注", "放松", "开车", "想怀旧", "想提神"] as const;

export const FINE_TUNE_OPTIONS: Array<{ key: ProgramTweak; label: string }> = [
  { key: "more_nostalgic", label: "更怀旧" },
  { key: "less_sad", label: "少一点悲伤" },
  { key: "more_rhythm", label: "更有节奏" },
  { key: "more_female_vocal", label: "更多女声" },
  { key: "more_city_night", label: "更多城市感" },
  { key: "more_chinese", label: "更多中文" },
  { key: "fit_work", label: "更适合工作" },
  { key: "fit_drive", label: "更适合开车" },
];

export const ONE_LINE_PRODUCT_INTROS = [
  "这不是聊天工具，是你每天都能直接点开播放的音乐空间。",
  "把你的收藏歌单，变成更顺耳的连续节目流。",
  "先播放，再微调，AI 只在该出现的时候出现。",
  "你给口味，我们负责顺滑编排。",
  "保留你的偏好，同时减少重复和断裂。",
  "像一个懂你的私人 DJ，而不是一个参数面板。",
  "打开就能听，想法随时补一句。",
  "播放器优先，AI 在旁边帮你把队列排好。",
  "每次打开都能从上次状态继续。",
  "安静、克制、可长期使用的 AI 音乐播放器。",
];

export const HOME_SUBTITLES = [
  "一句话描述你现在想听的状态，其余交给 AI DJ。",
  "先播起来，再慢慢调成更像你。",
  "从你的收藏出发，生成连贯可听的节目队列。",
  "不是随机播放，是有起伏的个人节目流。",
  "你熟悉的歌，会以更顺滑的顺序出现。",
  "每次打开都能继续上次的播放进度。",
  "减少操作，把注意力还给音乐。",
  "更像播放器，而不是一个生成器。",
  "让 AI 做编排，你只负责听。",
  "今天想听什么，直接说一句。",
];

export const AI_DJ_SHORT_LINES = [
  "前段先稳住，第三首开始抬一点。",
  "这版中文占比更高，更贴近你最近口味。",
  "我把重复歌手打散了，听感会更松弛。",
  "中段节奏会起来一点，但不会太冲。",
  "后段收得更安静，适合循环放。",
  "这首放在这里，是为了让过渡更顺。",
  "我保留了你常回听的两首核心歌。",
  "这一版更偏女声，氛围会更柔和。",
  "怀旧颗粒感保留了，但不过度沉。",
  "前两首先给熟悉感，后面再加变化。",
  "这版更适合一边做事一边听。",
  "我把情绪峰值提前了两首。",
  "这一轮更偏连贯，不追求炸点。",
  "你的高频艺术家我做了分散处理。",
  "后段给了更长的留白空间。",
  "这组可以直接连播，不容易疲劳。",
  "如果你要更轻快，我可以再提一档节奏。",
  "这次把悲伤标签压低了，整体更清爽。",
  "我把城市感放在了开场和收尾。",
  "想再来一组的话，我可以按这版再细化。",
];

export const EMPTY_STATE_COPY = [
  "还没有可播放队列，先同步一次音乐源。",
  "先导入歌单，播放器就能直接开始。",
  "当前是空队列，点一下“再来一组”试试。",
  "还没有检测到可播放歌曲，建议先用 Demo 模式。",
  "先把音乐源连上，这里就会开始出声。",
  "队列暂时为空，告诉 DJ 你现在想换成什么感觉。",
  "先让 AI DJ 排一组队列，再开始播放。",
  "没有可用音轨，去音乐源设置页检查一下。",
  "如果你着急演示，建议先切到 Demo 音源。",
  "准备好以后，随时一句话开播。",
];

export const PROVIDER_FALLBACK_COPY = [
  "当前音乐源暂不可用，已自动切换到 Demo 音源。",
  "连接失败，先用可播放的后备音源继续。",
  "该源目前只返回元数据，播放已降级为外链模式。",
  "服务波动中，已切换到稳定模式保障播放。",
  "暂未拿到可播地址，已保留队列并继续推荐。",
  "实验源不可用，系统已自动降级。",
  "播放链接失效，建议切到 Demo 或 Local。",
  "授权状态异常，已使用后备模式继续。",
  "我们保留了你的队列，播放链路已降级处理。",
  "AI 编排正常，播放源正在使用 fallback。",
];
