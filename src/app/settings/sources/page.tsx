import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { AuroraBackground } from "@/components/layout/aurora-background";
import { TopNav } from "@/components/layout/top-nav";
import { TTSSettingsCard } from "@/components/settings/tts-settings-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getNeteaseOfficialEnvStatus } from "@/lib/config/netease-official-env";
import type { ProviderKind } from "@/lib/types/music";
import { createMusicProvider, createMusicProviderForMode, resolveMusicProviderMode } from "@/lib/providers/music";

const ALL_MODES: ProviderKind[] = ["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"];

function statusLabel(status: string) {
  switch (status) {
    case "available":
      return "可用";
    case "degraded":
      return "降级中";
    case "metadata_only":
      return "仅元数据";
    default:
      return "不可用";
  }
}

export default async function SourcesPage() {
  const user = await resolveCurrentUser();
  if (!user) {
    redirect("/");
  }

  const activeMode = resolveMusicProviderMode();
  const fallbackMode =
    process.env.MUSIC_PROVIDER_FALLBACK === "lx_music" ||
    process.env.MUSIC_PROVIDER_FALLBACK === "netease_official" ||
    process.env.MUSIC_PROVIDER_FALLBACK === "local" ||
    process.env.MUSIC_PROVIDER_FALLBACK === "demo" ||
    process.env.MUSIC_PROVIDER_FALLBACK === "netease_experimental" ||
    process.env.MUSIC_PROVIDER_FALLBACK === "generic_api"
      ? process.env.MUSIC_PROVIDER_FALLBACK
      : "demo";

  const officialEnv = getNeteaseOfficialEnvStatus();

  const [effective, providers] = await Promise.all([
    createMusicProvider().healthcheck(),
    Promise.all(
      ALL_MODES.map(async (mode) => {
        const provider = createMusicProviderForMode(mode);
        const health = await provider.healthcheck();
        return { mode, health };
      }),
    ),
  ]);
  const officialConfigured = officialEnv.configured;
  const officialMissingVariables = officialEnv.missingVariables;
  const activeHealth = providers.find((item) => item.mode === activeMode)?.health;
  const fallbackReason =
    effective.mode !== activeMode
      ? `主源 ${activeMode} 不可用（${activeHealth?.message ?? "unknown"}），已切换到 ${effective.mode}`
      : "";

  return (
    <AuroraBackground>
      <TopNav />
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 pb-14">
        <Card>
          <CardHeader>
            <CardTitle>音乐源设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <p>
              当前模式：<span className="font-medium text-zinc-100">{activeMode}</span>
            </p>
            <p>
              LX API：<span className="font-medium text-zinc-100">{process.env.LX_MUSIC_API_BASE_URL || "http://127.0.0.1:23330"}</span>
            </p>
            <p>
              Fallback：<span className="font-medium text-zinc-100">{fallbackMode}</span>
            </p>
            <p>
              LOCAL_AUDIO_DIR：<span className="font-medium text-zinc-100">{process.env.LOCAL_AUDIO_DIR || "未配置"}</span>
            </p>
            <p>
              官方开关：<span className="font-medium text-zinc-100">{officialEnv.enabled ? "已启用" : "未启用"}</span>
            </p>
            <p>
              官方配置：<span className="font-medium text-zinc-100">{officialConfigured ? "已配置" : "缺少必填变量"}</span>
            </p>
            {officialMissingVariables.length ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                <p>缺少官方变量：</p>
                <p>{officialMissingVariables.join(", ")}</p>
              </div>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              {effective.status === "available" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : effective.status === "metadata_only" ? (
                <CircleDashed className="h-4 w-4 text-amber-300" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              )}
              <span>
                {statusLabel(effective.status)} · {effective.message ?? ""}
              </span>
            </div>
            {effective.status !== "available" ? (
              <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                当前音乐源暂时不可用，已切到演示源。
              </p>
            ) : null}
            {fallbackReason ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">{fallbackReason}</p>
            ) : null}
          </CardContent>
        </Card>

        <TTSSettingsCard />

        <div className="grid gap-3 md:grid-cols-2">
          {providers.map((item) => (
            <Card key={item.mode} className="bg-white/[0.04]">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-base font-medium text-zinc-100">{item.mode}</p>
                  <Badge
                    variant={
                      item.health.status === "available"
                        ? "default"
                        : item.health.status === "metadata_only"
                          ? "accent"
                          : "muted"
                    }
                  >
                    {statusLabel(item.health.status)}
                  </Badge>
                </div>
                <p className="text-sm text-zinc-400">{item.health.message ?? "-"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </AuroraBackground>
  );
}

export const dynamic = "force-dynamic";
