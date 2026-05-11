import { z } from "zod";
import { DEFAULT_CHANNEL_NAME, DEFAULT_PROGRAM_INTENT } from "@/lib/constants/product";
import type { DJDirectingDecision, DJProgramPlan } from "@/lib/dj/dj-types";

const actionSchema = z.enum([
  "keep_flow",
  "introduce_current",
  "bridge_to_next",
  "shift_style",
  "raise_energy",
  "lower_energy",
  "insert_discovery",
  "avoid_repetition",
  "skip_to_next",
  "user_tune",
  "stop_talking",
]);

const prioritySchema = z.enum(["low", "normal", "high"]);
const queuePatchModeSchema = z.enum(["replace_next", "insert_after_current", "reorder_upcoming", "skip_now"]);
const segmentPurposeSchema = z.enum(["warmup", "main", "shift", "discovery", "cooldown"]);

const decisionSchema = z.object({
  action: actionSchema,
  priority: prioritySchema.default("normal"),
  shouldSpeak: z.boolean().default(true),
  lines: z.array(z.string()).default([]),
  queuePatch: z
    .object({
      mode: queuePatchModeSchema,
      trackIds: z.array(z.string()).default([]),
      explanation: z.string().optional(),
    })
    .optional(),
  musicTalk: z
    .object({
      currentSongAngle: z.string().optional(),
      artistBackground: z.string().optional(),
      albumContext: z.string().optional(),
      moodNarrative: z.string().optional(),
      transitionReason: z.string().optional(),
    })
    .optional(),
  reason: z.string().default("LLM DJ decision"),
  targetDirection: z
    .object({
      mood: z.array(z.string()).optional(),
      energy: z.enum(["low", "medium", "high"]).optional(),
      language: z.string().optional(),
      style: z.array(z.string()).optional(),
    })
    .optional(),
});

const programPlanSchema = z
  .object({
    title: z.string().optional(),
    intent: z.string().optional(),
    programTitle: z.string().optional(),
    programIntent: z.string().optional(),
    queueTrackIds: z.array(z.string()).default([]).optional(),
    segments: z
      .array(
        z.object({
          name: z.string().optional(),
          segmentName: z.string().optional(),
          purpose: segmentPurposeSchema.optional(),
          mood: z.array(z.string()).default([]).optional(),
          targetMood: z.array(z.string()).default([]).optional(),
          energy: z.enum(["low", "medium", "high"]).optional(),
          targetEnergy: z.enum(["low", "medium", "high"]).optional(),
          trackIds: z.array(z.string()).default([]).optional(),
          queueTrackIds: z.array(z.string()).default([]).optional(),
          reason: z.string().optional(),
          segmentIntent: z.string().optional(),
          hostAngle: z.string().optional(),
        }),
      )
      .default([]),
  })
  .passthrough();

type NormalizeDecisionOptions = {
  allowedTrackIds: string[];
  fallbackTrackIds?: string[];
  fallbackLines?: string[];
};

type NormalizeProgramPlanOptions = {
  allowedTrackIds: string[];
};

function uniqueTrackIds(trackIds: string[], allowedIds: Set<string>) {
  const seen = new Set<string>();
  return trackIds.filter((trackId) => {
    if (!allowedIds.has(trackId) || seen.has(trackId)) {
      return false;
    }
    seen.add(trackId);
    return true;
  });
}

