import { NextResponse } from "next/server";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { getCurrentNeteaseSession, resolveNeteaseLoginFromCookie } from "@/lib/providers/netease/netease-auth";

function toRouteProfile(profile: { id: string; nickname: string; avatar?: string } | null, accountId?: string | null) {
  if (profile) {
    return {
      userId: profile.id,
      nickname: profile.nickname,
      avatarUrl: profile.avatar ?? null,
    };
  }

  if (accountId) {
    return {
      userId: accountId,
      nickname: "网易云用户",
      avatarUrl: null,
    };
  }

  return null;
}

export async function GET() {
  try {
    const { user, providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim();

    if (!cookie) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          status: "login_required",
          message: "NetEase login required",
        },
        { status: 401 },
      );
    }

    const resolved = await resolveNeteaseLoginFromCookie(cookie, new NeteaseClient());

    if (!resolved.profile && !resolved.account?.id) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          status: "login_required",
          message: "NetEase login required",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      status: resolved.status,
      profile: toRouteProfile(resolved.profile, resolved.account?.id ?? null),
      account: resolved.account,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch NetEase profile",
      },
      { status: 500 },
    );
  }
}
