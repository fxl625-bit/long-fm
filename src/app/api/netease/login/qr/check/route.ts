import { NextResponse } from "next/server";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { completeLoginAfterQrCheck, persistNeteaseLoginSession } from "@/lib/providers/netease/netease-auth";
import { syncLibraryFromProvider } from "@/lib/repositories/music-sync-repository";

function toRouteProfile(profile: { id: string; nickname: string; avatar?: string } | null) {
  if (!profile) return null;
  return {
    userId: profile.id,
    nickname: profile.nickname,
    avatarUrl: profile.avatar ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const qrKey = typeof body?.qrKey === "string" ? body.qrKey.trim() : "";
    if (!qrKey) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          cookieSaved: false,
          profile: null,
          account: null,
          message: "qrKey is required",
        },
        { status: 400 },
      );
    }

    const client = new NeteaseClient();
    const result = await client.checkQrSession(qrKey);

    if (result.status !== "authorized") {
      return NextResponse.json({
        ok: true,
        status: result.status,
        cookieSaved: false,
        profile: null,
        account: null,
        message: result.message,
      });
    }

    const completed = await completeLoginAfterQrCheck(
      {
        code: 803,
        status: result.status,
        cookie: result.cookie,
        message: result.message,
      },
      client,
    );

    if (!completed.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          cookieSaved: false,
          profile: null,
          account: null,
          message: completed.message,
        },
        { status: 500 },
      );
    }

    let cookieSaved = false;
    let syncSummary = null;

    if (completed.profile) {
      const user = await persistNeteaseLoginSession({
        profile: completed.profile,
        cookie: completed.cookie,
        rawSession: {
          qrKey,
          message: result.message,
          account: completed.account ?? undefined,
        },
      });
      cookieSaved = true;
      syncSummary = await syncLibraryFromProvider(user.id, client.provider, completed.cookie).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      status: completed.status,
      cookieSaved,
      profile: toRouteProfile(completed.profile),
      account: completed.account,
      syncSummary,
      message:
        completed.status === "partial_logged_in"
          ? "扫码成功，Cookie 已保存，正在继续补全网易云资料。"
          : "扫码登录成功，正在同步网易云歌单。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        cookieSaved: false,
        profile: null,
        account: null,
        message: error instanceof Error ? error.message : "Failed to check NetEase QR login",
      },
      { status: 500 },
    );
  }
}
