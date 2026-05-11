import { sanitizeDJLines } from "./dj-style-guide";
import type { DJDirectingDecision, DJDirectorContext, DJDirectorTrigger } from "./dj-types";

function sanitizeTrackIds(ids: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(ids)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") {
      continue;
    }
    if (!allowedIds.has(raw) || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    result.push(raw);
    if (result.length >= 4) {
      break;
    }
  }
  return result;
}

function normalizeAction(trigger: DJDirectorTrigger, action: unknown): DJDirectingDecision["action"] {
  if (
    action === "keep_flow" ||
    action === "introduce_current" ||
    action === "bridge_to_next" ||
    action === "shift_style" ||
    action === "raise_energy" ||
    action === "lower_energy" ||
    action === "insert_discovery" ||
    action === "avoid_repetition" ||
    action === "user_tune"
  ) {
    return action;
  }

  if (trigger === "introduce_current") return "introduce_current";
  if (trigger === "bridge_to_next") return "bridge_to_next";
  if (trigger === "shift_style") return "shift_style";
  if (trigger === "raise_energy") return "raise_energy";
  if (trigger === "lower_energy") return "lower_energy";
  if (trigger === "insert_discovery") return "insert_discovery";
  if (trigger === "avoid_repetition") return "avoid_repetition";
  if (trigger === "user_tune") return "user_tune";
  return "keep_flow";
}

export class GPTDJDirector {
  async decide(
    trigger: DJDirectorTrigger,
    context: DJDirectorContext,
    fallback: DJDirectingDecision,
  ): Promise<DJDirectingDecision | null> {
    if (typeof window === "undefined") {
      return null;
    }

    const response = await fetch("/api/dj/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger,
        context,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      return null;
    }

    const allowedIds = new Set(context.upcomingTracks.map((track) => track.id));

    try {
      const payload = (await response.json()) as { decision?: Record<string, unknown> };
      const decision = payload.decision;
      if (!decision || typeof decision !== "object") {
        return null;
      }

      const lines = sanitizeDJLines(
        Array.isArray(decision.lines) ? decision.lines.filter((item): item is string => typeof item === "string") : [],
        fallback.lines,
      );
      const trackIds = sanitizeTrackIds(
        decision.queuePatch && typeof decision.queuePatch === "object" ? (decision.queuePatch as { trackIds?: unknown }).trackIds : [],
        allowedIds,
      );
      const mode =
        decision.queuePatch && typeof decision.queuePatch === "object"
          ? (decision.queuePatch as { mode?: unknown }).mode
          : undefined;

      return {
        action: normalizeAction(trigger, decision.action),
        reason: typeof decision.reason === "string" && decision.reason.trim() ? decision.reason.trim() : fallback.reason,
        lines,
        queuePatch:
          trackIds.length && (mode === "replace_next" || mode === "insert_after_current" || mode === "reorder_upcoming")
            ? {
                mode,
                trackIds,
              }
            : fallback.queuePatch,
        targetDirection:
          decision.targetDirection && typeof decision.targetDirection === "object"
            ? (decision.targetDirection as DJDirectingDecision["targetDirection"])
            : fallback.targetDirection,
      };
    } catch {
      return null;
    }
  }
}
