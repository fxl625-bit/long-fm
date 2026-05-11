type LXMusicEnv = Record<string, string | undefined>;

export type LXMusicRuntimeConfig = {
  apiBaseUrl: string;
  enabled: boolean;
  useSSE: boolean;
};

function normalizeBoolean(value?: string, fallback = true): boolean {
  if (!value?.trim()) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveLXMusicConfig(env: LXMusicEnv = process.env): LXMusicRuntimeConfig {
  const apiBaseUrl = env.NEXT_PUBLIC_LX_MUSIC_API_BASE_URL ?? env.LX_MUSIC_API_BASE_URL ?? "http://127.0.0.1:23330";
  const enabledRaw = env.NEXT_PUBLIC_LX_MUSIC_ENABLED ?? env.LX_MUSIC_ENABLED;
  const useSSERaw = env.NEXT_PUBLIC_LX_MUSIC_USE_SSE ?? env.LX_MUSIC_USE_SSE;

  return {
    apiBaseUrl: trimTrailingSlash(apiBaseUrl),
    enabled: normalizeBoolean(enabledRaw, true),
    useSSE: normalizeBoolean(useSSERaw, true),
  };
}
