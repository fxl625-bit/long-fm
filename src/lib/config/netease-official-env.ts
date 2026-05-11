import { Buffer } from "node:buffer";
import { readServerEnvVar } from "@/lib/config/server-env";

export const NETEASE_OFFICIAL_REQUIRED_ENV_KEYS = [
  "NETEASE_OFFICIAL_APP_ID",
  "NETEASE_OFFICIAL_APP_SECRET",
  "NETEASE_OFFICIAL_API_BASE_URL",
  "NETEASE_OFFICIAL_PRIVATE_KEY",
] as const;

type NeteaseOfficialEnvKey = (typeof NETEASE_OFFICIAL_REQUIRED_ENV_KEYS)[number];

function normalizeBooleanString(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function maybeDecodeBase64Pem(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "");
  if (!compact || compact.includes("BEGIN")) {
    return null;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length % 4 !== 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    if (decoded.includes("BEGIN") && decoded.includes("PRIVATE KEY")) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

function maybeWrapBase64AsPem(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "");
  if (!compact || compact.includes("BEGIN")) {
    return null;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return null;
  }

  const lines = compact.match(/.{1,64}/g);
  if (!lines?.length) {
    return null;
  }

  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function normalizePemOneLine(value: string): string {
  let normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  normalized = normalized.replace(/\\n/g, "\n");

  if (normalized.includes("-----BEGIN") && normalized.includes("-----END") && !normalized.includes("\n")) {
    normalized = normalized
      .replace(/-----BEGIN ([A-Z ]+)-----\s*/, "-----BEGIN $1-----\n")
      .replace(/\s*-----END ([A-Z ]+)-----/, "\n-----END $1-----");
  }

  return normalized.trim();
}

export function normalizeNeteaseOfficialPrivateKey(rawValue?: string): string {
  if (!rawValue?.trim()) {
    return "";
  }

  const trimmed = rawValue.trim();
  const decoded = maybeDecodeBase64Pem(trimmed);
  const wrappedPem = decoded ? null : maybeWrapBase64AsPem(trimmed);
  const source = decoded ?? wrappedPem ?? rawValue;
  return normalizePemOneLine(source);
}

export function getNeteaseOfficialEnvStatus() {
  const enabledRaw = readServerEnvVar("NETEASE_OFFICIAL_ENABLED") ?? "";
  const enabled = normalizeBooleanString(enabledRaw);

  const values: Record<NeteaseOfficialEnvKey, string> = {
    NETEASE_OFFICIAL_APP_ID: readServerEnvVar("NETEASE_OFFICIAL_APP_ID") ?? "",
    NETEASE_OFFICIAL_APP_SECRET: readServerEnvVar("NETEASE_OFFICIAL_APP_SECRET") ?? "",
    NETEASE_OFFICIAL_API_BASE_URL: readServerEnvVar("NETEASE_OFFICIAL_API_BASE_URL") ?? "",
    NETEASE_OFFICIAL_PRIVATE_KEY: normalizeNeteaseOfficialPrivateKey(readServerEnvVar("NETEASE_OFFICIAL_PRIVATE_KEY")),
  };

  const missingVariables = NETEASE_OFFICIAL_REQUIRED_ENV_KEYS.filter((key) => !values[key]?.trim());

  return {
    enabled,
    enabledRaw,
    missingVariables,
    configured: missingVariables.length === 0,
    appId: values.NETEASE_OFFICIAL_APP_ID,
    appSecret: values.NETEASE_OFFICIAL_APP_SECRET,
    apiBaseUrl: values.NETEASE_OFFICIAL_API_BASE_URL,
    privateKey: values.NETEASE_OFFICIAL_PRIVATE_KEY,
    publicKey: readServerEnvVar("NETEASE_OFFICIAL_PUBLIC_KEY") ?? "",
    tokenPath: readServerEnvVar("NETEASE_OFFICIAL_TOKEN_PATH") ?? "/oauth2/token",
    profilePath: readServerEnvVar("NETEASE_OFFICIAL_PROFILE_PATH") ?? "/v1/user/profile",
    playlistsPath: readServerEnvVar("NETEASE_OFFICIAL_PLAYLISTS_PATH") ?? "/v1/user/playlists",
    playlistDetailPath:
      readServerEnvVar("NETEASE_OFFICIAL_PLAYLIST_DETAIL_PATH") ?? "/v1/playlists/{playlistId}",
    likedSongsPath: readServerEnvVar("NETEASE_OFFICIAL_LIKED_SONGS_PATH") ?? "/v1/user/liked-songs",
    searchPath: readServerEnvVar("NETEASE_OFFICIAL_SEARCH_PATH") ?? "/v1/search/songs",
    songDetailPath: readServerEnvVar("NETEASE_OFFICIAL_SONG_DETAIL_PATH") ?? "/v1/songs/{songId}",
    playableUrlPath: readServerEnvVar("NETEASE_OFFICIAL_PLAYABLE_URL_PATH") ?? "/v1/songs/{songId}/play-url",
  };
}

