import { NextResponse } from "next/server";
import { getOrCreateDemoUser } from "@/lib/repositories/user-repository";
import { setCurrentUser } from "@/lib/actions/session";

export async function POST() {
  const user = await getOrCreateDemoUser();
  await setCurrentUser(user.id);

  return NextResponse.json({
    ok: true,
    user,
  });
}

