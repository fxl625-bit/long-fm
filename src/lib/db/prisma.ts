import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const _prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = _prisma;
}

const DEMO_USER = {
  id: "demo-user-fallback",
  nickname: "Listener",
  avatar: null,
  provider: "MOCK",
  providerUserId: "demo-user-fallback",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEMO_PLAYLIST = {
  id: "demo-playlist-fallback",
  userId: "demo-user-fallback",
  providerPlaylistId: null,
  source: "MOCK",
  name: "My Playlist",
  description: null,
  coverUrl: null,
  isLikedPlaylist: true,
  rawMeta: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function isDbError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Unable to open the database file")
    || msg.includes("Error code 14")
    || msg.includes("database is locked")
    || msg.includes("database disk image");
}

function createSafePrisma(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop: string) {
      const original = (target as Record<string, unknown>)[prop];
      if (typeof original !== "object" || original === null) return original;

      return new Proxy(original as object, {
        get(_, method: string) {
          const fn = (original as Record<string, unknown>)[method];
          if (typeof fn !== "function") return fn;

          return async (...args: unknown[]) => {
            try {
              return await (fn as Function).apply(original, args);
            } catch (error) {
              if (isDbError(error)) {
                console.warn(`[prisma] DB unavailable, fallback: ${String(prop)}.${method}()`);
                if (method === "findUnique" || method === "findFirst") {
                  // Return a sensible fallback for user lookups
                  const where = (args[0] as Record<string, unknown>)?.where as Record<string, unknown> | undefined;
                  if (where?.id === DEMO_USER.id || where?.provider_providerUserId) return { ...DEMO_USER };
                  return null;
                }
                if (method === "findMany") return [];
                if (method === "count") return 0;
                if (method === "create") {
                  const data = (args[0] as Record<string, unknown>)?.data;
                  return { id: DEMO_USER.id, ...DEMO_USER, ...(data as object ?? {}) };
                }
                if (method === "upsert") return { id: DEMO_USER.id, ...DEMO_USER };
                if (method === "update") return { id: DEMO_USER.id, ...DEMO_USER };
                if (method === "delete") return { id: DEMO_USER.id, ...DEMO_USER };
                if (method === "$transaction") {
                  const fn = args[0] as Function;
                  const safeTx = createSafePrisma(client);
                  try { return await fn(safeTx); } catch { return null; }
                }
                return null;
              }
              throw error;
            }
          };
        },
      });
    },
  }) as unknown as PrismaClient;
}

export const prisma = createSafePrisma(_prisma);
