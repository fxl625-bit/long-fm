import { NextResponse } from "next/server";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";

export async function GET() {
  const { providerSession } = await getCurrentNeteaseSession();
  const cookie = providerSession?.cookie?.trim() ?? "";

  return NextResponse.json({
    ok: Boolean(cookie),
    cookie,
  });
}
