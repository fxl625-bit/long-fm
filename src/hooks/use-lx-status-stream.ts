"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { LXPlayerStatus } from "@/lib/types/music";
import { getLXConnectionMessage, resolveLXConnectionState, type LXConnectionState, LXMusicProvider } from "@/lib/providers/music/lx-music-provider";

type LXStatusStreamState = {
  status: LXPlayerStatus | null;
  connected: boolean;
  sseConnected: boolean;
  connectionState: LXConnectionState;
  message: string;
  error?: string;
};

type UseLXStatusStreamOptions = {
  apiBaseUrl?: string;
  enabled?: boolean;
  useSSE?: boolean;
};

export function useLXStatusStream(options: UseLXStatusStreamOptions = {}) {
  const { apiBaseUrl = "http://127.0.0.1:23330", enabled = true, useSSE = true } = options;
  const [state, setState] = useState<LXStatusStreamState>({
    status: null,
    connected: false,
    sseConnected: false,
    connectionState: "unknown",
    message: "正在检查 LX Music 连接状态。",
  });
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setState({
          status: null,
          connected: false,
          sseConnected: false,
          connectionState: "api_unreachable",
          message: "LX Music provider is disabled.",
          error: "LX Music provider is disabled.",
        });
      });
      return;
    }

    const provider = new LXMusicProvider({ apiBaseUrl, enabled, useSSE });
    let cancelled = false;
    let subscription: { close: () => void } | null = null;

    const clearTimers = () => {
      if (pollingTimer.current) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const applyStatus = (status: LXPlayerStatus, sseConnected: boolean) => {
      if (cancelled) return;
      const connectionState = resolveLXConnectionState(status);
      startTransition(() => {
        setState({
          status,
          connected: connectionState !== "api_unreachable",
          sseConnected,
          connectionState,
          message: getLXConnectionMessage(connectionState, status),
          error: connectionState === "error" ? getLXConnectionMessage(connectionState, status) : undefined,
        });
      });
    };

    const applyFailure = (message: string) => {
      if (cancelled) return;
      startTransition(() => {
        setState({
          status: null,
          connected: false,
          sseConnected: false,
          connectionState: "api_unreachable",
          message,
          error: message,
        });
      });
    };

    const pollStatus = async () => {
      try {
        const response = await fetch("/api/lx/status", { cache: "no-store" });
        const payload = (await response.json()) as { ok: boolean; status?: LXPlayerStatus; message?: string };
        if (!payload.ok || !payload.status) {
          throw new Error(payload.message ?? "LX Music status is unavailable.");
        }
        applyStatus(payload.status, false);
      } catch (error) {
        applyFailure(error instanceof Error ? error.message : "LX Music status polling failed.");
      }
    };

    refreshRef.current = pollStatus;

    const startPolling = () => {
      if (pollingTimer.current) return;
      void pollStatus();
      pollingTimer.current = setInterval(() => {
        void pollStatus();
      }, 2_000);
    };

    const startSSE = () => {
      try {
        subscription = provider.subscribeStatus(
          (nextStatus) => {
            applyStatus(nextStatus, true);
          },
          () => {
            if (cancelled) return;
            startTransition(() => {
              setState((prev) => ({
                ...prev,
                sseConnected: false,
                message: prev.connected ? prev.message : "LX Music SSE disconnected, falling back to polling.",
                error: prev.connected ? prev.error : "LX Music SSE disconnected, falling back to polling.",
              }));
            });
            startPolling();
            reconnectTimer.current = setTimeout(() => {
              if (cancelled) return;
              clearTimers();
              startSSE();
            }, 4_000);
          },
        );
      } catch {
        startPolling();
      }
    };

    void pollStatus();
    if (useSSE && typeof EventSource !== "undefined") {
      startSSE();
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      subscription?.close();
      clearTimers();
    };
  }, [apiBaseUrl, enabled, useSSE]);

  const refresh = useCallback(async () => {
    await refreshRef.current();
  }, []);

  return {
    ...state,
    refresh,
  };
}
