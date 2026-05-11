import type { DJProgramPlan, PlanProgramInput } from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";
import { OpenAIDJProvider } from "./openai-dj-provider";

function baseProgramTitle(playlistName?: string) {
  return playlistName ? `${playlistName} On Air` : "Auralia FM";
}

function ensureSentence(text: string) {
  if (!text) {
    return "";
  }
  return /[。！？]$/.test(text) ? text : `${text}。`;
}

function buildFallbackSegments(trackIds: string[]): DJProgramPlan["segments"] {
  const segmentPurposes: Array<DJProgramPlan["segments"][number]["purpose"]> = [
    "warmup",
    "main",
    "shift",
    "discovery",
    "cooldown",
  ];
  type SegmentEnergy = DJProgramPlan["segments"][number]["targetEnergy"];
  const chunks = [trackIds.slice(0, 3), trackIds.slice(3, 7), trackIds.slice(7, 10), trackIds.slice(10, 13), trackIds.slice(13, 16)];

  return chunks
    .map((chunk, index) => {
      if (!chunk.length) {
        return null;
      }
      const purpose = segmentPurposes[index] ?? "main";
      return {
        name: purpose.charAt(0).toUpperCase() + purpose.slice(1),
        purpose,
        targetMood:
          purpose === "warmup"
            ? ["熟悉", "稳定"]
            : purpose === "main"
              ? ["流动", "展开"]
              : purpose === "cooldown"
                ? ["收束", "安静"]
                : ["换色", "透气"],
        targetEnergy: (purpose === "warmup" || purpose === "cooldown" ? "low" : "medium") as SegmentEnergy,
        trackIds: chunk,
        reason:
          purpose === "warmup"
            ? "先把频道稳住。"
            : purpose === "main"
              ? "把主线慢慢展开。"
              : purpose === "cooldown"
                ? "让这段节目安静落下。"
                : "给耳朵换一层颜色。",
      };
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
}

function normalizePlan(plan: DJProgramPlan, allowedIds: Set<string>) {
  const queueTrackIds = plan.queueTrackIds.filter((id) => allowedIds.has(id));
  const seen = new Set(queueTrackIds);
  const segments = plan.segments
    .map((segment) => ({
      ...segment,
      reason: ensureSentence(segment.reason),
      trackIds: segment.trackIds.filter((id) => allowedIds.has(id)),
    }))
    .filter((segment) => segment.trackIds.length > 0);

  for (const segment of segments) {
    for (const trackId of segment.trackIds) {
      if (seen.has(trackId)) {
        continue;
      }
      queueTrackIds.push(trackId);
      seen.add(trackId);
    }
  }

  return {
    ...plan,
    segments,
    queueTrackIds,
  };
}

function fallbackProgram(input: PlanProgramInput): DJProgramPlan {
  const queueTrackIds = input.candidateTracks.slice(0, 16).map((track) => track.id);
  return {
    title: baseProgramTitle(),
    intent: "先稳住，再慢慢展开，最后自然收束。",
    queueTrackIds,
    segments: buildFallbackSegments(queueTrackIds),
  };
}

export async function createProgramWithGPT(input: PlanProgramInput): Promise<DJProgramPlan> {
  const fallback = fallbackProgram(input);
  if (!input.candidateTracks.length) {
    return fallback;
  }

  const allowedIds = new Set(input.candidateTracks.map((track) => track.id));

  try {
    const provider = new OpenAIDJProvider();
    const aiPlan = await provider.generateJson<DJProgramPlan>(
      [
        {
          role: "system",
          content:
            "你是节目编排引擎。只输出严格 JSON，字段只允许包含 title、intent、queueTrackIds、segments。不要生成主持词、openingLines、hostingMoments、djMoments。",
        },
        {
          role: "user",
          content: JSON.stringify({
            memory: input.memory,
            context: input.context,
            recentPlayed: input.recentPlayed.slice(0, 5).map((track) => ({ id: track.id, title: track.title, artist: track.artist })),
            recentSkipped: input.recentSkipped.slice(0, 5).map((track) => ({ id: track.id, title: track.title, artist: track.artist })),
            candidateTracks: input.candidateTracks.slice(0, 80).map((track) => ({
              id: track.id,
              title: track.title,
              artist: track.artist,
              tags: track.tags,
            })),
            rules: [
              "segments 至少 3 段。",
              "queueTrackIds 只能来自 candidateTracks。",
              "不要生成任何主持词或口播字段。",
            ],
          }),
        },
      ],
      { strong: true, temperature: 0.5 },
    );

    const normalized = normalizePlan(aiPlan, allowedIds);
    if (!normalized.queueTrackIds.length) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}

export function buildRuntimeProgramPlan(input: {
  playlistName?: string;
  queue: Track[];
}): DJProgramPlan {
  const queueTrackIds = input.queue.map((track) => track.providerTrackId ?? track.neteaseId ?? track.id);
  return {
    title: baseProgramTitle(input.playlistName),
    intent: "先稳住，再慢慢展开，最后自然收束。",
    queueTrackIds,
    segments: buildFallbackSegments(queueTrackIds),
  };
}