function sanitizeLines(lines: string[], fallbackLines: string[]) {
  const normalized = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (normalized.length) {
    return normalized;
  }
  return fallbackLines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function ensureSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return /[。！？?!]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function chunkTrackIds(trackIds: string[]) {
  const segments: string[][] = [];
  const sizes = [4, 4, 4, 3, 3];
  let cursor = 0;
  for (const size of sizes) {
    if (cursor >= trackIds.length) {
      break;
    }
    segments.push(trackIds.slice(cursor, cursor + size));
    cursor += size;
  }
  return segments.filter((segment) => segment.length);
}

export function normalizeDJDecision(raw: unknown, options: NormalizeDecisionOptions): DJDirectingDecision {
  const parsed = decisionSchema.safeParse(raw);
  const fallbackLines = options.fallbackLines ?? [];
  const allowedIds = new Set(options.allowedTrackIds);
  const safeTrackIds = uniqueTrackIds(parsed.success ? parsed.data.queuePatch?.trackIds ?? [] : [], allowedIds);
  const fallbackTrackIds = uniqueTrackIds(options.fallbackTrackIds ?? [], allowedIds).slice(0, 5);

  const queuePatch =
    parsed.success && parsed.data.queuePatch
      ? {
          mode: parsed.data.queuePatch.mode,
          trackIds: safeTrackIds.length ? safeTrackIds.slice(0, 5) : fallbackTrackIds,
          explanation: parsed.data.queuePatch.explanation,
        }
      : undefined;

  return {
    action: parsed.success ? parsed.data.action : "keep_flow",
    priority: parsed.success ? parsed.data.priority : "normal",
    shouldSpeak: parsed.success ? parsed.data.shouldSpeak : true,
    lines: sanitizeLines(parsed.success ? parsed.data.lines : [], fallbackLines),
    queuePatch: queuePatch && queuePatch.trackIds.length ? queuePatch : undefined,
    musicTalk: parsed.success ? parsed.data.musicTalk : undefined,
    reason: parsed.success ? parsed.data.reason : "LLM DJ decision",
    targetDirection: parsed.success ? parsed.data.targetDirection : undefined,
  };
}

export function normalizeProgramPlan(raw: unknown, options: NormalizeProgramPlanOptions): DJProgramPlan {
  const parsed = programPlanSchema.safeParse(raw);
  const allowedIds = new Set(options.allowedTrackIds);
  const rawSegments = parsed.success ? parsed.data.segments : [];
  const rawQueueTrackIds = uniqueTrackIds(
    parsed.success
      ? parsed.data.queueTrackIds?.length
        ? parsed.data.queueTrackIds
        : rawSegments.flatMap((segment) => (segment.trackIds?.length ? segment.trackIds : segment.queueTrackIds ?? []))
      : [],
    allowedIds,
  );
  const remainingAllowed = options.allowedTrackIds.filter((trackId) => !rawQueueTrackIds.includes(trackId));
  const queueTrackIds = [...rawQueueTrackIds, ...remainingAllowed].slice(0, Math.max(options.allowedTrackIds.length, 12));
  const baseTrackIds = queueTrackIds.length ? queueTrackIds : options.allowedTrackIds.slice(0, 12);
  const segmentTrackIds = chunkTrackIds(baseTrackIds);
  const segmentPurposes: Array<"warmup" | "main" | "shift" | "discovery" | "cooldown"> = ["warmup", "main", "shift", "discovery", "cooldown"];

  const segments =
    rawSegments.length >= 3
      ? rawSegments
          .map((segment, index) => {
            const ids = uniqueTrackIds(segment.trackIds?.length ? segment.trackIds : segment.queueTrackIds ?? [], allowedIds);
            if (!ids.length) {
              return null;
            }
            return {
              name: segment.name || segment.segmentName || "Segment",
              purpose: segment.purpose ?? segmentPurposes[Math.min(index, segmentPurposes.length - 1)]!,
              targetMood: segment.targetMood?.length ? segment.targetMood : segment.mood ?? [],
              targetEnergy: segment.targetEnergy ?? segment.energy ?? "medium",
              trackIds: ids,
              reason: ensureSentence(segment.reason ?? segment.segmentIntent ?? segment.hostAngle ?? ""),
            };
          })
          .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
      : segmentTrackIds.map((trackIds, index) => ({
          name: segmentPurposes[index]!.charAt(0).toUpperCase() + segmentPurposes[index]!.slice(1),
          purpose: segmentPurposes[index]!,
          targetMood: index === 0 ? ["松弛", "熟悉"] : index === 1 ? ["展开", "流动"] : ["换色", "透气"],
          targetEnergy: (index === 0 ? "low" : "medium") as "low" | "medium" | "high",
          trackIds,
          reason: index === 0 ? "先稳住入口。" : index === 1 ? "把中段慢慢展开。" : "留一点颜色变化。",
        }));

  return {
    title: (parsed.success ? parsed.data.title ?? parsed.data.programTitle : undefined) || DEFAULT_CHANNEL_NAME,
    intent: (parsed.success ? parsed.data.intent ?? parsed.data.programIntent : undefined) || DEFAULT_PROGRAM_INTENT,
    segments,
    queueTrackIds: baseTrackIds,
  };
}

export { decisionSchema as djDecisionSchema, programPlanSchema as djProgramPlanSchema };
