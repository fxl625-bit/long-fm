import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import { buildBroadcastPersonaRules, buildBroadcastPersonaSystemPrompt } from "./broadcast-persona-prompt";
import { RADIO_HOST_CORPUS } from "./corpus/radio-host-corpus";
import type {
  DJDirectorContext,
  DJDirectorDecision,
  DJDirectorTrigger,
  DirectorDecisionResult,
  DirectorMusicAction,
  DirectorResultError,
} from "./dj-types";

type NormalizedDecisionInput = {
  allowedTrackIds: string[];
};

type DirectorDeps = {
  deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
  fetchImpl?: typeof fetch;
};

const musicActionTypes = new Set<DirectorMusicAction["type"]>(["none", "skip", "reorder", "inject"]);
const energyValues = new Set<DJDirectorDecision["energy"]>(["low", "mid", "high"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function shouldRetryForEmptySpeak(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }
  return value.shouldSpeak === true && typeof value.speech === "string" && value.speech.trim().length === 0;
}

function sanitizeTrackIds(value: unknown, allowedTrackIds: Set<string>) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const trackIds: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    if (!allowedTrackIds.has(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    trackIds.push(item);
    if (trackIds.length >= 5) {
      break;
    }
  }

  return trackIds;
}

function normalizeEnergy(value: unknown): DJDirectorDecision["energy"] | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0.33) {
      return "low";
    }
    if (value >= 0.67) {
      return "high";
    }
    return "mid";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "medium") {
    return "mid";
  }
  if (energyValues.has(normalized as DJDirectorDecision["energy"])) {
    return normalized as DJDirectorDecision["energy"];
  }
  return null;
}

function normalizePositiveInteger(value: unknown, fallback: number, limits: { min: number; max: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  return Math.min(limits.max, Math.max(limits.min, rounded));
}

function buildCorpusExcerpt(limit = 8) {
  return RADIO_HOST_CORPUS.slice(0, limit)
    .map((entry, index) => `${index + 1}. ${entry.lines.join("")}`)
    .join("\n");
}

function describeCurrentWindow(timeOfDay: DJDirectorContext["timeOfDay"]) {
  if (timeOfDay === "morning") return "城市刚醒，人的注意力还没完全贴到现实上。";
  if (timeOfDay === "afternoon") return "下午的空气偏平，适合专注、走神和慢慢进入状态。";
  if (timeOfDay === "evening") return "傍晚到夜前的时间，街上开始有回程感。";
  return "夜里更安静，房间、耳机和心事都更靠近。";
}

function describeSilencePressure(context: DJDirectorContext) {
  const tracks = context.tracksSinceLastSpeak ?? 0;
  const minutes = context.minutesSinceLastSpeak ?? 0;

  if (context.forceSpeak) {
    return `已经安静了 ${tracks} 首歌，约 ${minutes} 分钟，现在需要自然开口。`;
  }
  if (tracks === 0 && minutes < 2) {
    return "刚开过口不久，可以继续把空间留给音乐。";
  }
  return `已经沉默 ${tracks} 首歌，约 ${minutes} 分钟，但还没到必须打破安静的时候。`;
}

function toPromptTrack(track: DJDirectorContext["currentTrack"] | DJDirectorContext["nextTrack"] | undefined | null) {
  if (!track) {
    return null;
  }

  return {
    providerTrackId: track.providerTrackId ?? track.id,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
  };
}

export function buildDirectorPromptPayload(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
}) {
  const previousTrack = input.context.recentTracks.at(-1);

  return {
    trigger: input.trigger,
    forceSpeak: Boolean(input.context.forceSpeak),
    currentTrack: toPromptTrack(input.context.currentTrack),
    previousTrack: toPromptTrack(previousTrack),
    nextTrack: toPromptTrack(input.context.nextTrack),
    recentTracks: input.context.recentTracks.slice(-3).map((track) => toPromptTrack(track)),
    upcomingTracks: input.context.upcomingTracks.slice(0, 5).map((track) => toPromptTrack(track)),
    playableTrackPool: (input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks])
      .slice(0, 12)
      .map((track) => toPromptTrack(track)),
    timeOfDay: input.context.timeOfDay,
    userIntent: input.context.userIntent ?? null,
    userMemorySummary: input.context.userMemory.summary?.trim() || "这个听众喜欢让音乐自己说话，但也希望频道像真的有人在场。",
    recentLines: input.context.recentLines?.slice(-4) ?? [],
    sceneContext: {
      timeOfDay: input.context.timeOfDay,
      currentWindow: describeCurrentWindow(input.context.timeOfDay),
      silencePressure: describeSilencePressure(input.context),
    },
    hostCorpusExcerpt: buildCorpusExcerpt(),
  };
}

