import { NextResponse } from "next/server";
import { readServerEnvVar } from "@/lib/config/server-env";

export async function POST() {
  try {
    const mod = await import("@/lib/providers/netease/netease-client");
    const client = new mod.NeteaseClient();
    const session = await client.createQrSession();
    return NextResponse.json({
      ok: true,
      qrKey: session.qrKey,
      qrImageUrl: session.qrImageUrl,
      qrUrl: session.qrUrl,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // If NetEase package unavailable (Vercel), check for preset cookie
    if (msg.includes("ENOENT") || msg.includes("Cannot find module")) {
      const presetCookie = readServerEnvVar("NETEASE_COOKIE")?.trim();
      if (presetCookie) {
        return NextResponse.json({
          ok: true, cookieLogin: true,
          qrKey: "", qrImageUrl: "", qrUrl: "",
        });
      }
      return NextResponse.json({
        ok: false,
        message: "网易云 API 在当前环境不可用。本地版本支持完整扫码登录。",
      }, { status: 500 });
    }
    return NextResponse.json({
      ok: false,
      message: msg || "Failed to create NetEase QR login",
    }, { status: 500 });
  }
}
