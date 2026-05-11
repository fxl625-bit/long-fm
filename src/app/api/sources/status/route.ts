import { NextResponse } from "next/server";
import { getNeteaseOfficialEnvStatus } from "@/lib/config/netease-official-env";
import type { ProviderKind } from "@/lib/types/music";
import { createMusicProvider, createMusicProviderForMode, resolveMusicProviderMode } from "@/lib/providers/music";

const ALL_MODES: ProviderKind[] = ["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"];

export async function GET() {
  try {
    const activeMode = resolveMusicProviderMode();
    const officialEnv = getNeteaseOfficialEnvStatus();
    const fallbackMode =
      process.env.MUSIC_PROVIDER_FALLBACK === "lx_music" ||
      process.env.MUSIC_PROVIDER_FALLBACK === "netease_official" ||
      process.env.MUSIC_PROVIDER_FALLBACK === "local" ||
      process.env.MUSIC_PROVIDER_FALLBACK === "demo" ||
      process.env.MUSIC_PROVIDER_FALLBACK === "netease_experimental" ||
      process.env.MUSIC_PROVIDER_FALLBACK === "generic_api"
        ? process.env.MUSIC_PROVIDER_FALLBACK
        : "demo";

    const [effectiveHealth, all] = await Promise.all([
      createMusicProvider().healthcheck(),
      Promise.all(
        ALL_MODES.map(async (mode) => {
          const provider = createMusicProviderForMode(mode);
          const health = await provider.healthcheck();
          return {
            sourceMode: mode,
            provider: provider.providerName,
            ...health,
          };
        }),
      ),
    ]);

    return NextResponse.json({
      ok: true,
      activeMode,
      fallbackMode,
      neteaseOfficialEnabled: officialEnv.enabled,
      neteaseOfficialMissingVariables: officialEnv.missingVariables,
      effective: effectiveHealth,
      providers: all,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load source status",
      },
      { status: 500 },
    );
  }
}

