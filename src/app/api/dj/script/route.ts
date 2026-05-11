import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { generateDJScript } from "@/lib/engines/dj-script-engine";
import { getUserMusicProfile } from "@/lib/repositories/music-profile-repository";
import { djScriptSchema } from "@/lib/types/api";
import type { MusicTrack } from "@/lib/types/music";
import { parseStructuredProfile } from "@/lib/utils/profile-json";

function toTrack(raw: Record<string, unknown> | null | undefined): MusicTrack | null {
  if (!raw) {
    return null;
  }
  if (!raw.id || !raw.name || !raw.artist) {
    return null;
  }

  return {
    id: String(raw.id),
    name: String(raw.name),
    artist: String(raw.artist),
    album: raw.album ? String(raw.album) : undefined,
    duration: Number(raw.duration ?? 0),
    durationMs: Number(raw.durationMs ?? raw.duration ?? 0),
    coverUrl: raw.coverUrl ? String(raw.coverUrl) : undefined,
    sourceType: raw.sourceType as MusicTrack["sourceType"],
    energyLevel: raw.energyLevel as MusicTrack["energyLevel"],
  };
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = djScriptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid DJ script payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const profile = await getUserMusicProfile(user.id);
    const result = generateDJScript({
      mode: parsed.data.mode,
      currentTrack: toTrack(parsed.data.currentTrack) ?? null,
      nextTrack: toTrack(parsed.data.nextTrack),
      queueReason: parsed.data.queueReason,
      historyCount: parsed.data.historyCount ?? 0,
      profile: profile ? parseStructuredProfile(profile.structuredProfileJson) : null,
    });

    return NextResponse.json({
      ok: true,
      speaker: "Long",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to build DJ script",
      },
      { status: 500 },
    );
  }
}


