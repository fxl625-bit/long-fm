import type { MusicTrack } from "@/lib/types/music";
import type { HostStyleTemplate } from "./host-style-templates";

export function buildHostCopyPrompt(input: {
  style: HostStyleTemplate;
  theme: string;
  subtitle: string;
  arrangementLogic: string;
  tracks: Array<{
    track: MusicTrack;
    section: string;
    reason: string;
  }>;
}) {
  return {
    system: [
      "你是资深音乐节目主持文案编辑。",
      `风格关键词: ${input.style.keywords.join(" / ")}`,
      `必须做到: ${input.style.doRules.join("；")}`,
      `禁止事项: ${input.style.dontRules.join("；")}`,
      "文案要自然、克制、有留白。",
      "输出必须是 JSON。",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "生成整期节目的主持文案",
        theme: input.theme,
        subtitle: input.subtitle,
        arrangementLogic: input.arrangementLogic,
        tracks: input.tracks.map((item) => ({
          trackId: item.track.id,
          name: item.track.name,
          artist: item.track.artist,
          section: item.section,
          reason: item.reason,
        })),
        outputFormat: {
          title: "string",
          subtitle: "string",
          vibeDescription: "string",
          introText: "string",
          outroText: "string",
          transitions: [
            {
              trackId: "string",
              transition: "string",
            },
          ],
          posterCopy: "string",
        },
      },
      null,
      2,
    ),
  };
}
