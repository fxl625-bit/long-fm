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
  deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
};

function fallbackPlan(input: ProgramPlannerInput): DJProgramPlan {
  const queueTrackIds = input.playableTrackPool.slice(0, 12).map((track) => getQueuePatchTrackId(track));
  return normalizeProgramPlan(
    {
      title: input.playlistName || DEFAULT_CHANNEL_NAME,
      intent: DEFAULT_PROGRAM_INTENT,
      queueTrackIds,
      segments: [
        {
          name: "Warmup",
          purpose: "warmup",
          trackIds: queueTrackIds.slice(0, 4),
          targetMood: ["松弛", "熟悉"],
          targetEnergy: "low",
          reason: "先稳住入口。",
        },
        {
          name: "Main",
          purpose: "main",
          trackIds: queueTrackIds.slice(4, 8),
          targetMood: ["展开", "流动"],
          targetEnergy: "medium",
          reason: "把中段慢慢展开。",
        },
        {
          name: "Shift",
          purpose: "shift",
          trackIds: queueTrackIds.slice(8, 12),
          targetMood: ["换色", "透气"],
          targetEnergy: "medium",
          reason: "留一点颜色变化。",
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
