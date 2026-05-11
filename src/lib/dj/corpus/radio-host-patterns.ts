export type RadioHostPattern =
  | "time_check"
  | "station_id"
  | "story_opening"
  | "song_background"
  | "artist_context"
  | "album_context"
  | "lyric_theme"
  | "sound_description"
  | "back_announce"
  | "forward_announce"
  | "emotional_bridge"
  | "listener_note"
  | "memory_lane"
  | "era_context"
  | "segment_transition"
  | "outro";

export type RadioHostPatternDefinition = {
  pattern: RadioHostPattern;
  description: string;
  bestFor: string[];
  requiredAnchors: Array<
    "time"
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
  avoidWhenSourceThin?: boolean;
};

export const RADIO_HOST_PATTERNS: RadioHostPatternDefinition[] = [
  {
    pattern: "time_check",
    description: "报时，建立真实播出感。",
    bestFor: ["opening", "hour_mark", "segment_shift"],
    requiredAnchors: ["time", "current_song"],
  },
  {
    pattern: "station_id",
    description: "建立频道感，但必须落回当前节目与歌曲。",
    bestFor: ["opening", "segment_shift"],
    requiredAnchors: ["time", "current_song", "listener_scene"],
  },
  {
    pattern: "story_opening",
    description: "用故事口气打开节目，但要落到第一首歌。",
    bestFor: ["opening", "nostalgic_segment"],
    requiredAnchors: ["current_song", "artist", "listener_scene"],
  },
  {
    pattern: "song_background",
    description: "讲歌曲背景、合作、发行信息，不能编造。",
    bestFor: ["track_intro", "special_moment"],
    requiredAnchors: ["current_song", "artist", "album"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "artist_context",
    description: "讲歌手经历、身份、合作关系或代表性。",
    bestFor: ["track_intro", "artist_focus"],
    requiredAnchors: ["current_song", "artist"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "album_context",
    description: "讲专辑中的位置和专辑整体气质。",
    bestFor: ["track_intro", "opening"],
    requiredAnchors: ["current_song", "album"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "lyric_theme",
    description: "讲歌词主题，不大段引用歌词。",
    bestFor: ["track_intro", "memory_lane"],
    requiredAnchors: ["current_song", "lyric"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "sound_description",
    description: "讲人声、鼓点、钢琴、吉他、低频、合成器、旋律线。",
    bestFor: ["track_intro", "bridge", "thin_source"],
    requiredAnchors: ["current_song", "sound_detail"],
  },
  {
    pattern: "back_announce",
    description: "回接刚播完的歌，指出它留下的具体声音。",
    bestFor: ["bridge", "every_two_tracks"],
    requiredAnchors: ["previous_song", "sound_detail"],
  },
  {
    pattern: "forward_announce",
    description: "带出下一首具体会怎么变。",
    bestFor: ["bridge", "user_tune"],
    requiredAnchors: ["next_song", "sound_detail"],
  },
  {
    pattern: "emotional_bridge",
    description: "从上一首过渡到下一首，说明为什么这样接。",
    bestFor: ["bridge", "user_tune", "style_shift"],
    requiredAnchors: ["previous_song", "next_song", "sound_detail"],
  },
  {
    pattern: "listener_note",
    description: "对听众说一句生活化的话，但不能鸡汤。",
    bestFor: ["bridge", "outro"],
    requiredAnchors: ["listener_scene", "current_song"],
  },
  {
    pattern: "memory_lane",
    description: "用年代、记忆或熟悉感把歌讲成一段回望。",
    bestFor: ["nostalgic_segment", "old_song"],
    requiredAnchors: ["current_song", "era", "listener_scene"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "era_context",
    description: "讲年代与音乐印记。",
    bestFor: ["era_show", "classic_segment"],
    requiredAnchors: ["current_song", "era", "artist"],
    avoidWhenSourceThin: true,
  },
  {
    pattern: "segment_transition",
    description: "交代节目段落变化，但要落回当前歌和下一首。",
    bestFor: ["segment_shift", "style_shift"],
    requiredAnchors: ["current_song", "next_song", "listener_scene"],
  },
  {
    pattern: "outro",
    description: "收尾、告别、预告下一段。",
    bestFor: ["outro", "near_end"],
    requiredAnchors: ["current_song", "listener_scene"],
  },
];

export function getRadioHostPatternDefinition(pattern: RadioHostPattern) {
  return RADIO_HOST_PATTERNS.find((item) => item.pattern === pattern);
}
