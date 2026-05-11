import type { ActiveDecisionInput, DJDecision } from "./dj-types";
import { OpenAIDJProvider } from "./openai-dj-provider";

function fallbackDecision(input: ActiveDecisionInput): DJDecision {
  const sameArtistTwice =
    input.recentTracks.length >= 2 &&
    input.recentTracks[input.recentTracks.length - 1]?.artist === input.recentTracks[input.recentTracks.length - 2]?.artist;

  if (!sameArtistTwice && input.recentTracks.length < 2) {
    return {
      shouldIntervene: false,
      interventionType: "keep_flow",
      reason: "播放刚开始，保持连续性",
      djLine: "这段先不急着换，我把连贯感先稳住。",
    };
  }

  const used = new Set([...input.recentTracks, ...input.upcomingTracks].map((item) => item.id));
  const replacements = input.candidateTracks.filter((track) => !used.has(track.id)).slice(0, 3).map((t) => t.id);

  if (!replacements.length) {
    return {
      shouldIntervene: false,
      interventionType: "keep_flow",
      reason: "无可替换候选",
      djLine: "这段保持住，下一轮我再帮你换风格。",
    };
  }

  return {
    shouldIntervene: true,
    interventionType: sameArtistTwice ? "artist_break" : "style_shift",
    reason: sameArtistTwice ? "连续歌手重复" : "按节拍需要换气",
    djLine: sameArtistTwice
      ? "同一个歌手已经连续出现了，我给你换个气口，但情绪不跳戏。"
      : "刚刚这几首气质有点集中，我换一点轻快的空气。",
    replacementTrackIds: replacements,
    insertAfterCurrent: true,
  };
}

export async function decideWithGPT(input: ActiveDecisionInput): Promise<DJDecision> {
  const fallback = fallbackDecision(input);

  try {
    const provider = new OpenAIDJProvider();
    const decision = await provider.generateJson<DJDecision>(
      [
        {
          role: "system",
          content:
            "你是电台DJ控场器。输出严格JSON: shouldIntervene,interventionType,reason,djLine,replacementTrackIds,insertAfterCurrent。不要输出解释。",
        },
        {
          role: "user",
          content: JSON.stringify({
            memory: input.memory,
            context: input.context,
            recentTracks: input.recentTracks.slice(-5).map((t) => ({ id: t.id, title: t.title, artist: t.artist, tags: t.tags })),
            upcomingTracks: input.upcomingTracks.slice(0, 5).map((t) => ({ id: t.id, title: t.title, artist: t.artist, tags: t.tags })),
            candidateTracks: input.candidateTracks.slice(0, 30).map((t) => ({ id: t.id, title: t.title, artist: t.artist, tags: t.tags })),
            currentSegment: input.currentSegment ?? "main",
            rules: [
              "djLine 1-2句，口语化，不要算法口吻",
              "replacementTrackIds 只能来自 candidateTracks",
              "当前歌曲不能打断",
              "替换后续2-4首",
            ],
          }),
        },
      ],
      { temperature: 0.45 },
    );

    const candidateIds = new Set(input.candidateTracks.map((item) => item.id));
    const replacementTrackIds = (decision.replacementTrackIds ?? []).filter((id) => candidateIds.has(id)).slice(0, 4);

    return {
      ...fallback,
      ...decision,
      replacementTrackIds,
      shouldIntervene: decision.shouldIntervene && replacementTrackIds.length > 0,
      djLine: decision.djLine?.trim() || fallback.djLine,
    };
  } catch {
    return fallback;
  }
}

