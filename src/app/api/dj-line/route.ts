import { NextResponse } from "next/server";
import { GPTDJBrain } from "@/lib/dj/gpt-dj-brain";
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
    sourceType: item.sourceType ?? "external",
    playableStatus: item.playableStatus ?? "unavailable",
    tags: item.tags,
    adjustedTag: item.adjustedTag,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const brain = new GPTDJBrain();
    const text = await brain.writeLine({
      mode: body?.mode === "opening" || body?.mode === "decision" || body?.mode === "outro" ? body.mode : "bridge",
      currentTrack: toTrack(body?.currentTrack),
      nextTrack: toTrack(body?.nextTrack),
      program: body?.program,
      decision: body?.decision,
    });

    return NextResponse.json({ ok: true, text });
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
