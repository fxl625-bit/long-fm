import { NextResponse } from "next/server";
import { getNeteaseOfficialEnvStatus } from "@/lib/config/netease-official-env";
import type { ProviderKind } from "@/lib/types/music";
import { createMusicProvider, createMusicProviderForMode, resolveMusicProviderMode } from "@/lib/providers/music";

const ALL_MODES: ProviderKind[] = ["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"];

function resolveFallbackMode(): ProviderKind {
  const fallback = process.env.MUSIC_PROVIDER_FALLBACK;
  if (
    fallback === "lx_music" ||
    fallback === "netease_official" ||
    fallback === "local" ||
    fallback === "demo" ||
    fallback === "netease_experimental" ||
    fallback === "generic_api"
  ) {
    return fallback;
  }
  return "demo";
}

export async function GET() {
  try {
    const configuredProvider = resolveMusicProviderMode();
    const fallbackProvider = resolveFallbackMode();
    const officialEnv = getNeteaseOfficialEnvStatus();

    const [effective, providers] = await Promise.all([
      createMusicProvider().healthcheck(),
      Promise.all(
        ALL_MODES.map(async (mode) => {
          const health = await createMusicProviderForMode(mode).healthcheck();
          return { mode, health };
        }),
      ),
    ]);

    const configuredHealth = providers.find((item) => item.mode === configuredProvider)?.health;
    const fallbackReason =
      effective.mode !== configuredProvider
        ? `Primary provider ${configuredProvider} is unavailable (${configuredHealth?.message ?? "unknown"}); switched to ${effective.mode}`
        : configuredHealth?.available
          ? ""
          : configuredHealth?.message ?? "";

    return NextResponse.json({
      ok: true,
      currentProvider: effective.mode,
      configuredProvider,
      fallbackProvider,
      enabled: officialEnv.enabled,
      missingVariables: officialEnv.missingVariables,
      fallbackReason,
      providerStatus: effective.status,
      providers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load provider status",
      },
      { status: 500 },
    );
  }
}


