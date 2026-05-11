import type { MusicPersonaResult } from "@/lib/types/music";

type DemoProgramTrack = {
  providerTrackId: string;
  section: "opening" | "build" | "lift" | "settle" | "outro";
  reasonText: string;
  transitionText: string;
};

export type DemoProgramSeed = {
  title: string;
  subtitle: string;
  prompt: string;
  theme: string;
  mood: string;
  introText: string;
  outroText: string;
  coverPrompt: string;
  vibeDescription: string;
  arrangementLogic: string;
  hostTone: string;
  tracks: DemoProgramTrack[];
};

export const demoMusicProfileSeed: MusicPersonaResult = {
  structured: {
    moods: ["克制", "流动感", "怀旧", "陪伴"],
    languages: ["中文", "英文"],
    eras: ["2000s", "2010s", "2020s"],
    energy: "medium-low",
    scenes: ["通勤", "开车", "独处", "专注"],
    keywords: ["城市感", "留白", "顺滑过渡", "颗粒感"],
    topArtists: ["陈向北", "林川", "Nora Line", "Mile North"],
    repeatFavorites: ["旧磁带回放 - 陈向北", "Blue Metro - Nora Line", "立交桥风景 - 林川"],
    narrativePreference: "偏好先稳后升再回收的队列结构，重视歌曲之间的衔接感。",
  },
  summaryText:
    "你的听歌更像长期陪伴流：不追求瞬间炸点，更在意连贯和耐听。你喜欢城市纹理与怀旧颗粒感，同时希望整体节奏保持克制和稳定。",
};

export const demoProgramsSeed: DemoProgramSeed[] = [
  {
    title: "城市通勤流",
    subtitle: "先稳，再轻抬，最后平滑收尾",
    prompt: "DEMO: 做一组适合通勤的顺滑队列",
    theme: "通勤主线",
    mood: "平稳推进",
    introText: "这组先把速度拉齐，再给一点轻微抬升，适合一路放下去。",
    outroText: "这一段到这里刚好。如果你要更提神的版本，我可以再提一档节奏。",
    coverPrompt: "城市高架、晨光、玻璃反射、干净构图",
    vibeDescription: "稳定进入 -> 轻微抬升 -> 柔和回收",
    arrangementLogic: "开场建立熟悉感，中段增加推进力，后段回落到可循环区间。",
    hostTone: "Long",
    tracks: [
      { providerTrackId: "t001", section: "opening", reasonText: "先建立稳定速度。", transitionText: "先从《立交桥风景》开场，把状态放平。" },
      { providerTrackId: "t010", section: "opening", reasonText: "延续平稳质感。", transitionText: "《Quiet Avenue》接上，保持流动不抢注意力。" },
      { providerTrackId: "t002", section: "build", reasonText: "中段补一点提神。", transitionText: "《Clear Morning》把精神线轻轻抬起来。" },
      { providerTrackId: "t008", section: "lift", reasonText: "承担本组小峰值。", transitionText: "《Night Shift Sun》负责这组的抬升段。" },
      { providerTrackId: "t003", section: "settle", reasonText: "开始回收。", transitionText: "切到《慢行街角》，把密度慢慢收回来。" },
      { providerTrackId: "t009", section: "outro", reasonText: "柔和收尾。", transitionText: "最后《南方小雨》落地，听感会更完整。" },
    ],
  },
  {
    title: "记忆颗粒流",
    subtitle: "2000s 质感 + 当下节奏",
    prompt: "DEMO: 更怀旧一点，但别太沉",
    theme: "怀旧混合流",
    mood: "温和怀旧",
    introText: "这组保留你熟悉的年代气味，但不会把整体拖慢。",
    outroText: "这轮怀旧版先到这儿。要不要下一轮更偏中文女声？",
    coverPrompt: "旧磁带、胶片颗粒、浅灰蓝、留白",
    vibeDescription: "怀旧底色里保持现代连贯",
    arrangementLogic: "先建立年代感，中段补节奏，尾段回收成可循环的安静状态。",
    hostTone: "Long",
    tracks: [
      { providerTrackId: "t005", section: "opening", reasonText: "直接建立怀旧底色。", transitionText: "先从《旧磁带回放》开始，把耳朵调到熟悉频段。" },
      { providerTrackId: "t004", section: "build", reasonText: "补齐英文颗粒感。", transitionText: "《Blue Metro》接上，旧感会更完整。" },
      { providerTrackId: "t012", section: "build", reasonText: "维持流动，不压情绪。", transitionText: "《Monochrome Taxi》把画面继续往前推。" },
      { providerTrackId: "t007", section: "lift", reasonText: "中段抬升但不过冲。", transitionText: "《凌晨之前》把情绪抬到舒服峰值。" },
      { providerTrackId: "t003", section: "settle", reasonText: "收回到安静区。", transitionText: "切到《慢行街角》，让线条重新放松。" },
      { providerTrackId: "t009", section: "outro", reasonText: "温和落地。", transitionText: "最后《南方小雨》，留一个干净尾音。" },
    ],
  },
  {
    title: "专注工作流",
    subtitle: "低打扰，保持连续",
    prompt: "DEMO: 我要写东西，少打扰，保节奏",
    theme: "专注模式",
    mood: "低干扰",
    introText: "这组会把存在感放低一点，把注意力留给你手上的事。",
    outroText: "这一轮专注流结束。需要的话，我可以继续给你接一组同速队列。",
    coverPrompt: "桌面台灯、纸张、柔和阴影、极简色调",
    vibeDescription: "低噪进入 -> 持续工作段 -> 平稳收尾",
    arrangementLogic: "低能量开场，中段保持稳定密度，末段回收，避免突兀变化。",
    hostTone: "Long",
    tracks: [
      { providerTrackId: "t006", section: "opening", reasonText: "先降噪。", transitionText: "《Paper Lamp》先把听感整理干净。" },
      { providerTrackId: "t011", section: "build", reasonText: "贴合写作场景。", transitionText: "《写信的人》接上，维持低干扰文字感。" },
      { providerTrackId: "t003", section: "build", reasonText: "维持稳定专注。", transitionText: "《慢行街角》继续保持专注线。" },
      { providerTrackId: "t010", section: "lift", reasonText: "补一点空气感。", transitionText: "到《Quiet Avenue》，密度仍然可控。" },
      { providerTrackId: "t007", section: "settle", reasonText: "准备收束。", transitionText: "《凌晨之前》把速度慢慢收回来。" },
      { providerTrackId: "t009", section: "outro", reasonText: "轻收尾。", transitionText: "最后《南方小雨》，让这段专注自然落地。" },
    ],
  },
];

