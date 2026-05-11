export const DJ_BANNED_PHRASES = [
  "根据你的偏好",
  "为你生成",
  "系统检测",
  "个性化推荐",
  "播放列表",
  "当前这首不打断",
  "下一首开始变",
  "先接上你最近常回来的这几首",
  "前面我不拉太满",
  "中段我会换一点",
  "让频道透口气",
  "频道开了",
  "我给你换个感觉",
  "我将为你",
  "以下是",
  "先从你熟悉的歌开始",
  "慢慢把气氛带起来",
  "不一下子跳太远",
  "后面慢慢换一点新鲜感",
  "让空气流动一下",
  "人声靠近一点",
  "把节目接上",
  "这首适合把频道放低",
  "我先用一首靠近一点的人声把节目接上",
  "后面的亮度和鼓点会慢慢往前推",
] as const;

export function findBannedPhrases(text: string) {
  return DJ_BANNED_PHRASES.filter((phrase) => text.includes(phrase));
}
