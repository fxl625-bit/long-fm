"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { LXPlayerStatus } from "@/lib/types/music";
import type { Track } from "@/lib/radio/radio-types";
import type { TTSProviderId } from "@/lib/tts/tts-provider";
import { getLXTrackKey, isNearTrackEnd, shouldSpeakBridge } from "@/lib/dj/dj-scheduler";
import { resolveLXConnectionState, type LXConnectionState, LXMusicProvider } from "@/lib/providers/music/lx-music-provider";
import { useLXStatusStream } from "./use-lx-status-stream";

type TTSMode = TTSProviderId;
type LxRadioStatus = "tuning" | "need_lx" | "on_air" | "playing" | "paused" | "speaking" | "error";

type LxPlayerControllerState = {
  status: LxRadioStatus;
  lxConnected: boolean;
  sseConnected: boolean;
  lxStatus: LXPlayerStatus | null;
  connectionState: LXConnectionState;
  connectionMessage: string;
  currentSubtitle: string;
  subtitleHistory: string[];
  isSpeaking: boolean;
  ttsMode: TTSMode;
  ttsVoice?: string;
  duckedVolume?: { before?: number; after?: number };
  lastDJLine?: string;
  error?: string;
};

type SearchSeed = { name: string; singer: string };

const DEFAULT_CHANNEL_SEEDS: SearchSeed[] = [
  { name: "晴天", singer: "周杰伦" },
  { name: "稻香", singer: "周杰伦" },
  { name: "红豆", singer: "王菲" },
  { name: "Let It Be", singer: "The Beatles" },
  { name: "Hotel California", singer: "Eagles" },
];

