import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { refreshTodayDJ } from "@/lib/engines/proactive-dj-engine";

export async function POST() {
  try {
    const user = await resolveCurrentUser();
    const payload = await refreshTodayDJ(user.id);

    return NextResponse.json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to refresh DJ queue",
      },
      { status: 500 },
    );
  }
}
