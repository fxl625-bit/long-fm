import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { GPTDJBrain, toRadioTracksFromMusicTracks } from "@/lib/dj/gpt-dj-brain";
import { fetchUserTracksFromDb } from "@/lib/repositories/music-sync-repository";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const dbTracks = await fetchUserTracksFromDb(user.id);
    const tracks = toRadioTracksFromMusicTracks(dbTracks.map(mapDbTrackToMusicTrack));

    const brain = new GPTDJBrain();
    const memory = await brain.buildMemory({ tracks });
    const context = brain.buildContext();

    return NextResponse.json({
      ok: true,
      memory,
      context,
      trackCount: tracks.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to build DJ memory",
      },
      { status: 500 },
    );
  }
}

