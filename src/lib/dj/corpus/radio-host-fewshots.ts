import { RADIO_HOST_CORPUS } from "./radio-host-corpus";
import type { RadioHostPattern } from "./radio-host-patterns";

export type RadioHostFewShot = {
  pattern: RadioHostPattern;
  whyItWorks: string;
  lines: string[];
};

const FEWSHOTS: RadioHostFewShot[] = [
  {
    pattern: "time_check",
    whyItWorks: "先报时，再把场景落到当前节目。",
    lines: ["现在是下午三点十七分，窗外的光还很亮。", "这一段我先放一首线条清楚的歌，把耳朵叫醒。"],
  },
  {
    pattern: "song_background",
    whyItWorks: "用专辑和合作关系讲歌，不讲功能。",
    lines: ["这首收在专辑里，不是最响的一首，却最能看见歌手处理细节的手法。", "合作的人声一进来，整首歌的年代感立刻被拉出来。"],
  },
  {
    pattern: "artist_context",
    whyItWorks: "讲歌手身份和声音来源。",
    lines: ["这首里最有意思的不是副歌，而是歌手怎么把自己的声线收得更近。", "那种克制，往往比放开更容易留下痕迹。"],
  },
  {
    pattern: "sound_description",
    whyItWorks: "资料薄时退回具体听感。",
    lines: ["这首的钢琴没有往前冲，反而把人声后面的留白托出来。", "鼓点不重，但低频一直在底下慢慢推。"],
  },
  {
    pattern: "emotional_bridge",
    whyItWorks: "先回接上一首，再交代下一首为什么接得上。",
    lines: ["刚刚那首把情绪压得很低，主要是钢琴和人声的重量。", "下一首我换到器乐段，让旋律先把房间松开。"],
  },
  {
    pattern: "outro",
    whyItWorks: "短，像节目收束，不煽情。",
    lines: ["这一段先陪你到这里。", "下一个段落，我们换一种声线再回来。"],
  },
];

export function getFewShotsForPattern(pattern: RadioHostPattern) {
  const exact = FEWSHOTS.filter((item) => item.pattern === pattern);
  if (exact.length > 0) {
    return exact;
  }

  return RADIO_HOST_CORPUS.filter((item) => item.pattern === pattern).map((item) => ({
    pattern,
    whyItWorks: item.learningPoints.join("；"),
    lines: item.lines,
  }));
}
