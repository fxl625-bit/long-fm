import { NextResponse } from "next/server";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";

export async function POST() {
  try {
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
