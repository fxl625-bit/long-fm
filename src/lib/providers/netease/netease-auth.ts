import { ProviderType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveCurrentUser, setCurrentUser } from "@/lib/actions/session";
import type { MusicUserProfile } from "@/lib/types/music";
import { NeteaseClient } from "./netease-client";
import {
  extractNeteaseAccount,
  extractNeteaseCookie,
  extractNeteaseProfile,
  extractNeteaseUserId,
  type NeteaseAccountSummary,
} from "./netease-payload";

type NeteaseClientLike = Pick<NeteaseClient, "getLoginStatus" | "getUserDetail">;

function toJson(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

export type NeteaseResolvedLogin = {
  status: "logged_in" | "partial_logged_in";
  profile: MusicUserProfile | null;
  account: NeteaseAccountSummary | null;
  resolvedUserId?: string;
  loginStatus: Record<string, unknown>;
  userDetail?: Record<string, unknown> | null;
};

export type NeteaseCompletedQrLogin =
  | {
      ok: false;
      status: "authorized_but_no_cookie";
      message: string;
    }
  | {
      ok: true;
      status: "logged_in" | "partial_logged_in";
      cookie: string;
      profile: MusicUserProfile | null;
      account: NeteaseAccountSummary | null;
      raw: {
        qrCheckResult: Record<string, unknown>;
        loginStatus: Record<string, unknown>;
        userDetail?: Record<string, unknown> | null;
      };
    };

function debugLog(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[netease-auth] ${event}`, payload);
}

export async function getCurrentNeteaseSession() {
  const user = await resolveCurrentUser();
  const providerSession = await prisma.providerSession.findFirst({
    where: {
      userId: user.id,
      provider: ProviderType.NETEASE,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return {
    user,
    providerSession,
  };
}

export async function getNeteaseSessionForUser(userId: string) {
  return prisma.providerSession.findFirst({
    where: {
      userId,
      provider: ProviderType.NETEASE,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export async function persistNeteaseLoginSession(input: {
  profile: MusicUserProfile;
  cookie: string;
  rawSession?: Record<string, unknown>;
}) {
  const user = await prisma.user.upsert({
    where: {
      provider_providerUserId: {
        provider: ProviderType.NETEASE,
        providerUserId: input.profile.id,
      },
    },
    update: {
      nickname: input.profile.nickname,
      avatar: input.profile.avatar,
      provider: ProviderType.NETEASE,
    },
    create: {
      nickname: input.profile.nickname,
      avatar: input.profile.avatar,
      provider: ProviderType.NETEASE,
      providerUserId: input.profile.id,
    },
  });

  const existingSession = await prisma.providerSession.findFirst({
    where: {
      userId: user.id,
      provider: ProviderType.NETEASE,
    },
    select: {
      id: true,
    },
  });

  if (existingSession) {
    await prisma.providerSession.update({
      where: { id: existingSession.id },
      data: {
        cookie: input.cookie,
        rawSession: toJson(input.rawSession),
      },
    });
  } else {
    await prisma.providerSession.create({
      data: {
        userId: user.id,
        provider: ProviderType.NETEASE,
        cookie: input.cookie,
        rawSession: toJson(input.rawSession),
      },
    });
  }

  await setCurrentUser(user.id);
  return user;
}

export async function resolveNeteaseLoginFromCookie(
  cookie: string,
  client: NeteaseClientLike = new NeteaseClient(),
): Promise<NeteaseResolvedLogin> {
  const loginStatus = await client.getLoginStatus(cookie);
  let profile = extractNeteaseProfile(loginStatus);
  const account = extractNeteaseAccount(loginStatus);
  let userDetail: Record<string, unknown> | null = null;

  if (!profile && account?.id) {
    userDetail = await client.getUserDetail(account.id, cookie);
    profile = extractNeteaseProfile(userDetail);
  }

  if (!profile && account?.id) {
    profile = {
      id: account.id,
      nickname: "网易云用户",
      avatar: undefined,
    };
  }

  const resolvedUserId = profile?.id ?? account?.id ?? extractNeteaseUserId(userDetail);
  const status = profile ? "logged_in" : "partial_logged_in";

  debugLog("resolve-login", {
    hasProfile: Boolean(extractNeteaseProfile(loginStatus)),
    hasAccount: Boolean(account?.id),
    resolvedUserId: resolvedUserId ?? null,
    finalStatus: status,
  });

  return {
    status,
    profile,
    account,
    resolvedUserId: resolvedUserId ?? undefined,
    loginStatus,
    userDetail,
  };
}

export async function completeLoginAfterQrCheck(
  qrCheckResult: Record<string, unknown>,
  client: NeteaseClientLike = new NeteaseClient(),
): Promise<NeteaseCompletedQrLogin> {
  const cookie = extractNeteaseCookie(qrCheckResult);

  debugLog("qr-check", {
    qrCheckCode: qrCheckResult.code ?? null,
    hasCookie: Boolean(cookie),
  });

  if (!cookie) {
    return {
      ok: false,
      status: "authorized_but_no_cookie",
      message: "扫码成功，但没有返回 cookie",
    };
  }

  const resolved = await resolveNeteaseLoginFromCookie(cookie, client);

  debugLog("qr-check-complete", {
    hasProfile: Boolean(resolved.profile),
    hasAccount: Boolean(resolved.account?.id),
    resolvedUserId: resolved.resolvedUserId ?? null,
    finalStatus: resolved.status,
  });

  return {
    ok: true,
    status: resolved.status,
    cookie,
    profile: resolved.profile,
    account: resolved.account,
    raw: {
      qrCheckResult,
      loginStatus: resolved.loginStatus,
      userDetail: resolved.userDetail,
    },
  };
}