export function normalizeDirectorDecision(
  raw: unknown,
  options: NormalizedDecisionInput,
): DJDirectorDecision | null {
  if (!isRecord(raw)) {
    return null;
  }

  const shouldSpeak = typeof raw.shouldSpeak === "boolean" ? raw.shouldSpeak : null;
  const energy = normalizeEnergy(raw.energy);
  const speech = typeof raw.speech === "string" ? raw.speech.trim() : "";
  const musicAction = isRecord(raw.musicAction) ? raw.musicAction : null;

  if (shouldSpeak == null || !energy || !musicAction || !musicActionTypes.has(musicAction.type as DirectorMusicAction["type"])) {
    return null;
  }

  if (shouldSpeak && !speech) {
    return null;
  }

  const normalizedAction: DirectorMusicAction = { type: musicAction.type as DirectorMusicAction["type"] };
  const reason = typeof musicAction.reason === "string" ? musicAction.reason.trim() : "";
  if (reason) {
    normalizedAction.reason = reason;
  }

  const allowedTrackIds = new Set(options.allowedTrackIds);
  const trackIds = sanitizeTrackIds(musicAction.trackIds, allowedTrackIds);
  if ((normalizedAction.type === "reorder" || normalizedAction.type === "inject") && !trackIds.length) {
    return null;
  }
  if (normalizedAction.type === "skip" && trackIds.length) {
    normalizedAction.trackIds = trackIds;
  }
  if (trackIds.length) {
    normalizedAction.trackIds = trackIds;
  }

  return {
    shouldSpeak,
    speech,
    durationHintSec: normalizePositiveInteger(raw.durationHintSec, shouldSpeak ? 24 : 0, { min: 0, max: 45 }),
    insertAfterTracks: normalizePositiveInteger(raw.insertAfterTracks, 2, { min: 1, max: 4 }),
    musicAction: normalizedAction,
    energy,
  };
}

function buildPrompt(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
}) {
  const payload = buildDirectorPromptPayload(input);
  return JSON.stringify({
    ...payload,
    rules: buildBroadcastPersonaRules({
      forceSpeak: Boolean(input.context.forceSpeak),
      timeOfDay: input.context.timeOfDay,
    }),
  });
}

function buildSystemPrompt() {
  return buildBroadcastPersonaSystemPrompt();
}

function buildOfflineResult(input: {
  provider: "deepseek" | "unknown";
  configured: boolean;
  model: string;
  error: DirectorResultError;
  rawPrompt?: string;
  rawResponse?: string;
}): DirectorDecisionResult {
  return {
    ok: false,
    mode: "offline",
    provider: input.provider,
    configured: input.configured,
    model: input.model,
    decision: null,
    rawPrompt: input.rawPrompt,
    rawResponse: input.rawResponse,
    error: input.error,
  };
}

export class LLMDJDirector {
  private readonly deepseekClient: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
  private readonly fetchImpl: typeof fetch;

  constructor(input: DirectorDeps = {}) {
    this.deepseekClient = input.deepseekClient ?? new DeepSeekClient();
    const baseFetch = input.fetchImpl ?? fetch;
    this.fetchImpl = ((resource: RequestInfo | URL, init?: RequestInit) => baseFetch(resource, init)) as typeof fetch;
  }

  private shouldUseServerRoute() {
    return typeof window !== "undefined";
  }

