import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { createMusicProvider, createMusicProviderForMode } from "@/lib/providers/music";
import { syncLibraryFromProvider } from "@/lib/repositories/music-sync-repository";
import { syncRequestSchema } from "@/lib/types/api";

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = syncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid sync request",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const provider = parsed.data.mode ? createMusicProviderForMode(parsed.data.mode) : createMusicProvider();
    const summary = await syncLibraryFromProvider(user.id, provider, parsed.data.providerToken);

    return NextResponse.json({
      ok: true,
      provider: provider.providerName,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Provider sync failed",
      },
      { status: 500 },
    );
  }
}
