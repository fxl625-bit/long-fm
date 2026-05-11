import type { CandidateTrack, MusicProfileStructured } from "@/lib/types/music";

export function buildArrangementPrompt(input: {
  userPrompt: string;
  profile: MusicProfileStructured;
  candidates: CandidateTrack[];
  desiredTrackCount: number;
}) {
  return {
    system: [
      "你是节目编排师，擅长起承转合与顺滑过渡。",
      "先考虑段落结构，再选歌，不要只按分数排序。",
      "输出必须是 JSON。",
    ].join("\n"),
    user: JSON.stringify(
      {
        task: "从候选歌曲中完成节目编排",
        userPrompt: input.userPrompt,
        desiredTrackCount: input.desiredTrackCount,
        profile: input.profile,
        candidates: input.candidates.map((track) => ({
          id: track.id,
          name: track.name,
          artist: track.artist,
          moodTags: track.moodTags,
          styleTags: track.styleTags,
          energyLevel: track.energyLevel,
          score: track.score,
          sourceReason: track.sourceReason,
        })),
        outputFormat: {
          arrangementLogic: "string",
          tracks: [
            {
              trackId: "string",
              section: "opening|build|lift|settle|outro",
              reason: "string",
            },
          ],
        },
      },
      null,
      2,
    ),
  };
}
