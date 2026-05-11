"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Radio, RefreshCw } from "lucide-react";
import { useRadioRuntime } from "@/hooks/use-radio-runtime";
import { CompactTopNav } from "@/components/layout/top-nav";
import { PRODUCT_NAME } from "@/lib/constants/product";

function statusCopy(input: {
  authenticated: boolean;
  prepareState: "idle" | "preparing" | "ready" | "error";
  hasStarted: boolean;
}) {
  if (!input.authenticated) return "网易云未登录";
  if (input.hasStarted) return "频道正在播出";
  if (input.prepareState === "ready") return "已准备好";
  if (input.prepareState === "preparing") return "正在准备频道";
  if (input.prepareState === "error") return "频道准备失败";
  return "正在连接频道";
}

export function RadioHomeEntryClient() {
  const router = useRouter();
  const { runtime, state, session, netease, actions } = useRadioRuntime();
  const [starting, setStarting] = useState(false);
  const preparedRef = useRef(false);

  useEffect(() => {
    if (preparedRef.current) {
      return;
    }
    preparedRef.current = true;
    void runtime.prepareSession();
  }, [runtime]);

  const statusText = statusCopy({
    authenticated: netease.authenticated,
    prepareState: session.prepareState,
    hasStarted: session.hasStarted,
  });

  const helperText = useMemo(() => {
    if (!netease.authenticated) {
      return "先连上你的网易云账号，我就能把喜欢的歌单整理成一个已经准备好的频道。";
    }
    if (session.hasStarted) {
      return "你的频道已经在播了，回到电台页时，音乐和 DJ 会直接接上。";
    }
    if (session.prepareState === "ready") {
      return "点进去，DJ 会直接接上你的网易云歌单。";
    }
    if (session.prepareState === "preparing") {
      return "我正在后台准备真实可播队列。准备好之后，你点一下就能直接开播。";
    }
    if (session.prepareState === "error") {
      return state.error ?? netease.message;
    }
    return netease.message;
  }, [netease.authenticated, netease.message, session.hasStarted, session.prepareState, state.error]);

  const handleEnter = async () => {
    if (!netease.authenticated) {
      if (!netease.qrImageUrl) {
        await actions.createQRCode();
      }
      return;
    }

    if (session.hasStarted) {
      router.push("/radio");
      return;
    }

    if (session.prepareState === "preparing") {
      return;
    }

    if (session.prepareState === "error") {
      await actions.prepareSession();
      return;
    }

    if (session.prepareState !== "ready") {
      return;
    }

    setStarting(true);
    try {
      const started = await actions.startSessionFromUserGesture("home_entry_click");
      if (started) {
        actions.markRoutePush();
        router.push("/radio");
      }
    } finally {
      setStarting(false);
    }
  };

  const currentTrack = state.currentTrack;
  const buttonBusy = starting || session.isStarting;
  const buttonLabel = !netease.authenticated
    ? netease.qrImageUrl
      ? "打开网易云扫码登录"
      : "先登录网易云"
    : session.hasStarted
      ? "回到我的频道"
      : session.prepareState === "ready"
        ? "进入我的频道"
        : session.prepareState === "preparing"
          ? "正在准备频道"
          : "重新准备频道";

  return (
    <div className="min-h-screen bg-[#f3f0e8] px-4 py-8 text-zinc-950 md:py-12">
      <div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
        <CompactTopNav />

        <section className="overflow-hidden rounded-[32px] border border-zinc-950/10 bg-[#101113] text-zinc-50 shadow-[0_30px_80px_rgba(20,20,20,0.24)]">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">My AI Radio</p>
              <p className="mt-1 text-lg font-semibold">我的 AI 电台</p>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
              {statusText}
            </div>
          </header>

          <div className="px-5 pb-5 pt-6">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_25%,#f8fafc,transparent_16%),linear-gradient(145deg,#2dd4bf,#155e75_45%,#0f172a)] shadow-[0_18px_45px_rgba(45,212,191,0.18)]">
              <Radio className="h-10 w-10 text-white" />
            </div>

            <div className="mt-5 text-center">
              <p className="text-[11px] uppercase tracking-[0.26em] text-emerald-200">Claudio Style Entry</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">点进去，就直接开播</h1>
              <p className="mx-auto mt-2 max-w-[330px] text-sm leading-6 text-zinc-400">{helperText}</p>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">当前准备状态</p>
              <p className="mt-2 text-base font-semibold">{session.programTitle ?? "我的频道"}</p>
              <p className="mt-1 text-sm text-zinc-400">
                {currentTrack ? `${currentTrack.title} - ${currentTrack.artist}` : netease.message}
              </p>
              {currentTrack?.coverUrl ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={52} height={52} className="h-[52px] w-[52px] rounded-2xl object-cover" unoptimized />
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-white">{currentTrack.title}</p>
                    <p className="line-clamp-1 text-xs text-zinc-400">{currentTrack.artist}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {netease.loginState !== "logged_in" && netease.qrImageUrl ? (
              <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">扫码登录</p>
                    <p className="mt-1 text-base font-semibold">打开网易云扫一扫</p>
                    <p className="mt-1 text-sm text-zinc-400">{netease.message}</p>
                    <p className="mt-2 text-xs text-zinc-500">状态：{netease.qrStatus}</p>
                  </div>
                  <Image src={netease.qrImageUrl} alt="网易云二维码登录" width={112} height={112} className="rounded-2xl bg-white p-2" unoptimized />
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onPointerDown={() => actions.primeAudio()}
                onClick={() => void handleEnter()}
                disabled={buttonBusy || (netease.authenticated && !session.hasStarted && session.prepareState !== "ready" && session.prepareState !== "error")}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-55"
              >
                {buttonBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {buttonLabel}
              </button>

              <button
                type="button"
                onClick={() => void actions.refreshNeteaseStatus()}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[12px] text-zinc-300 hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </button>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
          <span>{PRODUCT_NAME}</span>
        </div>
      </div>
    </div>
  );
}

