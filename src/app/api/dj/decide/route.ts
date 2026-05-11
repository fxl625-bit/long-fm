import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { GPTDJBrain, toRadioTracksFromMusicTracks } from "@/lib/dj/gpt-dj-brain";
import type { Track } from "@/lib/radio/radio-types";
import { fetchUserTracksFromDb } from "@/lib/repositories/music-sync-repository";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";

function parseTracks(value: unknown): Track[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const tracks: Track[] = [];
  for (const item of value) {
    const raw = item as Partial<Track>;
    if (!raw.id || !raw.title || !raw.artist) {
      continue;
    }
    tracks.push({
      id: raw.id,
      providerTrackId: raw.providerTrackId,
      title: raw.title,
      artist: raw.artist,
      album: raw.album,
      coverUrl: raw.coverUrl,
      audioUrl: raw.audioUrl,
      externalUrl: raw.externalUrl,
      durationMs: raw.durationMs,
      sourceType: raw.sourceType ?? "demo",
      playableStatus: raw.playableStatus ?? "unavailable",
      tags: raw.tags,
      adjustedTag: raw.adjustedTag,
    });
  }
  return tracks;
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));

    const candidateTracks = parseTracks(body?.candidateTracks);
    const recentTracks = parseTracks(body?.recentTracks);
    const upcomingTracks = parseTracks(body?.upcomingTracks);

    const fallbackCandidates =
      candidateTracks.length > 0
        ? candidateTracks
        : toRadioTracksFromMusicTracks((await fetchUserTracksFromDb(user.id)).map(mapDbTrackToMusicTrack));

    const brain = new GPTDJBrain();
    const memory = await brain.buildMemory({ tracks: fallbackCandidates, recentPlayed: recentTracks });
    const context = brain.buildContext();
    const decision = await brain.decide({
      memory,
      context,
      recentTracks,
      upcomingTracks,
      candidateTracks: fallbackCandidates,
      currentSegment: typeof body?.currentSegment === "string" ? body.currentSegment : undefined,
    });

    return NextResponse.json({
      ok: true,
      decision,
      memory,
      context,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to decide DJ intervention",
      },
      { status: 500 },
    );
  }
}
