import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { analyzeMusicProfile } from "@/lib/engines/music-profile-engine";
import { createMusicProvider } from "@/lib/providers/music";
import { getUserMusicProfile, saveUserMusicProfile } from "@/lib/repositories/music-profile-repository";
import { fetchUserTracksFromDb, syncLibraryFromProvider } from "@/lib/repositories/music-sync-repository";
import { generateProfileSchema } from "@/lib/types/api";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const profile = await getUserMusicProfile(user.id);

    return NextResponse.json({
      ok: true,
      profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch profile",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = generateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid profile generation payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    let tracks = await fetchUserTracksFromDb(user.id);

    if (!tracks.length || parsed.data.force) {
      const provider = createMusicProvider();
      await syncLibraryFromProvider(user.id, provider);
      tracks = await fetchUserTracksFromDb(user.id);
    }

    const persona = await analyzeMusicProfile(tracks);
    const saved = await saveUserMusicProfile(user.id, persona);

    return NextResponse.json({
      ok: true,
      profile: saved,
      structured: persona.structured,
      summaryText: persona.summaryText,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to generate profile",
      },
      { status: 500 },
    );
  }
}
