import { NextResponse } from "next/server";
import { GPTDJBrain } from "@/lib/dj/gpt-dj-brain";
import type { DJDecision, DJProgramPlan } from "@/lib/dj/dj-types";
import type { Track } from "@/lib/radio/radio-types";

function toTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Partial<Track>;
  if (!item.id || !item.title || !item.artist) {
    return null;
  }
  return {
    id: item.id,
    providerTrackId: item.providerTrackId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    audioUrl: item.audioUrl,
    externalUrl: item.externalUrl,
    durationMs: item.durationMs,
    sourceType: item.sourceType ?? "demo",
    playableStatus: item.playableStatus ?? "unavailable",
    tags: item.tags,
    adjustedTag: item.adjustedTag,
  };
}

function toDecision(raw: unknown): DJDecision | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const item = raw as Partial<DJDecision>;
  if (typeof item.shouldIntervene !== "boolean" || !item.interventionType || !item.reason || !item.djLine) {
    return undefined;
  }
  return {
    shouldIntervene: item.shouldIntervene,
    interventionType: item.interventionType,
    reason: item.reason,
    djLine: item.djLine,
    replacementTrackIds: item.replacementTrackIds ?? [],
    insertAfterCurrent: item.insertAfterCurrent,
  };
}

function toProgram(raw: unknown): DJProgramPlan | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const item = raw as Partial<DJProgramPlan>;
  if (!item.title || !item.intent || !Array.isArray(item.segments) || !Array.isArray(item.queueTrackIds)) {
    return undefined;
  }
  return item as DJProgramPlan;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode =
      body?.mode === "opening" || body?.mode === "bridge" || body?.mode === "decision" || body?.mode === "outro"
        ? body.mode
        : "bridge";

    const brain = new GPTDJBrain();
    const subtitle = await brain.writeLine({
      mode,
      currentTrack: toTrack(body?.currentTrack),
      nextTrack: toTrack(body?.nextTrack),
      decision: toDecision(body?.decision),
      program: toProgram(body?.program),
    });

    return NextResponse.json({
      ok: true,
      subtitle,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to generate DJ line",
      },
      { status: 500 },
    );
  }
}
