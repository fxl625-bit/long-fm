import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getTodayDJPayload } from "@/lib/engines/proactive-dj-engine";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const payload = await getTodayDJPayload(user.id);

    return NextResponse.json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to prepare DJ payload",
      },
      { status: 500 },
    );
  }
}
