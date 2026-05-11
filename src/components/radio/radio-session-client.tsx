"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pause, Play, RefreshCw, SkipForward, Volume2 } from "lucide-react";
import { useRadioRuntime } from "@/hooks/use-radio-runtime";
import { Badge } from "@/components/ui/badge";
import { CompactTopNav } from "@/components/layout/top-nav";
import { VoiceSelector } from "@/components/radio/voice-selector";
import { PRODUCT_NAME } from "@/lib/constants/product";

function formatTime(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusLabel(status: string, hasStarted: boolean) {
  if (status === "login_required") return "Login Required";
  if (status === "loading_library") return "Preparing";
  if (status === "ready") return hasStarted ? "Ready" : "Preparing";
  if (status === "on_air") return "ON AIR";
  if (status === "playing") return "Playing";
  if (status === "speaking") return "DJ Speaking";
  if (status === "locked") return "Tap to Join";
  if (status === "tuning") return "Tuning";
  if (status === "paused") return "Paused";
  if (status === "need_playable_tracks" || status === "need_source") return "Need Tracks";
  return status;
}

export function RadioSessionClient() {
  const { state, actions, debug, netease, session } = useRadioRuntime();
  const [clockText] = useState(() =>
    new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
  );
  const ambientStartLock = useRef(false);

  const bars = useMemo(() => Array.from({ length: 64 }, (_, idx) => idx), []);
  const progress = state.duration ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;
  const queuePreview = state.playableQueue.slice(state.currentIndex + 1, state.currentIndex + 6);
  const isLive = state.status === "playing" || state.status === "speaking" || state.status === "on_air";
  const canPause = session.hasStarted && (state.status === "playing" || state.status === "on_air" || state.status === "speaking");
  const canResume = session.hasStarted && state.status === "paused";
  const needsLogin = netease.loginState !== "logged_in";
  const currentTrack = state.currentTrack;
  const needsTapToJoin = !needsLogin && !session.hasStarted && Boolean(currentTrack);
  const directorOffline = Boolean(session.directorOffline);
  const tuneOptions = [
    { label: "轻松一点", prompt: "lighter_now" },
    { label: "换个感觉", prompt: "换个惊喜" },
  ];

  const handleAmbientStart = async () => {
    if (!needsTapToJoin || ambientStartLock.current) {
      return;
    }
    ambientStartLock.current = true;
    try {
      await actions.startSessionFromUserGesture("direct_radio_click");
    } finally {
      ambientStartLock.current = false;
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f3f0e8] px-4 py-8 text-zinc-950 md:py-12"
      onPointerDownCapture={needsTapToJoin ? () => actions.primeAudio() : undefined}
      onClickCapture={needsTapToJoin ? () => void handleAmbientStart() : undefined}
    >
      <div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
        <CompactTopNav />

        <section className="overflow-hidden rounded-[32px] border border-zinc-950/10 bg-[#101113] text-zinc-50 shadow-[0_30px_80px_rgba(20,20,20,0.24)]">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isLive ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" : "bg-amber-300"
                }`}
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">ON AIR</p>
                <p className="text-sm font-semibold">{PRODUCT_NAME}</p>
                <p className="text-[10px] text-zinc-500">{netease.authenticated ? "来自网易云" : "私人频道"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums">{clockText}</p>
              <p className="text-[11px] text-zinc-400">{statusLabel(state.status, session.hasStarted)}</p>
            </div>
          </header>

          <main className="px-5 pb-5 pt-6">
            {needsTapToJoin ? (
              <div className="mb-4 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-center text-[12px] text-emerald-100">
                点击页面任意位置接入频道
              </div>
            ) : null}

            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_25%,#f8fafc,transparent_16%),linear-gradient(145deg,#2dd4bf,#155e75_45%,#0f172a)] shadow-[0_18px_45px_rgba(45,212,191,0.18)]">
              <div className="h-12 w-12 rounded-full border border-white/35 bg-black/30 backdrop-blur" />
            </div>

            <div className="mt-5 w-full rounded-[22px] border border-white/10 bg-white/[0.04] p-3">
              <div className="flex h-[112px] w-full items-end gap-[2px]">
                {bars.map((bar) => (
                  <span
                    key={bar}
                    className={`min-w-0 flex-1 origin-bottom rounded-full bg-zinc-100/80 ${
                      state.isPlaying || state.isSpeaking ? "episode-eq" : ""
                    }`}
                    style={{
                      height: `${18 + ((bar * 17) % 70)}px`,
                      animationDelay: `${bar * 19}ms`,
                      animationDuration: `${900 + (bar % 8) * 65}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">当前歌曲</p>
                  <p className="mt-1 line-clamp-1 text-base font-semibold">
                    {currentTrack ? `${currentTrack.title} / ${currentTrack.artist}` : "等待正式队列"}
                  </p>
                  <p className="line-clamp-1 text-sm text-zinc-400">
                    {currentTrack?.album || (needsLogin ? "登录后读取你的网易云歌单" : "正在播出")}
                  </p>
                </div>
                {currentTrack?.coverUrl ? (
                  <Image
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-2xl object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-[24px] bg-[#f7f3ea] px-4 py-4 text-zinc-950 shadow-inner shadow-zinc-900/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">DJ 字幕</p>
              <p key={state.currentSubtitle} className="subtitle-fade mt-2 min-h-[72px] text-[18px] leading-[1.62] text-zinc-950 md:text-[20px]">
                {state.currentSubtitle || "频道正在准备中..."}
              </p>
              {directorOffline ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="accent">Director Offline</Badge>
                  <p className="text-[12px] leading-5 text-zinc-600">纯音乐接管中，后续播出会继续推进。</p>
                </div>
              ) : null}
              <div className="mt-2 max-h-16 space-y-1 overflow-hidden">
                {state.subtitleHistory.slice(0, 3).map((line, idx) => (
                  <p
                    key={`${line}-${idx}`}
                    className="text-[13px] leading-[1.6] text-zinc-600"
                    style={{ opacity: Math.max(0.35, 0.55 - idx * 0.08) }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {needsLogin && netease.qrImageUrl ? (
              <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">二维码登录</p>
                    <p className="mt-1 text-base font-semibold">打开网易云扫码</p>
                    <p className="mt-1 text-sm text-zinc-400">{netease.message}</p>
                    <p className="mt-2 text-xs text-zinc-500">状态：{netease.qrStatus}</p>
                  </div>
                  <Image
                    src={netease.qrImageUrl}
                    alt="网易云二维码登录"
                    width={112}
                    height={112}
                    className="rounded-2xl bg-white p-2"
                    unoptimized
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
              <div className="h-2 w-full rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-zinc-400">
                <span>{formatTime(state.currentTime)}</span>
                <span>{formatTime(state.duration)}</span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {needsLogin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void actions.createQRCode()}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-zinc-50 px-4 text-sm font-semibold text-zinc-950"
                    >
                      {netease.qrStatus === "expired" ? "刷新二维码" : "扫码登录"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void actions.refreshNeteaseStatus()}
                      className="inline-flex h-10 items-center gap-1 rounded-full border border-white/15 px-3 text-[11px] text-zinc-300 hover:bg-white/10"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      重试
                    </button>
                  </>
                ) : canPause ? (
                  <button
                    type="button"
                    onClick={() => void actions.pause()}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-50 text-zinc-950"
                    aria-label="暂停"
                  >
                    <Pause className="h-5 w-5" />
                  </button>
                ) : canResume ? (
                  <button
                    type="button"
                    onClick={() => void actions.resume()}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-zinc-50 px-4 text-sm font-semibold text-zinc-950"
                  >
                    <Play className="h-4 w-4" />
                    继续收听
                  </button>
                ) : (
                  <div className="flex h-11 flex-1 items-center px-1 text-sm text-zinc-400">
                    {needsTapToJoin ? "轻点页面任意位置，直接接入频道。" : session.prepareState === "preparing" ? "正在准备频道" : "频道已在播出"}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void actions.nextTrack()}
                  disabled={!state.playableQueue.length}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-zinc-200 disabled:opacity-40"
                  aria-label="下一首"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-zinc-500" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(state.volume * 100)}
                    onChange={(event) => void actions.setVolume(Number(event.target.value) / 100)}
                    className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-300"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tuneOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => void actions.tuneByPrompt(option.prompt)}
                    disabled={needsLogin || !state.playableQueue.length}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-white/15 px-3 text-[11px] text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <details className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
              <summary className="cursor-pointer select-none text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                今日节目单
              </summary>
              <div className="mt-3 space-y-1">
                {queuePreview.map((track, offset) => {
                  const index = state.currentIndex + offset + 1;
                  return (
                    <button
                      key={`${track.id}-${index}`}
                      type="button"
                      onClick={() => void actions.playTrack(index)}
                      className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <p className="line-clamp-1 text-sm">
                        {index + 1}. {track.title}
                      </p>
                      <p className="line-clamp-1 text-xs text-zinc-500">{track.artist}</p>
                    </button>
                  );
                })}
              </div>
            </details>

            <VoiceSelector />

            {process.env.NODE_ENV === "development" ? (
              <details className="mt-4 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] leading-5 text-zinc-400">
                <summary className="cursor-pointer select-none text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Developer Debug
                </summary>
                <div className="mt-2 space-y-1">
                  <p>debug.currentTrack.title: {debug?.currentTrackTitle ?? "null"}</p>
                  <p>debug.currentTrack.artist: {debug?.currentTrackArtist ?? "null"}</p>
                  <p>debug.currentTrack.audioUrl: {debug?.currentTrackAudioUrl ? debug.currentTrackAudioUrl.slice(0, 96) : "null"}</p>
                  <p>debug.audio.currentSrc: {debug?.audioCurrentSrc ? debug.audioCurrentSrc.slice(0, 96) : "null"}</p>
                  <p>debug.currentIndex: {debug?.currentIndex ?? 0}</p>
                  <p>debug.playableQueue.length: {state.playableQueue.length}</p>
                  <p>debug.isSpeaking: {String(state.isSpeaking)}</p>
                  <p>debug.djAudio.src: {debug?.djCurrentSrc ? debug.djCurrentSrc.slice(0, 96) : "null"}</p>
                  <p>debug.ttsProvider: {debug?.ttsProvider ?? "null"}</p>
                  <p>debug.ttsVoice: {debug?.ttsVoice ?? "null"}</p>
                  <p>debug.ttsRate: {debug?.ttsRate ?? "null"}</p>
                  <p>debug.ttsPitch: {debug?.ttsPitch ?? "null"}</p>
                  <p>debug.radioStatus: {state.status}</p>
                  <p>debug.prepareState: {debug?.prepareState ?? "null"}</p>
                  <p>debug.hasStarted: {String(debug?.hasStarted ?? false)}</p>
                  <p>debug.programTitle: {debug?.programTitle ?? "null"}</p>
                  <p>debug.queueVersion: {debug?.queueVersion ?? 0}</p>
                  <p>debug.queuePatchApplied: {String(debug?.queuePatchApplied ?? false)}</p>
                  <p>debug.queuePatchBefore: {(debug?.queuePatchBeforeIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchAfter: {(debug?.queuePatchAfterIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchBeforeProviderIds: {(debug?.queuePatchBeforeProviderIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchAfterProviderIds: {(debug?.queuePatchAfterProviderIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchBeforeInternalIds: {(debug?.queuePatchBeforeInternalIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchAfterInternalIds: {(debug?.queuePatchAfterInternalIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchResolvedIds: {(debug?.queuePatchResolvedIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchUnresolvedIds: {(debug?.queuePatchUnresolvedIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.queuePatchNoopReason: {debug?.queuePatchNoopReason ?? "null"}</p>
                  <p>debug.skipNowApplied: {String(debug?.skipNowApplied ?? false)}</p>
                  <p>debug.skippedFromTrackId: {debug?.skippedFromTrackId ?? "null"}</p>
                  <p>debug.skippedToTrackId: {debug?.skippedToTrackId ?? "null"}</p>
                  <p>debug.decisionProvider: {debug?.decisionProvider ?? "null"}</p>
                  <p>debug.decisionUsedFallback: {String(debug?.decisionUsedFallback ?? false)}</p>
                  <p>debug.decisionFallbackReason: {debug?.decisionFallbackReason ?? "null"}</p>
                  <p>debug.decisionPromptType: {debug?.decisionPromptType ?? "null"}</p>
                  <p>debug.directorOffline: {String(debug?.directorOffline ?? false)}</p>
                  <p>debug.directorDebugEvidence: {(debug?.directorDebugEvidence ?? []).join(" | ") || "[]"}</p>
                  <p>debug.latestSpeech: {debug?.latestSpeech ?? "null"}</p>
                  <p>debug.latestOpeningSpeech: {debug?.latestOpeningSpeech ?? "null"}</p>
                  <p>debug.latestSpeakAttemptEvent: {debug?.latestSpeakAttemptEvent ?? "null"}</p>
                  <p>debug.latestSpeakAttemptUsedLiveDirector: {String(debug?.latestSpeakAttemptUsedLiveDirector ?? false)}</p>
                  <p>debug.blockedDJLines: {(debug?.blockedDJLines ?? []).map((item: { line: string; reason: string }) => `${item.line} [${item.reason}]`).join(" | ") || "[]"}</p>
                  <p>debug.programPlanProvider: {debug?.programPlanProvider ?? "null"}</p>
                  <p>debug.programPlanUsedFallback: {String(debug?.programPlanUsedFallback ?? false)}</p>
                  <p>debug.programPlanError: {debug?.programPlanError ?? "null"}</p>
                  <p>debug.programPlanQueueChanged: {String(debug?.programPlanQueueChanged ?? false)}</p>
                  <p>debug.programPlanQueueBeforeProviderIds: {(debug?.programPlanQueueBeforeProviderIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.programPlanQueueAfterProviderIds: {(debug?.programPlanQueueAfterProviderIds ?? []).join(", ") || "[]"}</p>
                  <p>debug.djBrainFallbackActive: {String(debug?.djBrainFallbackActive ?? false)}</p>
                  <p className="pt-2 font-semibold text-zinc-300">DJ Host Debug</p>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(debug?.djHostDebug ?? null, null, 2)}</pre>
                  <p className="pt-2 font-semibold text-zinc-300">DJ Speak Pipeline</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["测试 DJ 开场", "opening"],
                      ["测试 Track Intro", "track_intro"],
                      ["测试 Bridge", "bridge"],
                      ["测试 Safe Fallback", "manual_test"],
                      ["测试 TTS", "manual_test"],
                    ].map(([label, event]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void actions.testDJSpeakPipeline(event as "opening" | "track_intro" | "bridge" | "user_tune" | "outro" | "manual_test")}
                        className="rounded-md border border-white/15 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(debug?.djSpeakAttempts ?? [], null, 2)}</pre>
                  <p className="pt-2 font-semibold text-zinc-300">DJ Brain</p>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{debug?.programPlanRawPrompt ?? "null"}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{debug?.programPlanRawResponse ?? "null"}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{debug?.decisionRawPrompt ?? "null"}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{debug?.decisionRawResponse ?? "null"}</pre>
                  <p className="pt-2 font-semibold text-zinc-300">DJ Script</p>
                  <p>script.usedFacts: {(debug?.currentScriptDebug?.usedFacts ?? []).join(" | ") || "[]"}</p>
                  <p>script.usedAngles: {(debug?.currentScriptDebug?.usedAngles ?? []).join(", ") || "[]"}</p>
                  <p>script.quality.pass: {String(debug?.currentScriptDebug?.quality?.pass ?? false)}</p>
                  <p>script.quality.reason: {debug?.currentScriptDebug?.quality?.reason ?? "null"}</p>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(debug?.currentScriptDebug?.songBrief ?? null, null, 2)}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(debug?.currentProgram ?? null, null, 2)}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(debug?.currentDecision ?? null, null, 2)}</pre>
                  <p className="pt-2 font-semibold text-zinc-300">Startup</p>
                  <p>startup.startedFrom: {debug?.startup?.startedFrom ?? "unknown"}</p>
                  <p>startup.playCalledBeforeRoutePush: {String(debug?.startup?.playCalledBeforeRoutePush ?? false)}</p>
                  <p>startup.playCallTimestamp: {debug?.startup?.playCallTimestamp ?? "null"}</p>
                  <p>startup.routePushTimestamp: {debug?.startup?.routePushTimestamp ?? "null"}</p>
                  <p>startup.hasStarted: {String(debug?.hasStarted ?? false)}</p>
                  <p>startup.musicAudio.paused: {String(debug?.startup?.musicAudioPaused ?? true)}</p>
                  <p>startup.musicAudio.currentSrc: {debug?.audioCurrentSrc ? debug.audioCurrentSrc.slice(0, 96) : "null"}</p>
                  <p>startup.firstPlayError: {debug?.startup?.firstPlayError ?? "null"}</p>
                  <p>startup.providerMountedAtRoot: {String(debug?.startup?.providerMountedAtRoot ?? false)}</p>
                </div>
              </details>
            ) : null}
          </main>
        </section>

        <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
          <span>{PRODUCT_NAME}</span>
        </div>
      </div>
    </div>
  );
}


