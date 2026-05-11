import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getProgramById } from "@/lib/repositories/radio-program-repository";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const user = await resolveCurrentUser();
    const params = await context.params;
    const program = await getProgramById(params.id);

    if (!program || program.userId !== user.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Program not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      program,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch program",
      },
      { status: 500 },
    );
  }
}
