import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date().toISOString();
  let neteasePkg = "unknown";
  try {
    const pkg = require("@neteasecloudmusicapienhanced/api");
    neteasePkg = typeof pkg.login_qr_key === "function" ? "loaded" : "missing_fn";
  } catch (e) {
    neteasePkg = `error: ${(e as Error).message.slice(0, 80)}`;
  }

  return NextResponse.json({
    ok: true,
    time: now,
    neteasePkg,
  });
}