function splitSentences(text: string) {
  return text.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readTTSMode(): TTSMode {
  if (typeof window === "undefined") return "edge_tts";
  const stored = window.localStorage.getItem("tts_mode");
  if (stored === "edge_tts" || stored === "kokoro" || stored === "piper" || stored === "openai" || stored === "subtitle_only") {
    return stored;
  }
  return "edge_tts";
}

function readTTSVoice(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem("tts_voice");
  return stored?.trim() ? stored.trim() : undefined;
}

function toTrack(status?: LXPlayerStatus | null): Track | null {
  if (!status?.title.trim()) return null;
  return {
    id: getLXTrackKey(status) || "lx-track",
    title: status.title,
    artist: status.artist,
    album: status.album,
    coverUrl: status.coverUrl,
    durationMs: status.duration,
    sourceType: "external",
    playableStatus: "external_only",
  };
}

function getRestingStatus(connectionState: LXConnectionState, isSpeaking: boolean): LxRadioStatus {
  if (isSpeaking) return "speaking";
  if (connectionState === "playing") return "playing";
  if (connectionState === "paused") return "paused";
  if (connectionState === "api_unreachable") return "need_lx";
  if (connectionState === "error") return "error";
  if (connectionState === "api_reachable_no_song") return "on_air";
  return "tuning";
}

function openingLineForState(connectionState: LXConnectionState, status?: LXPlayerStatus | null) {
  switch (connectionState) {
    case "api_unreachable":
      return "我还没连上 LX Music。先把客户端打开，再让我接管这个频道。";
    case "api_reachable_no_song":
      return "LX 已经连上了，但频道里还没有歌。我可以先帮你找一首开场。";
    case "paused":
      return status?.title ? `频道先停在《${status.title}》。你点一下，我就从这里接上。` : "LX 已连接，频道现在是暂停的。";
    case "playing":
      return status?.title ? `频道已经开了。现在接上的是《${status.title}》，我先顺着这首的气氛播下去。` : "频道已经开了，我先接住现在这首歌。";
    case "error":
      return "LX Music 返回了异常状态。我先守住频道，你重试一下连接。";
    default:
      return "我正在检查 LX Music。连上后，我会把这里变成你的私人频道。";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  return (await response.json()) as T;
}

export function useLXPlayer() {
  const [provider] = useState(() => new LXMusicProvider());
  const stream = useLXStatusStream({
    apiBaseUrl: provider.apiBaseUrl,
    enabled: provider.enabled,
    useSSE: provider.useSSE,
  });
  const [state, setState] = useState<LxPlayerControllerState>({
    status: "tuning",
    lxConnected: false,
    sseConnected: false,
    lxStatus: null,
    connectionState: "unknown",
    connectionMessage: "正在检查 LX Music 连接状态。",
    currentSubtitle: "我正在检查 LX Music。连上后，我会把这里变成你的私人频道。",
    subtitleHistory: [],
    isSpeaking: false,
    ttsMode: readTTSMode(),
    ttsVoice: readTTSVoice(),
  });
  const openingSpokenRef = useRef(false);
  const lastTrackKeyRef = useRef("");
  const nearEndTrackKeyRef = useRef("");
  const playedTrackCountRef = useRef(0);
  const speakLockRef = useRef(false);
  const defaultSeedIndexRef = useRef(0);
  const streamRef = useRef({
    connected: stream.connected,
    status: stream.status,
    connectionState: stream.connectionState,
  });
  const ttsModeRef = useRef<TTSMode>(state.ttsMode);
  const ttsVoiceRef = useRef<string | undefined>(state.ttsVoice);

  useEffect(() => {
    streamRef.current = {
      connected: stream.connected,
      status: stream.status,
      connectionState: stream.connectionState,
    };
  }, [stream.connected, stream.status, stream.connectionState]);

  useEffect(() => {
    ttsModeRef.current = state.ttsMode;
  }, [state.ttsMode]);

  useEffect(() => {
    ttsVoiceRef.current = state.ttsVoice;
  }, [state.ttsVoice]);

  const speakLine = useCallback(async (mode: "opening" | "bridge" | "decision" | "outro", overrideLine?: string) => {
    if (speakLockRef.current) return;
    const currentTrack = toTrack(streamRef.current.status);
    if (!currentTrack && mode !== "decision" && mode !== "opening") return;

    speakLockRef.current = true;
    startTransition(() => {
      setState((prev) => ({
        ...prev,
        status: "speaking",
        isSpeaking: true,
        subtitleHistory: prev.currentSubtitle ? [prev.currentSubtitle, ...prev.subtitleHistory].slice(0, 5) : prev.subtitleHistory,
      }));
    });

    try {
      const payload = overrideLine
        ? { ok: true, subtitle: overrideLine }
        : await fetchJson<{ ok: boolean; subtitle?: string }>("/api/dj/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, currentTrack }),
          });

      const subtitle = payload.subtitle?.trim() || openingLineForState(streamRef.current.connectionState, streamRef.current.status);
      startTransition(() => {
        setState((prev) => ({
          ...prev,
          currentSubtitle: subtitle,
          lastDJLine: subtitle,
        }));
      });

      const shouldDuck = streamRef.current.connectionState === "playing";
      const originalVolume = streamRef.current.status?.volume ?? 65;
      if (shouldDuck) {
        await fetchJson("/api/lx/volume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume: 40 }),
        }).catch(() => undefined);

        startTransition(() => {
          setState((prev) => ({
            ...prev,
            duckedVolume: { before: originalVolume, after: 40 },
          }));
        });
      }

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: subtitle,
          provider: ttsModeRef.current,
          voice: ttsVoiceRef.current,
          style: "dj",
        }),
      }).catch(() => null);

      const ttsPayload = response?.ok
        ? ((await response.json()) as { mode?: "audio" | "subtitle_only"; audioUrl?: string })
        : null;

      if (ttsPayload?.mode === "audio" && ttsPayload.audioUrl) {
        await new Promise<void>((resolve) => {
          const audio = new Audio(ttsPayload.audioUrl!);
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
      } else {
        for (const sentence of splitSentences(subtitle)) {
          startTransition(() => {
            setState((prev) => ({ ...prev, currentSubtitle: sentence }));
          });
          await sleep(Math.min(3_000, Math.max(1_800, sentence.length * 95)));
          await sleep(320);
        }
      }

      if (shouldDuck) {
        await fetchJson("/api/lx/volume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume: originalVolume }),
        }).catch(() => undefined);
      }
    } finally {
      speakLockRef.current = false;
      const latestStream = streamRef.current;
      startTransition(() => {
        setState((prev) => ({
          ...prev,
          isSpeaking: false,
          status: getRestingStatus(latestStream.connectionState, false),
        }));
      });
    }
  }, []);

  const retryConnection = useCallback(async () => {
    await stream.refresh();
  }, [stream]);

  const playDefaultChannel = useCallback(async () => {
    const seed = DEFAULT_CHANNEL_SEEDS[defaultSeedIndexRef.current % DEFAULT_CHANNEL_SEEDS.length];
    defaultSeedIndexRef.current += 1;
    await speakLine("decision", "LX 已经连上了，但现在还没有歌。我先帮你找一首开场。");
    provider.searchPlay(seed.name, seed.singer);
    window.setTimeout(() => {
      void stream.refresh();
    }, 2000);
  }, [provider, speakLine, stream]);

  const openLXMusic = useCallback(async () => {
    provider.playerPlay();
    window.setTimeout(() => {
      void stream.refresh();
    }, 2000);
  }, [provider, stream]);

  useEffect(() => {
    startTransition(() => {
      setState((prev) => ({
        ...prev,
        lxConnected: stream.connectionState !== "api_unreachable" && stream.connectionState !== "unknown",
        sseConnected: stream.sseConnected,
        lxStatus: stream.status,
        connectionState: stream.connectionState,
        connectionMessage: stream.message,
        status: getRestingStatus(stream.connectionState, prev.isSpeaking),
        error: stream.error,
      }));
    });
  }, [stream.connectionState, stream.error, stream.message, stream.sseConnected, stream.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (openingSpokenRef.current) return;
      openingSpokenRef.current = true;
      void speakLine("opening", openingLineForState(streamRef.current.connectionState, streamRef.current.status));
    }, 800);

    return () => window.clearTimeout(timer);
  }, [speakLine]);

  useEffect(() => {
    const trackKey = getLXTrackKey(stream.status);
    const previousTrackKey = lastTrackKeyRef.current;

    if (trackKey && trackKey !== previousTrackKey) {
      if (previousTrackKey) {
        playedTrackCountRef.current += 1;
      }
      lastTrackKeyRef.current = trackKey;
      nearEndTrackKeyRef.current = "";

      if (!previousTrackKey) {
        void speakLine("decision", `现在接上的是《${stream.status?.title ?? "这首歌"}》。我先顺着这个气氛播下去。`);
      } else if (shouldSpeakBridge(playedTrackCountRef.current)) {
        void speakLine("bridge", "这首换了个颜色。接下来我会让节奏慢慢往前走。");
      }
    }

    if (trackKey && isNearTrackEnd(stream.status) && nearEndTrackKeyRef.current !== trackKey) {
      nearEndTrackKeyRef.current = trackKey;
      void speakLine("outro", "这一首快到尾声了。下一首，我会把空气再往前推一点。");
    }

    if (!trackKey && stream.connectionState === "api_reachable_no_song") {
      lastTrackKeyRef.current = "";
      nearEndTrackKeyRef.current = "";
    }
  }, [speakLine, stream.connectionState, stream.status]);

  return {
    state,
    actions: {
      enterChannel: async () => {
        const connectionState = resolveLXConnectionState(stream.status, stream.connectionState === "api_unreachable");

        if (connectionState === "api_unreachable") {
          await speakLine("decision", "我还没连上 LX Music。先把客户端打开，再让我接管这个频道。");
          await openLXMusic();
          return;
        }

        if (connectionState === "api_reachable_no_song") {
          await playDefaultChannel();
          return;
        }

        if (connectionState === "paused") {
          await fetchJson("/api/lx/play", { method: "POST" }).catch(() => undefined);
          await speakLine("decision", "继续，我们从这首接上。");
          return;
        }

        if (connectionState === "playing") {
          if (!openingSpokenRef.current) {
            openingSpokenRef.current = true;
            await speakLine("opening", openingLineForState(connectionState, stream.status));
          }
          return;
        }

        await retryConnection();
      },
      pause: async () => {
        await fetchJson("/api/lx/pause", { method: "POST" }).catch(() => undefined);
      },
      resume: async () => {
        await fetchJson("/api/lx/play", { method: "POST" }).catch(() => undefined);
        await speakLine("decision", "继续，我们从这首接上。");
      },
      nextTrack: async () => {
        await fetchJson("/api/lx/next", { method: "POST" }).catch(() => undefined);
      },
      previousTrack: async () => {
        await fetchJson("/api/lx/prev", { method: "POST" }).catch(() => undefined);
      },
      setVolume: async (volume: number) => {
        await fetchJson("/api/lx/volume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume: Math.round(volume * 100) }),
        }).catch(() => undefined);
      },
      searchPlay: (title: string, artist?: string) => {
        provider.searchPlay(title, artist);
        window.setTimeout(() => {
          void stream.refresh();
        }, 2000);
      },
      playDefaultChannel,
      openLXMusic,
      retryConnection,
      tuneByPrompt: async (prompt: string) => {
        const text = prompt.trim();
        if (!text) return;
        await speakLine("decision", "我先去 LX Music 找一首更贴近现在这段声音的歌。");
        provider.searchPlay(text);
        window.setTimeout(() => {
          void stream.refresh();
        }, 2000);
      },
      refreshProgram: async () => {
        if (stream.connectionState === "api_reachable_no_song") {
          await playDefaultChannel();
          return;
        }
        await speakLine("decision", "这一段我先给你换一点空气，我们往下走。");
        await fetchJson("/api/lx/next", { method: "POST" }).catch(() => undefined);
      },
      setTTSMode: (mode: TTSMode) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("tts_mode", mode);
        }
        setState((prev) => ({ ...prev, ttsMode: mode }));
      },
      setTTSVoice: (voice?: string) => {
        if (typeof window !== "undefined") {
          if (voice?.trim()) {
            window.localStorage.setItem("tts_voice", voice.trim());
          } else {
            window.localStorage.removeItem("tts_voice");
          }
        }
        setState((prev) => ({ ...prev, ttsVoice: voice?.trim() || undefined }));
      },
    },
  };
}
