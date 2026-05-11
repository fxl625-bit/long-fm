import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { tuneTodayDJ } from "@/lib/engines/proactive-dj-engine";
import { getPlaybackSession } from "@/lib/repositories/playback-session-repository";
import { djTuneSchema } from "@/lib/types/api";

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = djTuneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid DJ tune payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const beforeSession = await getPlaybackSession(user.id);
    const beforeIds = new Set((beforeSession?.queue ?? []).map((item) => item.track.id));

    const payload = await tuneTodayDJ(user.id, parsed.data.tweak, parsed.data.prompt);
    const retained = payload.queue.reduce((count, item) => (beforeIds.has(item.track.id) ? count + 1 : count), 0);
    const replacedCount = Math.max(0, payload.queue.length - retained);

    return NextResponse.json({
      ok: true,
      replacedCount,
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to tune DJ queue",
      },
      { status: 500 },
    );
  }
}