  private async requestDecisionViaServerRoute(input: {
    trigger: DJDirectorTrigger;
    context: DJDirectorContext;
    rawPrompt: string;
    model: string;
  }): Promise<DirectorDecisionResult> {
    let response: Response;
    try {
      response = await this.fetchImpl("/api/dj/director", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trigger: input.trigger,
          context: input.context,
        }),
      });
    } catch (error) {
      return buildOfflineResult({
        provider: "unknown",
        configured: false,
        model: input.model,
        rawPrompt: input.rawPrompt,
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : "Director route request failed.",
        },
      });
    }

    let payload:
      | {
          ok?: boolean;
          provider?: "deepseek" | "unknown";
          configured?: boolean;
          model?: string;
          decision?: unknown;
          rawPrompt?: string;
          rawResponse?: string;
          error?: DirectorResultError | null;
        }
      | undefined;

    try {
      payload = (await response.json()) as {
        ok?: boolean;
        provider?: "deepseek" | "unknown";
        configured?: boolean;
        model?: string;
        decision?: unknown;
        rawPrompt?: string;
        rawResponse?: string;
        error?: DirectorResultError | null;
      };
    } catch {
      return buildOfflineResult({
        provider: "unknown",
        configured: false,
        model: input.model,
        rawPrompt: input.rawPrompt,
        error: {
          type: "invalid_json",
          message: "Director route returned invalid JSON.",
        },
      });
    }

    const allowedTrackIds = (input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks]).map((track) =>
      String(track.providerTrackId ?? track.id),
    );
    const payloadDecision = payload?.decision;
    const decision = payloadDecision
      ? normalizeDirectorDecision(payloadDecision, {
          allowedTrackIds,
        })
      : null;

    if (!response.ok || !payload || payload.ok !== true || !decision) {
      return buildOfflineResult({
        provider: payload?.provider ?? "unknown",
        configured: payload?.configured ?? false,
        model: payload?.model ?? input.model,
        rawPrompt: payload?.rawPrompt ?? input.rawPrompt,
        rawResponse: payload?.rawResponse,
        error:
          payload?.error ?? {
            type: "invalid_payload",
            message: response.ok ? "Director route returned an invalid payload." : `Director route failed: ${response.status}.`,
          },
      });
    }

    return {
      ok: true,
      mode: "live",
      provider: "deepseek",
      configured: true,
      model: payload.model ?? input.model,
      decision,
      rawPrompt: payload.rawPrompt ?? input.rawPrompt,
      rawResponse: payload.rawResponse,
      error: null,
    };
  }

  private async requestDecisionOnce(input: {
    trigger: DJDirectorTrigger;
    context: DJDirectorContext;
    rawPrompt: string;
    model: string;
  }): Promise<DirectorDecisionResult & { retryableEmptySpeak?: boolean }> {
    const response = await this.deepseekClient.chatJson<unknown>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: input.rawPrompt,
      temperature: 0.25,
      maxTokens: 600,
    });

    if (!response.ok) {
      return buildOfflineResult({
        provider: "deepseek",
        configured: true,
        model: input.model,
        rawPrompt: input.rawPrompt,
        rawResponse: response.rawText,
        error: response.error ?? {
          type: "api_error",
          message: "DeepSeek request failed.",
        },
      });
    }

    if (!response.data) {
      return buildOfflineResult({
        provider: "deepseek",
        configured: true,
        model: input.model,
        rawPrompt: input.rawPrompt,
        rawResponse: response.rawText,
        error: {
          type: "empty_response",
          message: "DeepSeek director returned an empty payload.",
        },
      });
    }

    const retryableEmptySpeak = shouldRetryForEmptySpeak(response.data);
    const allowedTrackIds = (input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks]).map((track) =>
      String(track.providerTrackId ?? track.id),
    );
    const decision = normalizeDirectorDecision(response.data, { allowedTrackIds });

    if (!decision) {
      return {
        ...buildOfflineResult({
          provider: "deepseek",
          configured: true,
          model: input.model,
          rawPrompt: input.rawPrompt,
          rawResponse: response.rawText,
          error: {
            type: "invalid_payload",
            message: "DeepSeek director returned an invalid payload.",
          },
        }),
        retryableEmptySpeak,
      };
    }

    return {
      ok: true,
      mode: "live",
      provider: "deepseek",
      configured: true,
      model: input.model,
      decision,
      rawPrompt: input.rawPrompt,
      rawResponse: response.rawText,
      error: null,
      retryableEmptySpeak,
    };
  }

  async decide(input: {
    trigger: DJDirectorTrigger;
    context: DJDirectorContext;
    fallback?: DJDirectorDecision;
  }): Promise<DirectorDecisionResult> {
    const model = this.deepseekClient.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const rawPrompt = buildPrompt({ trigger: input.trigger, context: input.context });

    if (this.shouldUseServerRoute()) {
      return this.requestDecisionViaServerRoute({
        trigger: input.trigger,
        context: input.context,
        rawPrompt,
        model,
      });
    }

    const configured = typeof this.deepseekClient.isConfigured === "function" ? this.deepseekClient.isConfigured() : true;

    if (!configured) {
      return buildOfflineResult({
        provider: "unknown",
        configured: false,
        model,
        rawPrompt,
        error: {
          type: "config_missing",
          message: "DEEPSEEK_API_KEY is not configured.",
        },
      });
    }

    const firstAttempt = await this.requestDecisionOnce({
      trigger: input.trigger,
      context: input.context,
      rawPrompt,
      model,
    });

    if (
      firstAttempt.retryableEmptySpeak ||
      (firstAttempt.ok && firstAttempt.decision.shouldSpeak && !firstAttempt.decision.speech.trim())
    ) {
      const retryPrompt = `${rawPrompt}\n${JSON.stringify({
        retryReason: "shouldSpeak_true_but_speech_empty",
        instruction: "You already decided to speak. Retry once and provide a non-empty continuous spoken paragraph.",
      })}`;
      return this.requestDecisionOnce({
        trigger: input.trigger,
        context: input.context,
        rawPrompt: retryPrompt,
        model,
      });
    }

    return firstAttempt;
  }
}
