import { buildMusicContext } from "./music-context-builder";
import { buildDirectorSystemPrompt, buildDirectorUserPrompt } from "@/lib/dj/dj-prompt-builder";
import { buildSongTalkContext } from "./song-background-service";
import { DJ_BANNED_PHRASES } from "./dj-banned-phrases";
import { guardDJLines } from "./final-dj-line-guard";
import { fallbackLinesForTrigger } from "./dj-style-guide";
import { ensureQueuePatchForDecision, getQueuePatchTrackId, selectTracksForDirection } from "./queue-selector";
import { validateDJLines, type DJLineValidationContext } from "./dj-line-quality-checker";
import type { DJDirectingDecision, DJDirectorContext, DJDirectorTrigger } from "./dj-types";
import { buildSongBrief, type SongBrief } from "./song-brief-service";
import { RadioHostPlanner, type TalkBreakPlan } from "./radio-host-planner";
import { RadioHostWriter, type TalkBreakScript } from "./radio-host-writer";
import { normalizeDJDecision } from "@/lib/llm/dj-json-schema";
import { DeepSeekClient, type DeepSeekChatJsonResult } from "@/lib/llm/deepseek-client";
import type { Track } from "@/lib/radio/radio-types";

type DJBrainError = {
  type: "config_missing" | "api_error" | "invalid_json" | "invalid_schema" | "empty_response";
  message: string;
};

export type DJBrainResult = {
  provider: "deepseek" | "fallback";
  configured: boolean;
  model: string;
  keyPresent: boolean;
  usedFallback: boolean;
  rawPrompt?: string;
  rawResponse?: string;
  parsedDecision?: DJDirectingDecision;
  error: DJBrainError | null;
};

type DJBrainDeps = {
  deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
  songBriefBuilder?: (track: Track) => Promise<SongBrief>;
  hostPlanner?: Pick<RadioHostPlanner, "plan">;
  hostWriter?: Pick<RadioHostWriter, "write">;
};

type PromptArtifacts = {
  musicContext: ReturnType<typeof buildMusicContext>;
  currentSongTalk: Awaited<ReturnType<typeof buildSongTalkContext>>;
  previousSongTalk: Awaited<ReturnType<typeof buildSongTalkContext>> | null;
  nextSongTalk: Awaited<ReturnType<typeof buildSongTalkContext>> | null;
  selectedTargetTracks: Awaited<ReturnType<typeof buildSongTalkContext>>[];
  currentSongBrief: SongBrief;
  previousSongBrief: SongBrief | null;
  nextSongBrief: SongBrief | null;
  selectedTargetBriefs: SongBrief[];
  transition: {
    from: string;
    to: string;
    why: string;
  };
};

function triggerToAction(trigger: DJDirectorTrigger): DJDirectingDecision["action"] {
  switch (trigger) {
    case "introduce_current":
      return "introduce_current";
    case "bridge_to_next":
      return "bridge_to_next";
    case "shift_style":
      return "shift_style";
    case "raise_energy":
      return "raise_energy";
    case "lower_energy":
      return "lower_energy";
    case "insert_discovery":
      return "insert_discovery";
    case "avoid_repetition":
      return "avoid_repetition";
    case "user_tune":
      return "user_tune";
    case "music_paused":
    case "music_ended":
      return "stop_talking";
    default:
      return "keep_flow";
  }
}

