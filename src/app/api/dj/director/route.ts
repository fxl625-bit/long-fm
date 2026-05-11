import { NextResponse } from "next/server";
import { LLMDJDirector } from "@/lib/dj/llm-dj-director";
import type { DJDirectorContext, DJDirectorTrigger } from "@/lib/dj/dj-types";

function normalizeTrigger(raw: unknown): DJDirectorTrigger | null {
  if (
    raw === "opening" ||
    raw === "introduce_current" ||
    raw === "bridge_to_next" ||
    raw === "shift_style" ||
    raw === "raise_energy" ||
    raw === "lower_energy" ||
    raw === "insert_discovery" ||
    raw === "avoid_repetition" ||
    raw === "user_tune" ||
    raw === "time_context" ||
    raw === "music_paused" ||
    raw === "music_ended"
  ) {
    return raw;
  }
  return null;
}

function isDirectorContext(raw: unknown): raw is DJDirectorContext {
  return Boolean(raw && typeof raw === "object" && (raw as DJDirectorContext).currentTrack);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const trigger = normalizeTrigger(body?.trigger);
  const context = body?.context;

  if (!trigger || !isDirectorContext(context)) {
    return NextResponse.json({ ok: false, message: "Invalid director request." }, { status: 400 });
  }

  const director = new LLMDJDirector();
  const result = await director.decide({ trigger, context });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
