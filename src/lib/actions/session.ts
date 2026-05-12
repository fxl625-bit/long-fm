import { cookies } from "next/headers";
import { getOrCreateDemoUser, getUserById } from "@/lib/repositories/user-repository";

const USER_COOKIE_KEY = "flowmate_user_id";
const NETEASE_COOKIE_KEY = "netease_session";

function trySetUserCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, userId: string) {
  try {
    cookieStore.set(USER_COOKIE_KEY, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  } catch {
    // In Server Components, Next.js forbids mutating cookies. We still return demo user.
  }
}

export async function resolveCurrentUser() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    return getOrCreateDemoUser();
  }

  const userId = cookieStore.get(USER_COOKIE_KEY)?.value;

  if (userId) {
    const user = await getUserById(userId);
    if (user) {
      return user;
    }
  }

  const demoUser = await getOrCreateDemoUser();
  trySetUserCookie(cookieStore, demoUser.id);

  return demoUser;
}

export async function setCurrentUser(userId: string) {
  try {
    const cookieStore = await cookies();
    trySetUserCookie(cookieStore, userId);
  } catch {
    // Ignore when no request cookie store is available.
  }
}

export async function getNeteaseCookieFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(NETEASE_COOKIE_KEY)?.value ?? null;
  } catch {
    return null;
  }
}

export async function setNeteaseCookieSession(neteaseCookie: string) {
  try {
    const cookieStore = await cookies();
    cookieStore.set(NETEASE_COOKIE_KEY, neteaseCookie, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  } catch {
    // Server Component context - ignore
  }
}


