import type { MusicUserProfile } from "@/lib/types/music";

export type NeteaseAccountSummary = {
  id: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickContainers(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];

  const containers: Record<string, unknown>[] = [root];
  const data = asRecord(root.data);
  const body = asRecord(root.body);

  if (data) containers.push(data);
  if (body) containers.push(body);

  return containers;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return readString(value);
}

export function extractNeteaseCookie(payload: unknown): string | undefined {
  for (const container of pickContainers(payload)) {
    const cookie = readString(container.cookie);
    if (cookie) return cookie;
  }
  return undefined;
}

export function extractNeteaseAccount(payload: unknown): NeteaseAccountSummary | null {
  for (const container of pickContainers(payload)) {
    const account = asRecord(container.account);
    const id = readId(account?.id ?? account?.userId ?? container.userId);
    if (id) {
      return { id };
    }
  }
  return null;
}

export function extractNeteaseProfile(payload: unknown): MusicUserProfile | null {
  for (const container of pickContainers(payload)) {
    const profile = asRecord(container.profile) ?? container;
    const id = readId(profile.userId ?? profile.id);
    if (!id) continue;

    const nickname =
      readString(profile.nickname) ??
      readString(profile.nickName) ??
      readString(profile.name) ??
      "网易云用户";
    const avatar = readString(profile.avatarUrl) ?? readString(profile.avatar);

    return {
      id,
      nickname,
      avatar,
    };
  }
  return null;
}

export function extractNeteaseUserId(payload: unknown): string | undefined {
  const profile = extractNeteaseProfile(payload);
  if (profile?.id) return profile.id;

  const account = extractNeteaseAccount(payload);
  if (account?.id) return account.id;

  for (const container of pickContainers(payload)) {
    const userPoint = asRecord(container.userPoint);
    const id = readId(userPoint?.userId ?? container.userId);
    if (id) return id;
  }

  return undefined;
}
