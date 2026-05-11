import { DEFAULT_CHANNEL_NAME, DEFAULT_PROGRAM_INTENT } from "@/lib/constants/product";
import { buildProgramPlannerSystemPrompt, buildProgramPlannerUserPrompt } from "@/lib/dj/dj-prompt-builder";
import type { DJDirectorContext, DJProgramPlan } from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";
import { DeepSeekClient, type DeepSeekChatJsonResult } from "@/lib/llm/deepseek-client";
import { normalizeProgramPlan } from "@/lib/llm/dj-json-schema";
import { getQueuePatchTrackId } from "./queue-selector";

type ProgramPlannerError = {
  type: "config_missing" | "api_error" | "invalid_json" | "invalid_schema" | "empty_response";
  message: string;
};

export type ProgramPlannerResult = {
  provider: "deepseek";
  configured: boolean;
  model: string;
  usedFallback: boolean;
  rawPrompt?: string;
  rawResponse?: string;
  parsedPlan: DJProgramPlan;
  error: ProgramPlannerError | null;
};

type ProgramPlannerInput = {
  playlistName: string;
  timeOfDay: DJDirectorContext["timeOfDay"];
  userMemorySummary: string;
  playableTrackPool: Track[];
  recentTracks: Track[];
  listeningContext?: {
    season?: string;
    weatherHint?: string;
    dayOfWeek?: string;
    weekdayType?: string;
    likelyScene?: string;
    energyTarget?: string;
    recommendedMood?: string[];
  };
  deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
};

function fallbackPlan(input: ProgramPlannerInput): DJProgramPlan {
  const pool = input.playableTrackPool;
  const queueTrackIds = pool.slice(0, 20).map((track) => getQueuePatchTrackId(track));

  const sorted = [...pool].sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0));
  const lowEnergy = sorted.slice(0, Math.ceil(sorted.length / 3));
  const medEnergy = sorted.slice(Math.ceil(sorted.length / 3), Math.ceil((2 * sorted.length) / 3));
  const highEnergy = sorted.slice(Math.ceil((2 * sorted.length) / 3));

  function pickDiverse(source: Track[], count: number, excludeArtists: Set<string> = new Set()): Track[] {
    const result: Track[] = [];
    const used = new Set(excludeArtists);
    const remaining = [...source];
    while (result.length < count && remaining.length > 0) {
      const idx = remaining.findIndex((track) => !used.has(track.artist.split(" / ")[0].trim()));
      if (idx === -1) {
        result.push(remaining.shift()!);
        continue;
      }
      const [track] = remaining.splice(idx, 1);
      used.add(track.artist.split(" / ")[0].trim());
      result.push(track);
    }
    return result;
  }

  const warmupTracks = pickDiverse([...lowEnergy, ...medEnergy], 4);
  const warmupArtists = new Set(warmupTracks.map((track) => track.artist.split(" / ")[0].trim()));

  const mainTracks = pickDiverse([...medEnergy, ...highEnergy], 5, warmupArtists);
  const mainArtists = new Set([...warmupArtists, ...mainTracks.map((track) => track.artist.split(" / ")[0].trim())]);

  const shiftTracks = pickDiverse([...highEnergy, ...medEnergy, ...lowEnergy], 4, mainArtists);
  const shiftArtists = new Set([...mainArtists, ...shiftTracks.map((track) => track.artist.split(" / ")[0].trim())]);

  const cooldownTracks = pickDiverse([...lowEnergy, ...medEnergy], 4, shiftArtists);

  const allSelected = [...warmupTracks, ...mainTracks, ...shiftTracks, ...cooldownTracks];
  const remaining = pool.filter((track) => !allSelected.some((selected) => selected.id === track.id));
  const finalQueue = [...allSelected, ...remaining].slice(0, 30);

  const timeOfDay = input.timeOfDay;
  const titleSuffix = timeOfDay === "morning" ? "晨间启程" : timeOfDay === "afternoon" ? "午后流动" : timeOfDay === "evening" ? "黄昏轨迹" : "深夜静听";

  return normalizeProgramPlan(
    {
      title: `${input.playlistName || DEFAULT_CHANNEL_NAME} · ${titleSuffix}`,
      intent: DEFAULT_PROGRAM_INTENT,
      queueTrackIds: finalQueue.map((track) => getQueuePatchTrackId(track)),
      segments: [
        {
          name: "开场稳住",
          purpose: "warmup",
          trackIds: warmupTracks.map((track) => getQueuePatchTrackId(track)),
          targetMood: ["松弛", "熟悉"],
          targetEnergy: "low",
          reason: "用熟悉的声音先把频道锚定住。",
        },
        {
          name: "逐步推进",
          purpose: "main",
          trackIds: mainTracks.map((track) => getQueuePatchTrackId(track)),
          targetMood: ["展开", "流动"],
          targetEnergy: "medium",
          reason: "保持连贯，慢慢把节奏和色彩推起来。",
        },
        {
          name: "换色拓展",
          purpose: "shift",
          trackIds: shiftTracks.map((track) => getQueuePatchTrackId(track)),
          targetMood: ["换色", "透气"],
          targetEnergy: timeOfDay === "morning" ? "high" : "medium",
          reason: "引入新音色或语种，拓宽听感。",
        },
        {
          name: "收束余韵",
          purpose: "cooldown",
          trackIds: cooldownTracks.map((track) => getQueuePatchTrackId(track)),
          targetMood: ["收束", "沉淀"],
          targetEnergy: "low",
          reason: "用有沉淀感的作品让频道自然收尾。",
        },
      ],
    },
    {
      allowedTrackIds: input.playableTrackPool.map((track) => getQueuePatchTrackId(track)),
    },
  );
}

export async function createProgramPlanWithDeepSeek(input: ProgramPlannerInput): Promise<ProgramPlannerResult> {
  const deepseekClient = input.deepseekClient ?? new DeepSeekClient();
  const configured = input.deepseekClient ? true : deepseekClient.isConfigured();
  const model = deepseekClient.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const fallback = fallbackPlan(input);
  const rawPrompt = buildProgramPlannerUserPrompt({
    playlistName: input.playlistName,
    timeOfDay: input.timeOfDay,
    userMemorySummary: input.userMemorySummary,
    playableTrackPool: input.playableTrackPool,
    recentTracks: input.recentTracks,
    listeningContext: input.listeningContext,
  });

  if (!configured) {
    return {
      provider: "deepseek",
      configured: false,
      model,
      usedFallback: true,
      rawPrompt,
      parsedPlan: fallback,
      error: {
        type: "config_missing",
        message: "DEEPSEEK_API_KEY is not configured.",
      },
    };
  }

  const response = (await deepseekClient.chatJson<Record<string, unknown>>({
    systemPrompt: buildProgramPlannerSystemPrompt(),
    userPrompt: rawPrompt,
    temperature: 0.7,
    maxTokens: 1600,
  })) as DeepSeekChatJsonResult<Record<string, unknown>>;

  if (!response.ok) {
    return {
      provider: "deepseek",
      configured: true,
      model,
      usedFallback: true,
      rawPrompt,
      rawResponse: response.rawText,
      parsedPlan: fallback,
      error: response.error ?? {
        type: "api_error",
        message: "DeepSeek program planner failed.",
      },
    };
  }

  return {
    provider: "deepseek",
    configured: true,
    model,
    usedFallback: false,
    rawPrompt,
    rawResponse: response.rawText,
    parsedPlan: normalizeProgramPlan(response.data ?? {}, {
      allowedTrackIds: input.playableTrackPool.map((track) => getQueuePatchTrackId(track)),
    }),
    error: null,
  };
}
