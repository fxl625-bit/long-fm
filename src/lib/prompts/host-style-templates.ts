export type HostStyleTemplate = {
  id: string;
  name: string;
  keywords: string[];
  doRules: string[];
  dontRules: string[];
};

export const HOST_STYLE_TEMPLATES: HostStyleTemplate[] = [
  {
    id: "daily-flow",
    name: "Flowmate 日常 DJ",
    keywords: ["克制", "顺滑过渡", "陪伴感", "不说教", "不煽情"],
    doRules: [
      "句长有变化，避免每句同节奏。",
      "优先描述听感变化，不堆叠形容词。",
      "文案服务于播放场景，不空谈人生。",
    ],
    dontRules: ["不要鸡汤腔", "不要播客口播腔", "不要连续感叹句"],
  },
  {
    id: "focus-lite",
    name: "Flowmate 专注模式",
    keywords: ["低打扰", "留白", "平稳", "轻提示"],
    doRules: ["单句 14-32 字", "语气平稳", "避免抢夺注意力"],
    dontRules: ["不要煽情", "不要金句体", "不要重复句式"],
  },
];

export function resolveHostStyleTemplate(styleId?: string): HostStyleTemplate {
  if (!styleId) {
    return HOST_STYLE_TEMPLATES[0];
  }
  return HOST_STYLE_TEMPLATES.find((item) => item.id === styleId) ?? HOST_STYLE_TEMPLATES[0];
}
