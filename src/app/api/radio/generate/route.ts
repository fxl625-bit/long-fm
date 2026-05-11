import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { analyzeMusicProfile } from "@/lib/engines/music-profile-engine";
import { generateRadioProgram } from "@/lib/engines/radio-program-engine";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getUserMusicProfile, saveUserMusicProfile } from "@/lib/repositories/music-profile-repository";
import { fetchUserTracksFromDb } from "@/lib/repositories/music-sync-repository";
import { listRecentProgramTrackIds, saveRadioProgram } from "@/lib/repositories/radio-program-repository";
import { generateProgramSchema } from "@/lib/types/api";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";
import { parseStructuredProfile } from "@/lib/utils/profile-json";

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json();

    const parsed = generateProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid generate payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;

    const profileRecord = await getUserMusicProfile(user.id);

    let profile = profileRecord ? parseStructuredProfile(profileRecord.structuredProfileJson) : null;

    if (!profile) {
      const tracksFromDb = await fetchUserTracksFromDb(user.id);
      const generatedProfile = await analyzeMusicProfile(tracksFromDb);
      await saveUserMusicProfile(user.id, generatedProfile);
      profile = generatedProfile.structured;
    }

    const tracksFromDb = payload.playlistId
      ? await prisma.track.findMany({
          where: {
            playlists: {
              some: {
                playlistId: payload.playlistId,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : await fetchUserTracksFromDb(user.id);

    if (!tracksFromDb.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "No tracks found. Please sync music source first.",
        },
        { status: 400 },
      );
    }

    const tracks = tracksFromDb.map(mapDbTrackToMusicTrack);
    const recentTrackIds = await listRecentProgramTrackIds(user.id, 3, 36);

    const program = await generateRadioProgram({
      userPrompt: payload.prompt,
      tracks,
      profile,
      desiredTrackCount: payload.desiredTrackCount,
      tweak: payload.tweak,
      styleId: payload.styleId,
      avoidTrackIds: recentTrackIds,
    });

    const saved = await saveRadioProgram(user.id, program);

    return NextResponse.json({
      ok: true,
      programId: saved.id,
      program,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to generate program",
      },
      { status: 500 },
    );
  }
}
