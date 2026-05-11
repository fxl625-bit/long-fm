export const STORY_SEEDS = {
  morning: [
    "刚开始的一天",
    "第一杯咖啡",
    "通勤路上",
    "还没完全醒来的城市",
  ],
  afternoon: [
    "工作间隙",
    "光线很白的下午",
    "咖啡冷掉",
    "想从任务里抽身几分钟",
  ],
  evening: [
    "回程",
    "车窗",
    "电梯口",
    "晚饭前后的城市",
    "今天慢慢收回来",
  ],
  night: [
    "房间",
    "灯",
    "未发送的消息",
    "旧歌",
    "远处的车声",
  ],
} as const;

export function getStorySeeds(timeOfDay: keyof typeof STORY_SEEDS) {
  return STORY_SEEDS[timeOfDay] ?? [];
}