function coerceModelDecision(raw: Record<string, unknown>, trigger: DJDirectorTrigger) {
  const decision = { ...raw } as Record<string, unknown>;
  const expectedAction = triggerToAction(trigger);
  const rawAction = typeof decision.action === "string" ? decision.action : "";
  const allowedAction =
    rawAction === "keep_flow" ||
    rawAction === "introduce_current" ||
    rawAction === "bridge_to_next" ||
    rawAction === "shift_style" ||
    rawAction === "raise_energy" ||
    rawAction === "lower_energy" ||
    rawAction === "insert_discovery" ||
    rawAction === "avoid_repetition" ||
    rawAction === "skip_to_next" ||
    rawAction === "user_tune" ||
    rawAction === "stop_talking";

  if (!allowedAction) {
    decision.action = expectedAction;
  }

  const queuePatch =
    decision.queuePatch && typeof decision.queuePatch === "object"
      ? ({ ...(decision.queuePatch as Record<string, unknown>) } as Record<string, unknown>)
      : null;

  if (queuePatch && Array.isArray(queuePatch.trackIds) && typeof queuePatch.mode !== "string") {
    queuePatch.mode = trigger === "insert_discovery" ? "insert_after_current" : trigger === "user_tune" ? "reorder_upcoming" : "replace_next";
    decision.queuePatch = queuePatch;
  }

  const freeformTalk = typeof decision.spokenText === "string" ? decision.spokenText : typeof decision.talk === "string" ? decision.talk : null;
  if ((!Array.isArray(decision.lines) || decision.lines.length === 0) && freeformTalk) {
    decision.lines = freeformTalk
      .split(/[。！？!?]/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return decision;
}

function buildFallbackDecision(trigger: DJDirectorTrigger, context: DJDirectorContext): DJDirectingDecision {
  return {
    action: triggerToAction(trigger),
    shouldSpeak: trigger !== "music_paused" && trigger !== "music_ended",
    lines: fallbackLinesForTrigger(trigger, context),
    reason: `Fallback decision for ${trigger}.`,
    meta: {
      provider: "fallback",
      usedFallback: true,
      fallbackReason: `Fallback decision for ${trigger}.`,
      promptType: trigger,
    },
  };
}

function buildValidationContext(
  context: DJDirectorContext,
  artifacts: PromptArtifacts,
  facts: { usedFacts?: string[]; usedAngles?: string[] } = {},
): DJLineValidationContext {
  const previousTrack = context.recentTracks.at(-1);
  return {
    currentTrack: {
      providerTrackId: artifacts.currentSongTalk.providerTrackId,
      title: artifacts.currentSongTalk.title,
      artist: artifacts.currentSongTalk.artist,
      album: artifacts.currentSongTalk.album,
      soundHints: artifacts.currentSongTalk.soundNotes,
      lyricExcerpt: artifacts.currentSongTalk.lyricExcerpt,
      albumContext: artifacts.currentSongTalk.albumContext,
      artistContext: artifacts.currentSongTalk.artistContext,
    },
    previousTrack: previousTrack && artifacts.previousSongTalk
      ? {
          providerTrackId: artifacts.previousSongTalk.providerTrackId,
          title: artifacts.previousSongTalk.title,
          artist: artifacts.previousSongTalk.artist,
          album: artifacts.previousSongTalk.album,
          soundHints: artifacts.previousSongTalk.soundNotes,
          lyricExcerpt: artifacts.previousSongTalk.lyricExcerpt,
          albumContext: artifacts.previousSongTalk.albumContext,
          artistContext: artifacts.previousSongTalk.artistContext,
        }
      : undefined,
    nextTrack: artifacts.selectedTargetTracks[0]
      ? {
          providerTrackId: artifacts.selectedTargetTracks[0].providerTrackId,
          title: artifacts.selectedTargetTracks[0].title,
          artist: artifacts.selectedTargetTracks[0].artist,
          album: artifacts.selectedTargetTracks[0].album,
          soundHints: artifacts.selectedTargetTracks[0].soundNotes,
        }
      : artifacts.nextSongTalk
        ? {
            providerTrackId: artifacts.nextSongTalk.providerTrackId,
            title: artifacts.nextSongTalk.title,
            artist: artifacts.nextSongTalk.artist,
            album: artifacts.nextSongTalk.album,
            soundHints: artifacts.nextSongTalk.soundNotes,
          }
        : undefined,
    transition: artifacts.transition,
    segment: {
      name: context.currentSegment,
      purpose: context.currentSegment,
      mood: context.userMemory.inferredMoods,
      hostNarrative: artifacts.transition.why,
    },
    recentLines: context.recentLines?.slice(-10) ?? [],
    timeOfDay: context.timeOfDay,
    currentSongBrief: artifacts.currentSongBrief,
    previousSongBrief: artifacts.previousSongBrief,
    nextSongBrief: artifacts.selectedTargetBriefs[0] ?? artifacts.nextSongBrief,
    usedFacts: facts.usedFacts ?? [],
    usedAngles: facts.usedAngles ?? [],
  };
}

function dropSpeech(decision: DJDirectingDecision, reason: string): DJDirectingDecision {
  return {
    ...decision,
    shouldSpeak: false,
    lines: [],
    reason: `${decision.reason} ${reason}`.trim(),
  };
}

async function buildPromptArtifacts(
  context: DJDirectorContext,
  trigger: DJDirectorTrigger,
  songBriefBuilder: (track: Track) => Promise<SongBrief>,
): Promise<PromptArtifacts> {
  const musicContext = buildMusicContext(context);
  const previousTrack = context.recentTracks.at(-1) ?? null;
  const currentSongBrief = await songBriefBuilder(context.currentTrack);
  const previousSongBrief = previousTrack ? await songBriefBuilder(previousTrack) : null;
  const nextSongBrief = context.nextTrack ? await songBriefBuilder(context.nextTrack) : null;
  const currentSongTalk = await buildSongTalkContext(context.currentTrack);
  const previousSongTalk = previousTrack ? await buildSongTalkContext(previousTrack) : null;
  const nextSongTalk = context.nextTrack ? await buildSongTalkContext(context.nextTrack) : null;

  const selectedTargetIds =
    trigger === "user_tune"
      ? selectTracksForDirection({
          userIntent: context.userIntent,
          currentTrack: context.currentTrack,
          recentTracks: context.recentTracks,
          upcomingTracks: context.upcomingTracks,
          pool: context.playableTrackPool ?? [context.currentTrack, ...context.upcomingTracks],
          count: 5,
        })
      : [];

  const pool = context.playableTrackPool ?? [context.currentTrack, ...context.upcomingTracks];
  const byProviderId = new Map(pool.map((track) => [getQueuePatchTrackId(track), track]));
  const selectedTargetBriefs = await Promise.all(
    selectedTargetIds
      .map((trackId) => byProviderId.get(trackId))
      .filter((track): track is Track => Boolean(track))
      .slice(0, 5)
      .map((track) => songBriefBuilder(track)),
  );
  const selectedTargetTracks = await Promise.all(
    selectedTargetIds
      .map((trackId) => byProviderId.get(trackId))
      .filter((track): track is Track => Boolean(track))
      .slice(0, 5)
      .map((track) => buildSongTalkContext(track)),
  );

  const targetTrack = selectedTargetBriefs[0] ? byProviderId.get(selectedTargetBriefs[0].providerTrackId) : context.nextTrack;
  const transition = targetTrack
    ? {
        from: `${context.currentTrack.artist} 的${currentSongTalk.soundNotes?.[0] ?? currentSongBrief.soundProfile.vocal ?? "当前声线"}`,
        to: `${targetTrack.artist} 的${selectedTargetTracks[0]?.soundNotes?.[0] ?? nextSongTalk?.soundNotes?.[0] ?? selectedTargetBriefs[0]?.soundProfile.vocal ?? "下一层旋律"}`,
        why: musicContext.transition.why,
      }
    : musicContext.transition;

  return {
    musicContext,
    currentSongTalk,
    previousSongTalk,
    nextSongTalk,
    selectedTargetTracks,
    currentSongBrief,
    previousSongBrief,
    nextSongBrief,
    selectedTargetBriefs,
    transition,
  };
}

function applyScriptDebug(
  decision: DJDirectingDecision,
  input: {
    trigger: DJDirectorTrigger;
    artifacts: PromptArtifacts;
    talkBreakPlan?: TalkBreakPlan | null;
    writerResult?: TalkBreakScript | null;
    usedAnchors?: string[];
    usedFacts?: string[];
    usedAngles?: string[];
    guardResult?: ReturnType<typeof guardDJLines>;
    attemptedLines?: string[];
    rewriteAttempted?: boolean;
    rewriteLines?: string[];
    validation: ReturnType<typeof validateDJLines>;
  },
) {
  return {
    ...decision,
    meta: {
      ...decision.meta,
      scriptDebug: {
        event: input.trigger,
        provider: decision.meta?.provider ?? "deepseek",
        usedFallback: decision.meta?.usedFallback ?? false,
        songBrief: input.artifacts.currentSongBrief,
        previousSongBrief: input.artifacts.previousSongBrief,
        nextSongBrief: input.artifacts.nextSongBrief,
        selectedTargetBriefs: input.artifacts.selectedTargetBriefs,
        talkBreakPlan: input.talkBreakPlan ?? null,
        pattern: input.talkBreakPlan?.pattern,
        patternStructure: input.writerResult?.patternStructure,
        selectedIndex: input.writerResult?.selectedIndex,
        candidates: input.writerResult?.candidates,
        lines: decision.lines,
        attemptedLines: input.attemptedLines ?? decision.lines,
        guardResult: input.guardResult,
        rewriteAttempted: input.rewriteAttempted ?? false,
        rewriteLines: input.rewriteLines ?? [],
        usedAnchors: input.usedAnchors ?? [],
        usedFacts: input.usedFacts ?? [],
        usedAngles: input.usedAngles ?? [],
        quality: {
          pass: input.validation.ok,
          bannedHits: input.validation.bannedHits,
          anchorTypes: input.validation.anchorTypes,
          reason: input.validation.reason,
          anchorCount: input.validation.anchorCount,
          radioLikenessScore: input.validation.radioLikenessScore ?? input.writerResult?.radioLikenessScore,
          radioFailures: input.validation.radioFailures,
          radioStrengths: input.validation.radioStrengths,
        },
      },
    },
  };
}

async function writeHostLines(input: {
  decision: DJDirectingDecision;
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  artifacts: PromptArtifacts;
  hostPlanner: Pick<RadioHostPlanner, "plan">;
  hostWriter: Pick<RadioHostWriter, "write">;
  failureReason?: string;
  originalLines?: string[];
}) {
  const talkBreakPlan = await input.hostPlanner.plan({
    event:
      input.trigger === "opening"
        ? "opening"
        : input.trigger === "bridge_to_next"
          ? "bridge_to_next"
          : input.trigger === "user_tune"
            ? "user_tune"
            : input.trigger === "shift_style"
              ? "shift_style"
              : input.trigger === "music_ended"
                ? "outro"
                : "introduce_current",
    timeOfDay: input.context.timeOfDay,
    currentSongBrief: input.artifacts.currentSongBrief,
    previousSongBrief: input.artifacts.previousSongBrief,
    nextSongBrief: input.artifacts.selectedTargetBriefs[0] ?? input.artifacts.nextSongBrief,
    recentLines: input.context.recentLines ?? [],
    failureReason: input.failureReason,
  });

  const result = await input.hostWriter.write({
    trigger: input.trigger,
    context: input.context,
    plan: talkBreakPlan,
    currentSongBrief: input.artifacts.currentSongBrief,
    previousSongBrief: input.artifacts.previousSongBrief,
    nextSongBrief: input.artifacts.selectedTargetBriefs[0] ?? input.artifacts.nextSongBrief,
    selectedTargetBriefs: input.artifacts.selectedTargetBriefs,
    transition: input.artifacts.transition,
    failureReason: input.failureReason,
    originalLines: input.originalLines,
  });

  return {
    decision: {
      ...input.decision,
      shouldSpeak: result.lines.length > 0,
      lines: result.lines,
    },
    talkBreakPlan,
    writerResult: result,
  };
}

async function applyFinalGuardOrRewrite(input: {
  decision: DJDirectingDecision;
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  artifacts: PromptArtifacts;
  hostPlanner?: Pick<RadioHostPlanner, "plan">;
  hostWriter?: Pick<RadioHostWriter, "write">;
  talkBreakPlan: TalkBreakPlan | null;
  writerResult: TalkBreakScript;
  allowRewrite: boolean;
}) {
  const attemptedLines = input.decision.lines;
  const firstGuard = guardDJLines(attemptedLines);

  const shouldRewriteBlockedDraft = firstGuard.blockedLines.length > 0 && (input.trigger === "opening" || firstGuard.safeLines.length === 0);

  if (firstGuard.safeLines.length > 0 && !shouldRewriteBlockedDraft) {
    return {
      decision: {
        ...input.decision,
        shouldSpeak: input.decision.shouldSpeak !== false,
        lines: firstGuard.safeLines,
      },
      talkBreakPlan: input.talkBreakPlan,
      writerResult: input.writerResult,
      guardResult: firstGuard,
      attemptedLines,
      rewritten: false,
    };
  }

  if (!firstGuard.blockedLines.length || !input.allowRewrite || !input.hostWriter) {
    return {
      decision: dropSpeech(input.decision, firstGuard.blockedLines.length ? "final guard blocked all lines" : "final guard found no speakable lines"),
      talkBreakPlan: input.talkBreakPlan,
      writerResult: input.writerResult,
      guardResult: firstGuard,
      attemptedLines,
      rewritten: false,
    };
  }

  const failureReason = [
    "final_guard_blocked",
    ...firstGuard.blockedLines.map((line) => `${line.reason}: ${line.line}`),
    `banned_phrases: ${DJ_BANNED_PHRASES.join(" | ")}`,
  ].join("; ");
  const rewrite = await writeHostLines({
    decision: input.decision,
    trigger: input.trigger,
    context: input.context,
    artifacts: input.artifacts,
    hostPlanner: input.hostPlanner ?? new RadioHostPlanner(),
    hostWriter: input.hostWriter,
    failureReason,
    originalLines: attemptedLines,
  });
  const rewriteGuard = guardDJLines(rewrite.decision.lines);

  if (!rewriteGuard.safeLines.length) {
    return {
      decision: dropSpeech(rewrite.decision, "final guard rewrite failed"),
      talkBreakPlan: rewrite.talkBreakPlan,
      writerResult: rewrite.writerResult,
      guardResult: rewriteGuard,
      attemptedLines: rewrite.decision.lines,
      rewritten: true,
    };
  }

  return {
    decision: {
      ...rewrite.decision,
      shouldSpeak: true,
      lines: rewriteGuard.safeLines,
    },
    talkBreakPlan: rewrite.talkBreakPlan,
    writerResult: rewrite.writerResult,
    guardResult: rewriteGuard,
    attemptedLines: rewrite.decision.lines,
    rewritten: true,
  };
}

async function enforceDecisionQuality(input: {
  decision: DJDirectingDecision;
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  artifacts: PromptArtifacts;
  hostPlanner?: Pick<RadioHostPlanner, "plan">;
  hostWriter?: Pick<RadioHostWriter, "write">;
  allowRewrite: boolean;
  rawResponse?: string;
}) {
  if (!input.decision.shouldSpeak) {
    return {
      decision: {
        ...input.decision,
        shouldSpeak: false,
        lines: [],
      },
      rawResponse: input.rawResponse,
    };
  }

  const initial =
    input.hostWriter && input.hostPlanner
      ? await writeHostLines({
          decision: input.decision,
          trigger: input.trigger,
          context: input.context,
          artifacts: input.artifacts,
          hostPlanner: input.hostPlanner,
          hostWriter: input.hostWriter,
        })
      : {
          decision: input.decision,
          talkBreakPlan: null,
          writerResult: {
            pattern: "sound_description",
            lines: input.decision.lines,
            usedAnchors: [],
            usedFacts: [],
            usedAngles: [],
            avoidedBecause: [],
            confidence: "low",
            qualityNotes: "",
            rawPrompt: undefined,
            rawResponse: undefined,
          } satisfies TalkBreakScript,
        };

  let guarded = await applyFinalGuardOrRewrite({
    decision: initial.decision,
    trigger: input.trigger,
    context: input.context,
    artifacts: input.artifacts,
    hostPlanner: input.hostPlanner,
    hostWriter: input.hostWriter,
    talkBreakPlan: initial.talkBreakPlan,
    writerResult: initial.writerResult,
    allowRewrite: input.allowRewrite,
  });
  let decoratedDecision = guarded.decision;
  let talkBreakPlan = guarded.talkBreakPlan;
  let writerResult = guarded.writerResult;
  let validation = validateDJLines(
    decoratedDecision.lines,
    buildValidationContext(input.context, input.artifacts, {
      usedFacts: writerResult.usedFacts,
      usedAngles: writerResult.usedAngles,
    }),
  );

  if (validation.ok) {
    return {
      decision: applyScriptDebug(decoratedDecision, {
        trigger: input.trigger,
        artifacts: input.artifacts,
        talkBreakPlan,
        writerResult,
        usedAnchors: writerResult.usedAnchors,
        usedFacts: writerResult.usedFacts,
        usedAngles: writerResult.usedAngles,
        guardResult: guarded.guardResult,
        attemptedLines: guarded.attemptedLines,
        rewriteAttempted: guarded.rewritten,
        rewriteLines: guarded.rewritten ? guarded.attemptedLines : [],
        validation,
      }),
      rawResponse: [input.rawResponse, guarded.writerResult.rawResponse].filter(Boolean).join(guarded.rewritten ? "\n\nHOST_WRITER_GUARD_REWRITE:\n" : "\n\nHOST_WRITER:\n"),
    };
  }

  if (!input.allowRewrite || !input.hostWriter) {
    return {
      decision: applyScriptDebug(dropSpeech(decoratedDecision, validation.reason), {
        trigger: input.trigger,
        artifacts: input.artifacts,
        talkBreakPlan,
        writerResult,
        usedAnchors: writerResult.usedAnchors,
        usedFacts: writerResult.usedFacts,
        usedAngles: writerResult.usedAngles,
        guardResult: guarded.guardResult,
        attemptedLines: guarded.attemptedLines,
        rewriteAttempted: guarded.rewritten,
        rewriteLines: guarded.rewritten ? guarded.attemptedLines : [],
        validation,
      }),
      rawResponse: [input.rawResponse, writerResult.rawResponse].filter(Boolean).join("\n\nHOST_WRITER:\n"),
    };
  }

  const rewrite = await writeHostLines({
    decision: decoratedDecision,
    trigger: input.trigger,
    context: input.context,
    artifacts: input.artifacts,
    hostPlanner: input.hostPlanner ?? new RadioHostPlanner(),
    failureReason: input.trigger === "opening" ? `final_guard_blocked; ${validation.reason}` : validation.reason,
    hostWriter: input.hostWriter,
    originalLines: input.decision.lines,
  });
  guarded = await applyFinalGuardOrRewrite({
    decision: rewrite.decision,
    trigger: input.trigger,
    context: input.context,
    artifacts: input.artifacts,
    hostPlanner: input.hostPlanner,
    hostWriter: input.hostWriter,
    talkBreakPlan: rewrite.talkBreakPlan,
    writerResult: rewrite.writerResult,
    allowRewrite: input.allowRewrite,
  });
  talkBreakPlan = guarded.talkBreakPlan;
  writerResult = guarded.writerResult;
  decoratedDecision = guarded.decision;
  validation = validateDJLines(
    decoratedDecision.lines,
    buildValidationContext(input.context, input.artifacts, {
      usedFacts: writerResult.usedFacts,
      usedAngles: writerResult.usedAngles,
    }),
  );

  if (!validation.ok) {
    return {
      decision: applyScriptDebug(dropSpeech(decoratedDecision, `${validation.reason}; rewrite failed`), {
        trigger: input.trigger,
        artifacts: input.artifacts,
        talkBreakPlan,
        writerResult,
        usedAnchors: writerResult.usedAnchors,
        usedFacts: writerResult.usedFacts,
        usedAngles: writerResult.usedAngles,
        guardResult: guarded.guardResult,
        attemptedLines: guarded.attemptedLines,
        rewriteAttempted: guarded.rewritten,
        rewriteLines: guarded.rewritten ? guarded.attemptedLines : [],
        validation,
      }),
      rawResponse: [input.rawResponse, writerResult.rawResponse].filter(Boolean).join("\n\nHOST_WRITER_REWRITE:\n"),
    };
  }

  return {
    decision: applyScriptDebug(decoratedDecision, {
      trigger: input.trigger,
      artifacts: input.artifacts,
      talkBreakPlan,
      writerResult,
      usedAnchors: writerResult.usedAnchors,
      usedFacts: writerResult.usedFacts,
      usedAngles: writerResult.usedAngles,
      guardResult: guarded.guardResult,
      attemptedLines: guarded.attemptedLines,
      rewriteAttempted: guarded.rewritten,
      rewriteLines: guarded.rewritten ? guarded.attemptedLines : [],
      validation,
    }),
    rawResponse: [input.rawResponse, writerResult.rawResponse].filter(Boolean).join("\n\nHOST_WRITER:\n"),
  };
}

export async function resolveDJBrainDecision(input: {
  trigger: DJDirectorTrigger;
  context: DJDirectorContext;
  deps?: DJBrainDeps;
  deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured" | "model">;
}): Promise<DJBrainResult> {
  const injectedClient = input.deepseekClient ?? input.deps?.deepseekClient;
  const deepseekClient = injectedClient ?? new DeepSeekClient();
  const songBriefBuilder = input.deps?.songBriefBuilder ?? ((track: Track) => buildSongBrief(track));
  const hostPlanner = input.deps?.hostPlanner ?? new RadioHostPlanner({ deepseekClient });
  const hostWriter = input.deps?.hostWriter ?? new RadioHostWriter({ deepseekClient });
  const configured = injectedClient ? true : deepseekClient.isConfigured();
  const keyPresent = injectedClient ? true : configured;
  const model = deepseekClient.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const artifacts = await buildPromptArtifacts(input.context, input.trigger, songBriefBuilder);
  const rawPrompt = buildDirectorUserPrompt({
    trigger: input.trigger,
    context: input.context,
    musicContext: artifacts.musicContext,
    currentSongTalk: artifacts.currentSongTalk,
    previousSongTalk: artifacts.previousSongTalk,
    nextSongTalk: artifacts.nextSongTalk,
    transition: artifacts.transition,
    selectedTargetTracks: artifacts.selectedTargetTracks,
  });
  const allowedTrackIds = (input.context.playableTrackPool ?? input.context.upcomingTracks).map((track) => getQueuePatchTrackId(track));

  const buildValidatedFallback = async () => {
    const fallbackDecision = ensureQueuePatchForDecision({
      decision: buildFallbackDecision(input.trigger, {
        ...input.context,
        nextTrack:
          artifacts.selectedTargetTracks[0] &&
          (input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks]).find(
            (track) => getQueuePatchTrackId(track) === artifacts.selectedTargetTracks[0]?.providerTrackId,
          )
            ? (input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks]).find(
                (track) => getQueuePatchTrackId(track) === artifacts.selectedTargetTracks[0]?.providerTrackId,
              )
            : input.context.nextTrack,
      }),
      currentTrack: input.context.currentTrack,
      recentTracks: input.context.recentTracks,
      upcomingTracks: input.context.upcomingTracks,
      pool: input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks],
      userIntent: input.context.userIntent,
    });

    return enforceDecisionQuality({
      decision: fallbackDecision,
      trigger: input.trigger,
      context: input.context,
      artifacts,
      hostPlanner,
      hostWriter,
      allowRewrite: false,
    });
  };

  if (!configured) {
    const validatedFallback = await buildValidatedFallback();
    return {
      provider: "deepseek",
      configured: false,
      keyPresent,
      model,
      usedFallback: true,
      rawPrompt,
      parsedDecision: {
        ...validatedFallback.decision,
        meta: {
          ...validatedFallback.decision.meta,
          provider: "fallback",
          usedFallback: true,
          promptType: input.trigger,
        },
      },
      error: {
        type: "config_missing",
        message: "DEEPSEEK_API_KEY is not configured.",
      },
    };
  }

  const response = (await deepseekClient.chatJson<Record<string, unknown>>({
    systemPrompt: buildDirectorSystemPrompt(),
    userPrompt: rawPrompt,
    temperature: 0.75,
    maxTokens: 1200,
  })) as DeepSeekChatJsonResult<Record<string, unknown>>;

  if (!response.ok) {
    const validatedFallback = await buildValidatedFallback();
    return {
      provider: "deepseek",
      configured: true,
      keyPresent,
      model,
      usedFallback: true,
      rawPrompt,
      rawResponse: response.rawText,
      parsedDecision: {
        ...validatedFallback.decision,
        meta: {
          provider: "deepseek",
          usedFallback: true,
          fallbackReason: response.error?.message ?? "DeepSeek request failed.",
          rawPrompt,
          rawResponse: response.rawText,
          promptType: input.trigger,
        },
      },
      error: response.error ?? {
        type: "api_error",
        message: "DeepSeek request failed.",
      },
    };
  }

  const normalized = normalizeDJDecision(coerceModelDecision(response.data ?? {}, input.trigger), {
    allowedTrackIds,
    fallbackTrackIds: [
      ...artifacts.selectedTargetTracks.map((track) => track.providerTrackId),
      ...input.context.upcomingTracks.map((track) => getQueuePatchTrackId(track)),
    ].slice(0, 5),
    fallbackLines: [],
  });

  const finalDecision = ensureQueuePatchForDecision({
    decision: {
      ...normalized,
      action:
        input.trigger === "user_tune" && normalized.action !== "skip_to_next"
          ? "user_tune"
          : normalized.action,
      meta: {
        provider: "deepseek",
        usedFallback: false,
        rawPrompt,
        rawResponse: response.rawText,
        promptType: input.trigger,
      },
    },
    currentTrack: input.context.currentTrack,
    recentTracks: input.context.recentTracks,
    upcomingTracks: input.context.upcomingTracks,
    pool: input.context.playableTrackPool ?? [input.context.currentTrack, ...input.context.upcomingTracks],
    userIntent: input.context.userIntent,
  });

  const validated = await enforceDecisionQuality({
    decision: finalDecision,
    trigger: input.trigger,
    context: input.context,
    artifacts,
    hostPlanner,
    hostWriter,
    allowRewrite: true,
    rawResponse: response.rawText,
  });

  return {
    provider: "deepseek",
    configured: true,
    keyPresent,
    model,
    usedFallback: false,
    rawPrompt,
    rawResponse: validated.rawResponse,
    parsedDecision: validated.decision,
    error: null,
  };
}
