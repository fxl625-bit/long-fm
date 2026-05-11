import { sanitizeDJLines } from "./dj-style-guide";
import type { DJDecision, DJProgramPlan } from "./dj-types";
import { OpenAIDJProvider } from "./openai-dj-provider";
import type { Track } from "@/lib/radio/radio-types";

type ScriptInput = {
  mode: "opening" | "bridge" | "decision" | "outro";
  currentTrack?: Track | null;
  nextTrack?: Track | null;
  decision?: DJDecision;
  program?: DJProgramPlan;
};

function fallbackLines(input: ScriptInput) {
  const currentTitle = input.currentTrack?.title ? `《${input.currentTrack.title}》` : "这首";
  const currentArtist = input.currentTrack?.artist ?? "这个声音";
  const nextTitle = input.nextTrack?.title ? `《${input.nextTrack.title}》` : "下一首";
  const nextArtist = input.nextTrack?.artist ?? "后面的声音";

  if (input.mode === "opening") {
    return [
      `${currentArtist} 的${currentTitle}先把门打开。`,
      `${currentTitle}的人声和节奏会先把频道落稳。`,
      `后面我会把它接到${nextArtist}的${nextTitle}。`,
    ];
  }

  if (input.mode === "outro") {
    return [
      "这一段先到这里。",
      "下次我会从另一个方向接着放。",
    ];
  }

  if (input.mode === "decision") {
    if (input.decision?.interventionType === "artist_break") {
      return [
        `${currentArtist}刚刚出现过一次了。`,
        `我先换到${nextArtist}的${nextTitle}。`,
      ];
    }

    return [
      `${currentTitle}这一段已经够满了。`,
      `下一首接${nextTitle}，把声场放松一点。`,
    ];
  }

  return [
    `${currentTitle}把前一段收得很近。`,
    `下一首接${nextArtist}的${nextTitle}，亮度会高一点。`,
  ];
}

export async function writeDJScript(input: ScriptInput): Promise<string> {
  const fallback = sanitizeDJLines(fallbackLines(input), fallbackLines(input));
  try {
    const provider = new OpenAIDJProvider();
    const text = await provider.generateText(
      [
        {
          role: "system",
          content:
            input.mode === "opening"
              ? "你是中文音乐电台 DJ。写 3 到 4 句短口播。每句不超过 25 个字。只说像真人 DJ 的话，不要提偏好、算法、系统、生成。"
              : "你是中文音乐电台 DJ。写 1 到 2 句短 talk break。每句不超过 25 个字。不要提偏好、算法、系统、生成。",
        },
        {
          role: "user",
          content: JSON.stringify({
            mode: input.mode,
            currentTrack: input.currentTrack ? { title: input.currentTrack.title, artist: input.currentTrack.artist } : null,
            nextTrack: input.nextTrack ? { title: input.nextTrack.title, artist: input.nextTrack.artist } : null,
            decision: input.decision
              ? {
                  type: input.decision.interventionType,
                  reason: input.decision.reason,
                }
              : null,
            programIntent: input.program?.intent,
          }),
        },
      ],
      { temperature: 0.68 },
    );
    const lines = sanitizeDJLines(
      text.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [],
      fallback,
    );
    return lines.join("");
  } catch {
    return fallback.join("");
  }
}
