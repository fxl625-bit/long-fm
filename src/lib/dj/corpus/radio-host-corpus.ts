import type { RadioHostPattern } from "./radio-host-patterns";

export type RadioHostCorpusExample = {
  id: string;
  type: string;
  pattern: RadioHostPattern;
  learningPoints: string[];
  suitableFor: string[];
  lines: string[];
};

export const RADIO_HOST_CORPUS: RadioHostCorpusExample[] = [
  {
    id: "window-opening-001",
    type: "room_tone_opening",
    pattern: "time_check",
    learningPoints: ["有房间感", "不是欢迎词", "一开口就像节目已经在这里"],
    suitableFor: ["opening", "hour_mark", "segment_shift"],
    lines: ["窗边那点光还没退干净。", "这首歌先把房间里的边角照出来。"],
  },
  {
    id: "late-thought-001",
    type: "interrupted_thought",
    pattern: "story_opening",
    learningPoints: ["像突然想到一句", "不完整也成立", "不分析音乐"],
    suitableFor: ["opening", "nostalgic_segment", "bridge"],
    lines: ["刚才差点没想开口。", "但这一小段空气，确实值得有人陪着听。"],
  },
  {
    id: "city-return-001",
    type: "city_reflection_bridge",
    pattern: "emotional_bridge",
    learningPoints: ["从音乐过到生活", "有城市感", "不是鸡汤"],
    suitableFor: ["bridge", "low_energy_segment"],
    lines: ["有些歌不是让人想起过去。", "更像下班路上，突然把今天解释清楚了一点。"],
  },
  {
    id: "commute-hum-001",
    type: "commute_narrative",
    pattern: "listener_note",
    learningPoints: ["轻一点的陪伴", "具体生活场景", "像耳边一句"],
    suitableFor: ["travel_theme", "commute", "city_segment"],
    lines: ["电车门刚关上的时候，耳机里最适合出现这种声音。"],
  },
  {
    id: "memory-fragment-001",
    type: "return_to_origin",
    pattern: "memory_lane",
    learningPoints: ["记忆碎片", "有回看感", "克制"],
    suitableFor: ["nostalgic_segment", "classic_song"],
    lines: ["以前会把这种歌听得很满。", "现在反而知道，留一点空白比较耐听。"],
  },
  {
    id: "quiet-outro-001",
    type: "quiet_outro",
    pattern: "outro",
    learningPoints: ["收束", "不喊结束", "像人慢慢退后"],
    suitableFor: ["outro", "night_only"],
    lines: ["先把这一段放在这儿。", "等你下次回来，频道还会亮着。"],
  },
  {
    id: "weather-overlap-001",
    type: "weather_overlap",
    pattern: "segment_transition",
    learningPoints: ["天气和音乐叠在一起", "不是形容词堆砌", "能自然过桥"],
    suitableFor: ["classic_segment", "nostalgic_theme", "bridge"],
    lines: ["外面要是正好有风，这种前奏会显得更近。"],
  },
  {
    id: "half-whisper-001",
    type: "half_whisper",
    pattern: "era_context",
    learningPoints: ["像在耳边", "短句也成立", "适合轻声开口"],
    suitableFor: ["opening", "bridge", "night_only"],
    lines: ["耳机别急着摘。", "这一段还没说完。"],
  },
  {
    id: "human-checkin-001",
    type: "listener_connection",
    pattern: "listener_note",
    learningPoints: ["像真的有人在场", "轻微照面", "不命令用户"],
    suitableFor: ["bridge", "memory_lane"],
    lines: ["你要是今天有点累，这首歌不用努力听。", "让它自己过来就行。"],
  },
];
