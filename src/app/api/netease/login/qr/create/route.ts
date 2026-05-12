import { NextResponse } from "next/server";
import { readServerEnvVar } from "@/lib/config/server-env";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";

export async function POST() {
  try {
    // If a preset cookie is configured, don't need QR login
    if (readServerEnvVar("NETEASE_COOKIE")?.trim()) {
      return NextResponse.json({
        ok: true,
        cookieLogin: true,
        qrKey: "",
        qrImageUrl: "",
        qrUrl: "",
      });
    }

    const session = await new NeteaseClient().createQrSession();
    return NextResponse.json({
      ok: true,
      qrKey: session.qrKey,
      qrImageUrl: session.qrImageUrl,
      qrUrl: session.qrUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to create NetEase QR login",
      },
      { status: 500 },
    );
  }
}
