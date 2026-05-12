import { NextResponse } from "next/server";
import { getInstalledNeteaseApiPackage } from "@/lib/providers/netease/netease-api-mode";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: Package resolution
  try {
    const pkgName = getInstalledNeteaseApiPackage();
    results.packageName = pkgName ?? "NOT FOUND";
  } catch (e) {
    results.packageError = (e as Error).message;
  }

  // Test 2: Package loading
  try {
    const pkgName = getInstalledNeteaseApiPackage();
    if (pkgName) {
      const api = require(pkgName) as Record<string, unknown>;
      results.packageLoaded = true;
      results.hasLoginQrKey = typeof api.login_qr_key;
    }
  } catch (e) {
    results.loadError = (e as Error).message;
  }

  // Test 3: Direct API call
  try {
    const pkgName = getInstalledNeteaseApiPackage();
    if (pkgName) {
      const api = require(pkgName) as Record<string, unknown>;
      const fn = api.login_qr_key as Function;
      const result = await fn({});
      results.qrKeyResult = {
        status: (result as Record<string, unknown>).status,
        hasBody: !!((result as Record<string, unknown>).body),
      };
    }
  } catch (e) {
    results.qrKeyError = (e as Error).message;
  }

  return NextResponse.json({ ok: true, ...results });
}
