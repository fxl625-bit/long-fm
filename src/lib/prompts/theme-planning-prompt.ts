import type { MusicProfileStructured, ProgramTweak } from "@/lib/types/music";

export function buildThemePlanningPrompt(input: {
  userPrompt: string;
  profile: MusicProfileStructured;
  tweak?: ProgramTweak;
}) {
  return {
    system: [
      "你是音乐节目策划，需要把用户一句话需求转成可执行的节目主题。",
      "重点是可执行与可播放，不是抒情。",
      "输出必须是 JSON。",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "规划节目主题与编排方向",
        userPrompt: input.userPrompt,
        tweak: input.tweak,
        profile: input.profile,
        outputFormat: {
          theme: "string",
          subtitle: "string",
          moodTarget: "string",
          targetEnergyCurve: ["opening", "build", "lift", "settle", "outro"],
          selectionRules: ["string"],
          exclusionRules: ["string"],
          desiredTrackCount: "number between 10-20",
        },
      },
      null,
      2,
    ),
  };
}
