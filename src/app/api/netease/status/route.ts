import { ProviderType } from "@prisma/client";
import { NextResponse } from "next/server";
import { readServerEnvVar } from "@/lib/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { getCurrentNeteaseSession, resolveNeteaseLoginFromCookie } from "@/lib/providers/netease/netease-auth";
import type { NeteaseStatusPayload } from "@/lib/providers/netease/netease-types";

export async function GET() {
  try {
    const { user, providerSession } = await getCurrentNeteaseSession();
    const presetCookie = readServerEnvVar("NETEASE_COOKIE")?.trim();
    const cookie = providerSession?.cookie?.trim() || presetCookie;

    if (!cookie) {
      const payload: NeteaseStatusPayload = {
        authenticated: false,
        loginState: "login_required",
        message: "请先用网易云扫码登录，或设置 NETEASE_COOKIE 环境变量。",
      };
      return NextResponse.json({
        ok: true,
        ...payload,
      });
    }

    const client = new NeteaseClient();
    const resolved = await resolveNeteaseLoginFromCookie(cookie, client);
    const profile = resolved.profile ?? (resolved.account ? { id: resolved.account.id, nickname: "网易云用户" } : null);

    if (!profile) {
      const payload: NeteaseStatusPayload = {
        authenticated: false,
        loginState: "login_required",
        message: "网易云登录态失效，请重新扫码登录。",
      };
      return NextResponse.json({
        ok: true,
        ...payload,
      });
    }

    const [remotePlaylists, playableTrackCount, likedPlaylist] = await Promise.all([
      client.getUserPlaylists(cookie).catch(() => []),
      prisma.track.count({
        where: {
          source: ProviderType.NETEASE,
          audioUrl: {
            not: null,
          },
          playlists: {
            some: {
              playlist: {
                userId: user.id,
                source: ProviderType.NETEASE,
              },
            },
          },
        },
      }),
      prisma.playlist.findFirst({
        where: {
          userId: user.id,
          source: ProviderType.NETEASE,
          isLikedPlaylist: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }).catch(() => null),
    ]);
    const likedRemotePlaylist = remotePlaylists.find((item) => item.isLikedPlaylist) ?? remotePlaylists[0];
    const playlistsCount = remotePlaylists.length;

    const payload: NeteaseStatusPayload = {
      authenticated: true,
      loginState: "logged_in",
      message: playableTrackCount
        ? "网易云已连接，数据库里已经有可验证的真实播放曲目。"
        : "网易云已连接，可以开始构建真实播放队列。",
      profile,
      likedPlaylistId: likedRemotePlaylist?.id ?? likedPlaylist?.providerPlaylistId ?? likedPlaylist?.id,
      playlistsCount,
      playableTrackCount,
    };

    return NextResponse.json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    console.error("[netease] status route error:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch NetEase status",
      },
      { status: 500 },
    );
  }
}
