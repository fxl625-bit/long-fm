import { fallbackLinesForTrigger, sanitizeDJLines } from "./dj-style-guide";
import { LLMDJDirector } from "./llm-dj-director";
import { DJLineMemory } from "./dj-line-memory";
import {
  ensureQueuePatchForDecision,
  getQueuePatchTrackId,
  inferQueueIntent,
  isImmediateTuneIntent,
  selectTracksForIntent,
} from "./queue-selector";
import type { DJDirectingDecision, DJDirectorContext, DJDirectorTrigger, DJDirectorDecision } from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";

function uniqueTracks(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function trackStyle(track?: Track | null) {
  return track?.tags?.style?.[0] ?? "";
}

function trackEnergy(track?: Track | null) {
  return track?.tags?.energy ?? "medium";
}

function energyWeight(value: "low" | "medium" | "high") {
  if (value === "low") return 1;
  if (value === "high") return 3;
  return 2;
}

function rotateIfSameOrder(source: Track[], reordered: Track[]) {
  const original = source.map((track) => track.id).slice(0, reordered.length).join("|");
  const candidate = reordered.map((track) => track.id).join("|");
  if (!reordered.length || original !== candidate) {
    return reordered;
  }
  return reordered.length > 1 ? [...reordered.slice(1), reordered[0]] : reordered;
}

function sortByEnergy(tracks: Track[], target: "low" | "medium" | "high") {
  const weight = energyWeight(target);
  const scored = [...tracks].sort((left, right) => {
    const leftScore = Math.abs(weight - energyWeight(trackEnergy(left)));
    const rightScore = Math.abs(weight - energyWeight(trackEnergy(right)));
    return leftScore - rightScore;
  });
  return rotateIfSameOrder(tracks, uniqueTracks(scored));
}

function contrastByArtist(tracks: Track[], artist: string) {
  const reordered = uniqueTracks([
    ...tracks.filter((track) => track.artist !== artist),
    ...tracks.filter((track) => track.artist === artist),
  ]);
  return rotateIfSameOrder(tracks, reordered);
}

function sortByStyleContrast(tracks: Track[], style: string) {
  const reordered = uniqueTracks([
    ...tracks.filter((track) => trackStyle(track) && trackStyle(track) !== style),
    ...tracks.filter((track) => trackStyle(track) === style),
    ...tracks.filter((track) => !trackStyle(track)),
  ]);
  return rotateIfSameOrder(tracks, reordered);
}

function sortByDiscovery(tracks: Track[], context: DJDirectorContext) {
  const reordered = uniqueTracks([
    ...tracks.filter((track) => !context.userMemory.topArtists.includes(track.artist)),
    ...tracks.filter((track) => !context.recentTracks.some((recent) => recent.artist === track.artist)),
    ...tracks,
  ]);
  return rotateIfSameOrder(tracks, reordered);
}

function reorderForUserIntent(tracks: Track[], intent: string) {
  const selectorIntent = inferQueueIntent(intent);
  if (selectorIntent === "quieter") return sortByEnergy(tracks, "low");
  if (selectorIntent === "more_rhythm") return sortByEnergy(tracks, "high");
  if (selectorIntent === "surprise") return rotateIfSameOrder(tracks, [...tracks.slice(1), tracks[0]].filter(Boolean));
  return rotateIfSameOrder(tracks, [...tracks.slice(1), tracks[0]].filter(Boolean));
}

function selectIntentTracks(context: DJDirectorContext, intent: string, count = 5) {
  const pool = context.playableTrackPool ?? [context.currentTrack, ...context.upcomingTracks];
  const idMap = new Map(pool.map((track) => [getQueuePatchTrackId(track), track]));
  return selectTracksForIntent({
    intent,
    currentTrack: context.currentTrack,
    recentTracks: context.recentTracks,
    upcomingTracks: context.upcomingTracks,
    pool,
    count,
  })
    .map((trackId) => idMap.get(trackId))
    .filter((track): track is Track => Boolean(track));
}

function targetDirectionForIntent(intent: string): DJDirectingDecision["targetDirection"] {
  const selectorIntent = inferQueueIntent(intent);
  if (selectorIntent === "quieter") return { energy: "low", mood: ["soft", "late"] };
  if (selectorIntent === "more_rhythm") return { energy: "high", mood: ["brighter", "moving"] };
  if (selectorIntent === "more_chinese") return { language: "中文" };
  if (selectorIntent === "more_english") return { language: "English" };
  if (selectorIntent === "nostalgic") return { mood: ["nostalgic"] };
  return { mood: ["fresh"] };
}

function buildQueuePatch(
  mode: NonNullable<DJDirectingDecision["queuePatch"]>["mode"],
  tracks: Track[],
  explanation: string,
): DJDirectingDecision["queuePatch"] | undefined {
  const trackIds = uniqueTracks(tracks).map((track) => getQueuePatchTrackId(track)).filter(Boolean).slice(0, 5);
  if (!trackIds.length) {
    return undefined;
  }
  return { mode, trackIds, explanation };
}

function currentArtistRepeat(context: DJDirectorContext) {
  const recentArtists = context.recentTracks.slice(-2).map((track) => track.artist);
  return recentArtists.length === 2 && recentArtists[0] === recentArtists[1] ? recentArtists[0] : context.currentTrack.artist;
}

function mapDirectorDecisionToLegacy(decision: DJDirectorDecision): DJDirectingDecision {
  const queuePatch: DJDirectingDecision["queuePatch"] =
    decision.musicAction.type === "none"
      ? undefined
      : {
          mode: decision.musicAction.type === "skip" ? "skip_now" : decision.musicAction.type === "inject" ? "insert_after_current" : "reorder_upcoming",
          trackIds: decision.musicAction.trackIds ?? [],
          explanation: decision.musicAction.reason,
        };

  return {
    action:
      decision.musicAction.type === "skip"
        ? "skip_to_next"
        : decision.musicAction.type === "inject"
          ? "insert_discovery"
          : decision.musicAction.type === "reorder"
            ? "user_tune"
            : "keep_flow",
    shouldSpeak: decision.shouldSpeak,
    reason: decision.musicAction.reason ?? "LLM director decision",
    lines: decision.shouldSpeak && decision.speech ? [decision.speech] : [],
    queuePatch,
    targetDirection: { energy: decision.energy === "mid" ? "medium" : decision.energy },
  };
}

function buildLiveDecisionMeta(llmResult: Awaited<ReturnType<LLMDJDirector["decide"]>>, trigger: DJDirectorTrigger) {
  return {
    provider: llmResult.provider,
    usedFallback: false,
    fallbackReason: undefined,
    rawPrompt: llmResult.rawPrompt,
    rawResponse: llmResult.rawResponse,
    promptType: trigger,
    scriptDebug: llmResult.decision
      ? {
          attemptedLines: llmResult.decision.shouldSpeak && llmResult.decision.speech ? [llmResult.decision.speech] : [],
          speech: llmResult.decision.speech,
          durationHintSec: llmResult.decision.durationHintSec,
          insertAfterTracks: llmResult.decision.insertAfterTracks,
          bypassedGuard: true,
        }
      : undefined,
  } as const;
}

type DirectorDeps = {
  llmDirector?: LLMDJDirector | null;
  useLLM?: boolean;
};

export class DJDirector {
  private readonly llmDirector: LLMDJDirector | null;
  private readonly useLLM: boolean;
  private readonly lineMemory = new DJLineMemory(10);

  constructor(deps: DirectorDeps = {}) {
    this.llmDirector = deps.llmDirector ?? new LLMDJDirector();
    this.useLLM = deps.useLLM ?? process.env.DJ_BRAIN_PROVIDER !== "local";
  }

  async decide(trigger: DJDirectorTrigger, context: DJDirectorContext): Promise<DJDirectingDecision> {
    const fallback = this.finalizeDecision(this.decideLocally(trigger, context));
    if (!this.useLLM || !this.llmDirector) {
      return fallback;
    }

    const llmResult = await this.llmDirector.decide({ trigger, context });
    if (!llmResult.decision) {
      return {
        ...fallback,
        shouldSpeak: false,
        lines: [],
        meta: {
          provider: llmResult.provider,
          usedFallback: true,
          fallbackReason: llmResult.error.message,
          rawPrompt: llmResult.rawPrompt,
          rawResponse: llmResult.rawResponse,
          promptType: trigger,
          scriptDebug: {
            attemptedLines: [],
            speech: "",
            bypassedGuard: false,
          },
        },
      };
    }

    const legacyDecision = mapDirectorDecisionToLegacy(llmResult.decision);
    return this.finalizeDecision(
      ensureQueuePatchForDecision({
        decision: {
          ...legacyDecision,
          meta: buildLiveDecisionMeta(llmResult, trigger),
        },
        currentTrack: context.currentTrack,
        recentTracks: context.recentTracks,
        upcomingTracks: context.upcomingTracks,
        pool: context.playableTrackPool ?? [context.currentTrack, ...context.upcomingTracks],
        userIntent: context.userIntent,
      }),
    );
  }

  private finalizeDecision(decision: DJDirectingDecision) {
    const shouldBypassSanitize = decision.meta?.provider === "deepseek";
    const lines = shouldBypassSanitize
      ? decision.lines.map((line) => line.trim()).filter(Boolean)
      : sanitizeDJLines(decision.lines);
    const finalLines = !this.lineMemory.isTooSimilar(lines) ? lines : [];
    if (finalLines.length) {
      this.lineMemory.remember(finalLines);
    }
    return {
      ...decision,
      shouldSpeak: decision.shouldSpeak !== false && finalLines.length > 0,
      lines: finalLines,
      meta: {
        ...decision.meta,
        scriptDebug: {
          ...decision.meta?.scriptDebug,
          attemptedLines: decision.meta?.scriptDebug?.attemptedLines ?? lines,
          speech: decision.meta?.scriptDebug?.speech ?? finalLines[0],
          bypassedGuard: decision.meta?.provider === "deepseek" ? true : decision.meta?.scriptDebug?.bypassedGuard,
        },
      },
    };
  }

  private decideLocally(trigger: DJDirectorTrigger, context: DJDirectorContext): DJDirectingDecision {
    const musicState = context.musicState;

    if (trigger === "music_paused" || musicState?.isPaused) {
      return {
        action: "stop_talking",
        priority: "high",
        shouldSpeak: false,
        reason: "Music is paused, stop the regular hosting loop.",
        lines: [],
      };
    }

    if (trigger === "music_ended") {
      return {
        action: "stop_talking",
        priority: "high",
        shouldSpeak: false,
        reason: "Music ended without a next track.",
        lines: [],
      };
    }

    if (trigger === "opening") {
      return {
        action: "keep_flow",
        priority: "normal",
        shouldSpeak: false,
        reason: "Opening requires live director speech.",
        lines: [],
      };
    }

    if (trigger === "introduce_current") {
      return {
        action: "introduce_current",
        priority: "normal",
        shouldSpeak: false,
        reason: "Track intros require live director speech.",
        lines: [],
      };
    }

    if (trigger === "bridge_to_next") {
      const reordered = sortByEnergy(context.upcomingTracks, "medium").slice(0, 4);
      return {
        action: "bridge_to_next",
        priority: "normal",
        shouldSpeak: false,
        reason: "Keep the flow while nudging the next turn.",
        lines: [],
        queuePatch: buildQueuePatch("reorder_upcoming", reordered, "Keep the flow but open the next block slightly."),
        targetDirection: { energy: "medium" },
      };
    }

    if (trigger === "shift_style") {
      const contrasted = sortByStyleContrast(context.upcomingTracks, trackStyle(context.currentTrack)).slice(0, 4);
      const shiftedContext = contrasted[0] ? { ...context, nextTrack: contrasted[0] } : context;
      return {
        action: "shift_style",
        priority: "normal",
        shouldSpeak: false,
        reason: "Recent section feels too dense or too similar.",
        lines: [],
        queuePatch: buildQueuePatch("replace_next", contrasted, "Shift the next block to a contrasting style."),
        targetDirection: {
          mood: ["lighter", "air"],
          energy: "medium",
          style: contrasted.map((track) => trackStyle(track)).filter(Boolean).slice(0, 2),
        },
      };
    }

    if (trigger === "raise_energy") {
      const raised = sortByEnergy(context.upcomingTracks, "high").slice(0, 4);
      const raisedContext = raised[0] ? { ...context, nextTrack: raised[0] } : context;
      return {
        action: "raise_energy",
        priority: "normal",
        shouldSpeak: false,
        reason: "Lift the upcoming block.",
        lines: [],
        queuePatch: buildQueuePatch("reorder_upcoming", raised, "Push the next block forward with more rhythm."),
        targetDirection: { energy: "high" },
      };
    }

    if (trigger === "lower_energy") {
      const lowered = sortByEnergy(context.upcomingTracks, "low").slice(0, 4);
      const loweredContext = lowered[0] ? { ...context, nextTrack: lowered[0] } : context;
      return {
        action: "lower_energy",
        priority: "normal",
        shouldSpeak: false,
        reason: "Cool the upcoming block down.",
        lines: [],
        queuePatch: buildQueuePatch("reorder_upcoming", lowered, "Lower the next block and leave more air."),
        targetDirection: { energy: "low" },
      };
    }

    if (trigger === "insert_discovery") {
      const discovery = sortByDiscovery(context.upcomingTracks, context).slice(0, 4);
      const discoveryContext = discovery[0] ? { ...context, nextTrack: discovery[0] } : context;
      return {
        action: "insert_discovery",
        priority: "normal",
        shouldSpeak: false,
        reason: "Slip in a fresh voice without breaking the channel.",
        lines: [],
        queuePatch: buildQueuePatch("insert_after_current", discovery, "Insert a fresh voice after the current track."),
        targetDirection: { mood: ["fresh"], energy: "medium" },
      };
    }

    if (trigger === "avoid_repetition") {
      const repeatedArtist = currentArtistRepeat(context);
      const replacement = contrastByArtist(context.upcomingTracks, repeatedArtist).slice(0, 4);
      const replacementContext = replacement[0] ? { ...context, nextTrack: replacement[0] } : context;
      return {
        action: "avoid_repetition",
        priority: "normal",
        shouldSpeak: false,
        reason: "Break up repeated artists without interrupting the current song.",
        lines: [],
        queuePatch: buildQueuePatch("replace_next", replacement.length ? replacement : context.upcomingTracks.slice(0, 4), "Break the repeated artist cluster."),
      };
    }

    if (trigger === "user_tune") {
      const intent = context.userIntent ?? "";
      const immediate = isImmediateTuneIntent(intent);
      const selectedTracks = selectIntentTracks(context, intent, immediate ? 3 : 5);
      const reordered = selectedTracks.length ? selectedTracks : reorderForUserIntent(context.upcomingTracks, intent).slice(0, 5);
      const targetTrack = reordered[0] ?? context.nextTrack;
      const tunedContext = targetTrack ? { ...context, nextTrack: targetTrack } : context;
      if (immediate) {
        const direction = targetDirectionForIntent(intent) ?? {};
        return {
          action: "skip_to_next",
          priority: "high",
          shouldSpeak: false,
          reason: "Honor the user's request immediately with a lighter next song.",
          lines: [],
          queuePatch: buildQueuePatch("skip_now", reordered, "Cut immediately to a lighter, more open track."),
          targetDirection: {
            ...direction,
            energy: direction.energy ?? "low",
          },
        };
      }
      return {
        action: "user_tune",
        priority: "high",
        shouldSpeak: false,
        reason: "Honor the user's requested direction on upcoming songs only.",
        lines: [],
        queuePatch: buildQueuePatch("reorder_upcoming", reordered.length ? reordered : context.upcomingTracks.slice(0, 5), "Reframe the upcoming block for the new tune intent."),
        targetDirection: targetDirectionForIntent(intent),
      };
    }

    if (trigger === "time_context") {
      const targetEnergy = context.timeOfDay === "night" ? "low" : "medium";
      const reordered = sortByEnergy(context.upcomingTracks, targetEnergy).slice(0, 4);
      const timeContext = reordered[0] ? { ...context, nextTrack: reordered[0] } : context;
      return {
        action: targetEnergy === "low" ? "lower_energy" : "keep_flow",
        priority: "low",
        shouldSpeak: false,
        reason: "Adjust the next few songs to the time of day.",
        lines: [],
        queuePatch: buildQueuePatch("reorder_upcoming", reordered, "Keep the upcoming block aligned with the time of day."),
        targetDirection: { energy: targetEnergy },
      };
    }

    return {
      action: "keep_flow",
      priority: "low",
      shouldSpeak: false,
      reason: "Keep the current flow moving.",
      lines: [],
    };
  }
}
