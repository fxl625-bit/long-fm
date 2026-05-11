"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { AudioDucking } from "@/lib/audio/audio-ducking";
import { nextTrack, normalizeSessionQueue, playTrack, syncAudioSource, toPlaybackState } from "@/lib/audio/radio-playback-state";
import { buildEpisodeTimeline } from "@/lib/engines/episode-timeline";
import { PRODUCT_NAME } from "@/lib/constants/product";
import { FutureTTSProvider } from "@/lib/providers/tts/future-tts-provider";
import type { TTSMode } from "@/lib/providers/tts/tts-provider";
import { WebSpeechTTSProvider } from "@/lib/providers/tts/web-speech-tts-provider";
import type { PlaybackQueueItem, PlaybackSessionState, ProgramTweak, TodayDJPayload } from "@/lib/types/music";
import { isValidExternalUrl } from "@/lib/utils/external-links";

type ProgramItem = {
  id: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
};

type Props = {
  initialToday: TodayDJPayload;
  recentPrograms: ProgramItem[];
};

type SessionPhase = "loading" | "tuning" | "on_air";
type DJStatus = "idle" | "opening" | "speaking" | "playing";

type CaptionLine = {
  id: string;
  text: string;
  keywords: string[];
  timeLabel: string;
};

const DEFAULT_TTS_MODE: TTSMode = "subtitle_only";
const CHANNEL_NAME = PRODUCT_NAME;
const SESSION_MODE = "私人 DJ / 今日流";

const TUNE_ACTIONS: Array<{ key: ProgramTweak; label: string }> = [
  { key: "more_rhythm", label: "更轻快" },
  { key: "more_nostalgic", label: "更怀旧" },
  { key: "less_sad", label: "少一点悲伤" },
  { key: "more_female_vocal", label: "更多女声" },
];

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildSessionFromPayload(payload: TodayDJPayload): PlaybackSessionState {
  const session: PlaybackSessionState = {
    currentTrackId: payload.currentTrack?.id,
    queue: payload.queue ?? [],
    currentIndex: payload.currentIndex ?? 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.82,
    source: payload.currentTrack?.sourceType ?? payload.queue[0]?.track.sourceType ?? "DEMO",
  };
  return normalizeSessionQueue(session);
}

function inferTweak(prompt: string): ProgramTweak {
  const text = prompt.trim();
  if (!text) return "more_rhythm";
  if (/(鎬€鏃鍥炲繂|old|retro)/i.test(text)) return "more_nostalgic";
  if (/(鎮蹭激|涓emo|闅捐繃)/i.test(text)) return "less_sad";
  if (/(濂冲０|female|濂崇敓)/i.test(text)) return "more_female_vocal";
  if (/(涓枃|鍥借|鍗庤|chinese)/i.test(text)) return "more_chinese";
  if (/(宸ヤ綔|涓撴敞|focus)/i.test(text)) return "fit_work";
  if (/(寮€杞drive|椹鹃┒)/i.test(text)) return "fit_drive";
  if (/(鍩庡競|city|澶滆壊)/i.test(text)) return "more_city_night";
  return "more_rhythm";
}

function getClockLabel(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function providerLabel(sourceType?: string) {
  if (!sourceType) return "Music Source";
  if (sourceType.includes("NETEASE")) return "NetEase";
  if (sourceType === "LOCAL") return "Local Source";
  if (sourceType === "DEMO") return "Demo Source";
  return "Music Source";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matched = normalized.match(/[^銆傦紒锛??]+[銆傦紒锛??]?/g);
  if (!matched?.length) {
    return [normalized];
  }

  return matched.map((item) => item.trim()).filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveInitialTTSMode(): TTSMode {
  if (typeof window === "undefined") {
    return DEFAULT_TTS_MODE;
  }

  const stored = window.localStorage.getItem("flowmate_tts_mode");
  if (stored === "subtitle_only" || stored === "browser_tts" || stored === "future_tts") {
    return stored;
  }
  return DEFAULT_TTS_MODE;
}

function HighlightedCaption({ text, keywords }: { text: string; keywords: string[] }) {
  const slices = useMemo(() => {
    const uniq = Array.from(new Set(keywords.map((item) => item.trim()).filter(Boolean))).slice(0, 4);
    if (!text || !uniq.length) {
      return [text];
    }

    const regex = new RegExp(`(${uniq.map((item) => escapeRegex(item)).join("|")})`, "gi");
    return text.split(regex);
  }, [keywords, text]);

  const loweredKeywords = useMemo(() => keywords.map((item) => item.toLowerCase()), [keywords]);

  return (
    <>
      {slices.map((part, index) => {
        const isHighlight = loweredKeywords.includes(part.toLowerCase());
        if (!isHighlight) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <span key={`${part}-${index}`} className="font-semibold text-emerald-700">
            {part}
          </span>
        );
      })}
    </>
  );
}

export function DJHomeClient({ initialToday, recentPrograms }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressPersistRef = useRef(0);
  const prevTrackRef = useRef<string | null>(null);
  const openingDoneRef = useRef(false);
  const speakingLockRef = useRef(false);
  const spokenTimelineRef = useRef<Set<string>>(new Set());
  const playIntentRef = useRef<"auto" | "user">("auto");
  const ttsModeRef = useRef<TTSMode>(DEFAULT_TTS_MODE);
  const duckingRef = useRef<AudioDucking | null>(null);
  const browserTtsRef = useRef(new WebSpeechTTSProvider());
  const futureTtsRef = useRef(new FutureTTSProvider());

  const [today, setToday] = useState<TodayDJPayload>(initialToday);
  const [session, setSession] = useState<PlaybackSessionState>(() => buildSessionFromPayload(initialToday));
  const [durationMs, setDurationMs] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [replaceCount, setReplaceCount] = useState(0);
  const [requestHint, setRequestHint] = useState("");
  const [clockLabel, setClockLabel] = useState(() => getClockLabel(new Date()));
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [phaseText, setPhaseText] = useState("姝ｅ湪鍔犺浇浣犵殑棰戦亾...");
  const [needsEnterChannel, setNeedsEnterChannel] = useState(false);
  const [djStatus, setDjStatus] = useState<DJStatus>("idle");
  const [ttsMode, setTtsMode] = useState<TTSMode>(() => resolveInitialTTSMode());
  const [activeCaption, setActiveCaption] = useState<CaptionLine>({
    id: "init",
    text: "正在连接你的电台频道。",
    keywords: [],
    timeLabel: "00:00",
  });
  const [captionHistory, setCaptionHistory] = useState<CaptionLine[]>([]);
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const currentItem = session.queue[session.currentIndex];
  const hasDirectAudio = Boolean(currentItem?.track.audioUrl);
  const validExternalUrl = isValidExternalUrl(currentItem?.track.externalUrl) ? currentItem?.track.externalUrl : undefined;

  const timeline = useMemo(() => buildEpisodeTimeline(session.queue, 2), [session.queue]);
  const bridgeIndices = useMemo(
    () =>
      new Set(
        timeline
          .filter((item) => item.type === "dj_bridge")
          .map((item) => (item.type === "dj_bridge" ? item.beforeTrackIndex : -1)),
      ),
    [timeline],
  );

  const persistSession = useCallback(async (nextState?: PlaybackSessionState) => {
    const payload = nextState ?? sessionRef.current;
    await fetch("/api/playback/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }, []);

  const schedulePersist = useCallback(
    (nextState?: PlaybackSessionState) => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        void persistSession(nextState);
      }, 420);
    },
    [persistSession],
  );

  const applyPayload = useCallback(
    (payload: TodayDJPayload, options?: { autoplay?: boolean; replacedCount?: number }) => {
      const nextSession = buildSessionFromPayload(payload);
      if (options?.autoplay) {
        nextSession.isPlaying = true;
      }
      const normalizedSession = normalizeSessionQueue(nextSession);

      setToday({
        ...payload,
        queue: normalizedSession.queue,
        currentTrack: normalizedSession.queue[normalizedSession.currentIndex]?.track ?? null,
        currentIndex: normalizedSession.currentIndex,
      });
      setReplaceCount(options?.replacedCount ?? 0);

      prevTrackRef.current = normalizedSession.currentTrackId ?? null;
      openingDoneRef.current = false;
      spokenTimelineRef.current = new Set();
      setSession(normalizedSession);
      setActiveCaption({
        id: `payload-${Date.now()}`,
        text: payload.djLine || "频道已连接，准备播出。",
        keywords: [],
        timeLabel: formatTime(0),
      });
      schedulePersist(normalizedSession);
    },
    [schedulePersist],
  );

  const revealSubtitleBySentence = useCallback(async (text: string, lineTime: string, keywords: string[]) => {
    const sentences = splitIntoSentences(text).slice(0, 4);
    const chunks = sentences.length ? sentences : [text.trim()];
    const startedAt = Date.now();

    for (let index = 0; index < chunks.length; index += 1) {
      const sentence = chunks[index];
      setActiveCaption({
        id: `${Date.now()}-${index}`,
        text: sentence,
        keywords,
        timeLabel: lineTime,
      });

      const holdMs = Math.min(3000, Math.max(1800, sentence.length * 95));
      await sleep(holdMs);

      if (index < chunks.length - 1) {
        const pauseMs = 300 + ((index + chunks.length) % 4) * 100;
        await sleep(pauseMs);
      }
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 8000) {
      await sleep(Math.min(2500, 8000 - elapsed));
    }
  }, []);

  const speakWithMode = useCallback(async (text: string) => {
    const mode = ttsModeRef.current;
    if (mode === "subtitle_only") {
      return false;
    }

    if (mode === "browser_tts") {
      if (!browserTtsRef.current.isAvailable()) {
        return false;
      }

      return browserTtsRef.current.speak(text, {
        rate: 0.92,
        pitch: 0.98,
        volume: 0.8,
        lang: "zh-CN",
      });
    }

    return futureTtsRef.current.speak(text, { rate: 0.92, pitch: 0.98, volume: 0.8, lang: "zh-CN" });
  }, []);

  const runNarration = useCallback(
    async (mode: "opening" | "transition" | "manual", timelineId?: string) => {
      if (speakingLockRef.current) {
        return;
      }

      const state = sessionRef.current;
      const active = state.queue[state.currentIndex];
      if (!active) {
        return;
      }

      speakingLockRef.current = true;
      setDjStatus(mode === "opening" ? "opening" : "speaking");

      const previous = activeCaption;
      if (previous.text.trim()) {
        setCaptionHistory((prev) => [previous, ...prev].slice(0, 4));
      }

      const lineTime = formatTime(state.currentTime);
      if (state.isPlaying) {
        duckingRef.current?.duckMusic({ targetRatio: 0.4, durationMs: 180 });
      }

      const response = await fetch("/api/dj/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          currentTrack: active.track,
          nextTrack: state.queue[state.currentIndex + 1]?.track ?? null,
          queueReason: active.reason,
          historyCount: captionHistory.length,
        }),
      })
        .then((res) => res.json())
        .catch(() => null);

      const fallbackText =
        mode === "manual"
          ? "收到，我会把这一段频道感再调得更贴近你一点。"
          : "我先帮你从熟悉的节奏开始。今天这组不会太重，会慢慢把情绪带起来。";

      const lineText = typeof response?.text === "string" && response.text.trim() ? response.text.trim() : fallbackText;
      const keywords = Array.isArray(response?.keywords) ? response.keywords.map(String).filter(Boolean) : [];

      if (mode === "opening") {
        setDjStatus("speaking");
      }

      const [, voiceOk] = await Promise.all([revealSubtitleBySentence(lineText, lineTime, keywords), speakWithMode(lineText)]);
      if (ttsModeRef.current === "browser_tts" && !voiceOk) {
        setTtsMode("subtitle_only");
      }

      if (state.isPlaying) {
        duckingRef.current?.restoreMusic(220);
      }

      if (timelineId) {
        spokenTimelineRef.current.add(timelineId);
      }

      speakingLockRef.current = false;
      setDjStatus(sessionRef.current.isPlaying ? "playing" : "idle");
    },
    [activeCaption, captionHistory.length, revealSubtitleBySentence, speakWithMode],
  );

  const enterChannel = useCallback(
    async (intent: "auto" | "user") => {
      if (!sessionRef.current.queue.length) {
        return;
      }

      playIntentRef.current = intent;
      setPhase("on_air");
      setNeedsEnterChannel(false);

      setSession((prev) => {
        const next = { ...prev, isPlaying: true };
        schedulePersist(next);
        return next;
      });

      if (!openingDoneRef.current) {
        openingDoneRef.current = true;
        void runNarration("opening", "intro");
      }
    },
    [runNarration, schedulePersist],
  );

  const playAtIndex = useCallback(
    (index: number) => {
      setSession((prev) => {
        const normalized = normalizeSessionQueue(prev);
        const playback = toPlaybackState(normalized, normalized.isPlaying ? "playing" : "paused");
        const nextPlayback = playTrack(playback, index);

        const nextSession = normalizeSessionQueue({
          ...normalized,
          currentTrackId: nextPlayback.currentTrack?.id,
          currentIndex: nextPlayback.currentIndex,
          currentTime: nextPlayback.currentTime,
          isPlaying: nextPlayback.isPlaying,
          source: nextPlayback.currentTrack?.sourceType ?? normalized.source,
        });

        schedulePersist(nextSession);
        return nextSession;
      });
    },
    [schedulePersist],
  );

  const playNext = useCallback(() => {
    setSession((prev) => {
      const normalized = normalizeSessionQueue(prev);
      const playback = toPlaybackState(normalized, normalized.isPlaying ? "playing" : "paused");
      const nextPlayback = nextTrack(playback);

      const nextSession = normalizeSessionQueue({
        ...normalized,
        currentTrackId: nextPlayback.currentTrack?.id,
        currentIndex: nextPlayback.currentIndex,
        currentTime: nextPlayback.currentTime,
        isPlaying: nextPlayback.isPlaying,
        source: nextPlayback.currentTrack?.sourceType ?? normalized.source,
      });

      schedulePersist(nextSession);
      return nextSession;
    });
  }, [schedulePersist]);

  const onTrackEnded = useCallback(() => {
    const wasLastTrack = sessionRef.current.currentIndex >= sessionRef.current.queue.length - 1;
    playNext();
    if (wasLastTrack && !spokenTimelineRef.current.has("outro")) {
      void runNarration("transition", "outro");
    }
  }, [playNext, runNarration]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      playIntentRef.current = "user";
      void audio.play().catch(() => {
        setNeedsEnterChannel(true);
      });
    } else {
      audio.pause();
    }
  }, []);

  const runRefresh = useCallback(() => {
    startTransition(async () => {
      const response = await fetch("/api/dj/refresh", { method: "POST" });
      const data = await response.json();
      if (!data?.ok) return;
      applyPayload(data as TodayDJPayload, { replacedCount: data.queue?.length ?? 0 });
      setTimeout(() => {
        void enterChannel("user");
      }, 120);
    });
  }, [applyPayload, enterChannel]);

  const runTune = useCallback(
    (tweak: ProgramTweak, prompt?: string) => {
      const previous = sessionRef.current.queue.map((item) => item.track.id);
      startTransition(async () => {
        const response = await fetch("/api/dj/tune", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tweak, prompt }),
        });
        const data = await response.json();
        if (!data?.ok) return;

        const nextQueue = (data.queue ?? []) as PlaybackQueueItem[];
        const nextIds = new Set(nextQueue.map((item) => item.track.id));
        const retained = previous.filter((id) => nextIds.has(id)).length;
        const replaced = Math.max(0, nextQueue.length - retained);

        applyPayload(data as TodayDJPayload, { replacedCount: replaced });
        void enterChannel("user");
      });
    },
    [applyPayload, enterChannel],
  );

  const onSubmitFeel = () => {
    const text = requestHint.trim();
    if (!text) return;
    runTune(inferTweak(text), text);
    setRequestHint("");
  };

  const onSeek = (nextMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, nextMs / 1000);
    setSession((prev) => {
      const next = { ...prev, currentTime: nextMs };
      schedulePersist(next);
      return next;
    });
  };

  const onVolume = (nextVolume: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = nextVolume;
    }
    duckingRef.current?.setBaseVolume(nextVolume);

    setSession((prev) => {
      const next = { ...prev, volume: nextVolume };
      schedulePersist(next);
      return next;
    });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setClockLabel(getClockLabel(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    ttsModeRef.current = ttsMode;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("flowmate_tts_mode", ttsMode);
    }
  }, [ttsMode]);

  useEffect(() => {
    if (ttsMode !== "browser_tts") {
      return;
    }

    if (!browserTtsRef.current.isAvailable()) {
      setTtsMode("subtitle_only");
    }
  }, [ttsMode]);

  useEffect(() => {
    const tts = browserTtsRef.current;
    return () => {
      tts.stop();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    duckingRef.current = new AudioDucking(audio);
    duckingRef.current.setBaseVolume(session.volume);
  }, [session.volume]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setPhase("loading");
      setPhaseText("姝ｅ湪鍔犺浇浣犵殑棰戦亾...");
      await sleep(620);
      if (cancelled) return;

      setPhase("tuning");
      setPhaseText("姝ｅ湪璋冮鍒颁綘鐨勭浜洪閬?..");

      const playback = await fetch("/api/playback/session")
        .then((res) => res.json())
        .catch(() => null);

      const fromPlayback = playback?.ok ? (playback.session as PlaybackSessionState | undefined) : undefined;
      if (fromPlayback?.queue?.length) {
        const normalized = normalizeSessionQueue(fromPlayback);
        setSession({
          ...normalized,
          isPlaying: false,
        });
        setToday((prev) => ({
          ...prev,
          mode: "resume",
          title: "正在播出",
          reason: "频道已恢复到你上次收听的位置。",
          queue: normalized.queue,
          currentTrack: normalized.queue[normalized.currentIndex]?.track ?? null,
          currentIndex: normalized.currentIndex,
          djLine: "频道已连接，马上给你一个开场。",
        }));
      } else {
        const refreshed = await fetch("/api/dj/today")
          .then((res) => res.json())
          .catch(() => null);
        if (refreshed?.ok) {
          const payload = refreshed as TodayDJPayload;
          applyPayload(payload, { autoplay: false });
        }
      }

      if (cancelled) return;
      setPhase("on_air");
      setTimeout(() => {
        void enterChannel("auto");
      }, 180);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyPayload, enterChannel]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const playback = toPlaybackState(sessionRef.current, session.isPlaying ? "playing" : "paused");
    const src = playback.audioUrl;
    if (!src) {
      audio.pause();
      sourceRef.current = null;
      setSession((prev) => {
        if (!prev.isPlaying) {
          return prev;
        }
        const next = { ...prev, isPlaying: false };
        schedulePersist(next);
        return next;
      });
      return;
    }

    if (sourceRef.current !== src) {
      syncAudioSource(audio, playback);
      sourceRef.current = src;
      audio.currentTime = Math.max(0, sessionRef.current.currentTime / 1000);
    }

    console.debug("[radio-playback-sync]", {
      currentTrackTitle: playback.currentTrack?.name ?? null,
      currentTrackAudioUrl: src,
      audioCurrentSrc: audio.currentSrc || null,
    });

    audio.volume = session.volume;

    if (session.isPlaying) {
      void audio.play().catch(() => {
        setSession((prev) => ({ ...prev, isPlaying: false }));
        if (playIntentRef.current === "auto") {
          setNeedsEnterChannel(true);
        }
      });
    } else {
      audio.pause();
    }
  }, [currentItem?.track.audioUrl, currentItem?.track.name, schedulePersist, session.isPlaying, session.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDurationMs(Number.isFinite(audio.duration) ? Math.floor(audio.duration * 1000) : 0);
    };

    const onTimeUpdate = () => {
      const nextMs = Math.floor(audio.currentTime * 1000);
      setSession((prev) => ({ ...prev, currentTime: nextMs }));

      if (Math.abs(nextMs - progressPersistRef.current) > 5000) {
        progressPersistRef.current = nextMs;
        schedulePersist({
          ...sessionRef.current,
          currentTime: nextMs,
          isPlaying: !audio.paused,
        });
      }
    };

    const onPlay = () => {
      setSession((prev) => {
        const next = { ...prev, isPlaying: true };
        schedulePersist(next);
        return next;
      });
    };

    const onPause = () => {
      setSession((prev) => {
        const next = { ...prev, isPlaying: false };
        schedulePersist(next);
        return next;
      });
    };

    const onEnded = () => {
      onTrackEnded();
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [onTrackEnded, schedulePersist]);

  useEffect(() => {
    if (phase !== "on_air" || speakingLockRef.current) {
      return;
    }
    setDjStatus(session.isPlaying ? "playing" : "idle");
  }, [phase, session.isPlaying]);

  useEffect(() => {
    if (phase !== "on_air") {
      return;
    }

    const activeTrackId = currentItem?.track.id;
    if (!activeTrackId) {
      return;
    }

    if (prevTrackRef.current === null) {
      prevTrackRef.current = activeTrackId;
      return;
    }

    if (prevTrackRef.current === activeTrackId) {
      return;
    }

    prevTrackRef.current = activeTrackId;

    if (bridgeIndices.has(session.currentIndex)) {
      const timelineId = `bridge-before-${session.currentIndex}`;
      if (!spokenTimelineRef.current.has(timelineId)) {
        void runNarration("transition", timelineId);
      }
    }
  }, [bridgeIndices, currentItem?.track.id, phase, runNarration, session.currentIndex]);

  const queueProgress = session.queue.length ? `${session.currentIndex + 1}/${session.queue.length}` : "0/0";
  const activeDuration = durationMs || currentItem?.track.durationMs || currentItem?.track.duration || 0;

  const statusText =
    phase === "loading"
      ? "Loading..."
      : phase === "tuning"
        ? "Tuning..."
        : djStatus === "opening"
          ? "Opening..."
          : djStatus === "speaking"
            ? "Speaking..."
            : djStatus === "playing"
              ? "Playing..."
              : "Idle";

  const statusColor =
    phase === "loading" || phase === "tuning"
      ? "text-amber-300"
      : djStatus === "opening" || djStatus === "speaking"
        ? "text-emerald-400"
        : djStatus === "playing"
          ? "text-cyan-300"
          : "text-zinc-400";

  const sourceName = providerLabel(currentItem?.track.sourceType);

  const visualBars = useMemo(() => Array.from({ length: 72 }, (_, idx) => idx), []);
  const waveformBars = useMemo(() => Array.from({ length: 64 }, (_, idx) => idx), []);
  const upcomingPrograms = useMemo(() => session.queue.slice(session.currentIndex, session.currentIndex + 5), [session.currentIndex, session.queue]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(44,108,217,0.45),transparent_28%),radial-gradient(circle_at_90%_100%,rgba(114,35,170,0.35),transparent_30%),#04050b] px-4 py-8 text-zinc-100 md:px-6">
      <audio ref={audioRef} preload="metadata" />

      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6">
        <header className="flex items-center justify-between px-1 text-sm tracking-[0.16em] text-zinc-300/90">
          <nav className="flex items-center gap-8 text-[0.78rem]">
            <Link href="/" className="hover:text-white">HOME</Link>
            <Link href="/workspace" className="hover:text-white">LAB</Link>
            <Link href="/settings/sources" className="hover:text-white">MUSIC</Link>
          </nav>
          <span className="font-medium text-zinc-100">{clockLabel}</span>
        </header>

        <section className="overflow-hidden rounded-[34px] border border-white/20 bg-black/30 shadow-[0_26px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="relative overflow-hidden border-b border-white/10 bg-[#070913] px-5 pb-5 pt-4">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:14px_14px]" />

            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/15 text-xs font-semibold">ON</div>
                <div>
                  <p className="font-heading text-2xl leading-none tracking-tight">{PRODUCT_NAME}</p>
                  <p className="mt-1 text-xs text-zinc-300">{CHANNEL_NAME} 路 {SESSION_MODE}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tracking-tight text-zinc-100">{clockLabel}</p>
                <p className={`text-xs ${statusColor}`}>鈼?{statusText}</p>
              </div>
            </div>

            <div className="relative mt-7 h-[108px] w-full overflow-hidden md:h-[136px]">
              <div className="flex h-full w-full items-end gap-[2px]">
                {visualBars.map((bar) => {
                  const baseHeight = 14 + ((bar * 17) % 48);
                  const animated = session.isPlaying || djStatus === "speaking" || djStatus === "opening" || phase === "tuning";
                  return (
                    <span
                      key={bar}
                      className={`min-w-0 flex-1 origin-bottom rounded-full bg-white/80 ${animated ? "episode-eq" : ""}`}
                      style={{
                        height: `${baseHeight}px`,
                        animationDelay: `${bar * 24}ms`,
                        animationDuration: `${920 + (bar % 7) * 90}ms`,
                        opacity: phase === "tuning" || djStatus === "speaking" || djStatus === "opening" ? 1 : 0.78,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-[#f3f3f4] px-5 pb-5 pt-6 text-zinc-900">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">正在播出</p>
              <h1 className="font-heading text-4xl leading-[1.02] tracking-tight">{today.title || "今日频道"}</h1>
              <p className="text-sm text-zinc-500">{phase === "tuning" ? phaseText : `今日节目 · ${queueProgress}`}</p>
            </div>

            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">正在播放</p>
                <p className="line-clamp-1 text-lg font-medium text-zinc-900">{currentItem?.track.name ?? "频道待连接"}</p>
                <p className="line-clamp-1 text-sm text-zinc-500">
                  {currentItem ? `${currentItem.track.artist} · ${currentItem.track.album ?? "Single"}` : "正在准备你的节目内容"}
                </p>
              </div>
              {validExternalUrl ? (
                <a
                  href={validExternalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="whitespace-nowrap text-xs font-semibold tracking-wide text-zinc-500 hover:text-zinc-900"
                >
                  Listen on {sourceName} →
                </a>
              ) : (
                <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-zinc-400">暂时没有原平台链接</span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>{today.providerStatus.provider}</span>
              <span>{formatTime(session.currentTime)} / {formatTime(activeDuration)}</span>
            </div>

            <section className="mt-5 max-h-[290px] overflow-hidden rounded-3xl bg-zinc-200/70 p-4">
              <p className="text-xs text-zinc-500">DJ 姝ｅ湪璇?路 {activeCaption.timeLabel}</p>
              <p className="mt-2 min-h-[76px] text-[1.04rem] font-medium leading-[1.62] tracking-tight text-zinc-900 md:text-[1.2rem] md:leading-[1.64]">
                <HighlightedCaption text={activeCaption.text} keywords={activeCaption.keywords} />
              </p>

              <div className="mt-3 max-h-[112px] space-y-1.5 overflow-hidden">
                {captionHistory.map((line, index) => (
                  <p
                    key={line.id}
                    className="text-[0.88rem] leading-[1.6] text-zinc-500 md:text-[0.93rem]"
                    style={{ opacity: Math.max(0.35, 0.55 - index * 0.08) }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {needsEnterChannel ? (
                  <button
                    type="button"
                    onClick={() => {
                      playIntentRef.current = "user";
                      void enterChannel("user");
                    }}
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    杩涘叆鎴戠殑棰戦亾
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={runRefresh}
                  disabled={isPending}
                  className="rounded-full border border-zinc-400/60 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 inline h-3 w-3" />}
                  鎹釜棰戦亾鎰?                </button>
                <button
                  type="button"
                  onClick={() => void runNarration("manual")}
                  className="rounded-full border border-zinc-300 bg-zinc-100/70 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  琛ヤ竴鍙ヨ鏄?                </button>
                {TUNE_ACTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => runTune(item.key)}
                    disabled={isPending}
                    className="rounded-full border border-zinc-300 bg-zinc-100/70 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTtsMode("subtitle_only")}
                  className={`rounded-full px-3 py-1 ${ttsMode === "subtitle_only" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
                >
                  瀛楀箷妯″紡
                </button>
                <button
                  type="button"
                  onClick={() => setTtsMode("browser_tts")}
                  className={`rounded-full px-3 py-1 ${ttsMode === "browser_tts" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
                >
                  娴忚鍣ㄨ闊?                </button>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={requestHint}
                  onChange={(event) => setRequestHint(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSubmitFeel();
                    }
                  }}
                  placeholder="鍛婅瘔 DJ 鎴戞兂鎹釜鎰熻"
                  className="h-10 flex-1 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none ring-emerald-300/70 placeholder:text-zinc-400 focus:ring"
                />
                <button
                  type="button"
                  onClick={onSubmitFeel}
                  disabled={isPending}
                  className="h-10 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  璋冩暣
                </button>
              </div>
            </section>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-300/70 bg-white/85">
              <button
                type="button"
                onClick={() => setQueueOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-zinc-700">
                  今日节目单 · 接下来 {Math.max(0, session.queue.length - session.currentIndex - 1)} 段
                </span>
                {queueOpen ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronUp className="h-4 w-4 text-zinc-500" />}
              </button>

              {queueOpen ? (
                <div className="max-h-48 space-y-1 overflow-y-auto border-t border-zinc-200 px-2 py-2">
                  {upcomingPrograms.map((item, offset) => {
                    const index = session.currentIndex + offset;
                    const active = index === session.currentIndex;
                    return (
                      <button
                        key={`${item.track.id}-${index}`}
                        type="button"
                        onClick={() => playAtIndex(index)}
                        className={`w-full rounded-xl px-3 py-2 text-left ${active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
                      >
                        <p className="line-clamp-1 text-sm">{index + 1}. {item.track.name}</p>
                        <p className={`line-clamp-1 text-xs ${active ? "text-zinc-300" : "text-zinc-500"}`}>{item.track.artist}</p>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-300/75 bg-white px-4 py-3">
              <div className="w-full">
                <div className="flex h-7 w-full items-end gap-[2px]">
                  {waveformBars.map((bar) => (
                    <span
                      key={bar}
                      className={`min-w-0 flex-1 rounded-full bg-zinc-400 ${session.isPlaying ? "episode-wave" : ""}`}
                      style={{
                        height: `${6 + ((bar * 9) % 15)}px`,
                        animationDelay: `${bar * 30}ms`,
                        opacity: bar / waveformBars.length > session.currentTime / Math.max(activeDuration, 1) ? 0.34 : 0.72,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-2 w-full space-y-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(activeDuration, 1)}
                  value={Math.min(session.currentTime, Math.max(activeDuration, 1))}
                  onChange={(event) => onSeek(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900"
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{formatTime(session.currentTime)}</span>
                  <span>{formatTime(activeDuration)}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => playAtIndex(session.currentIndex - 1)}
                  disabled={session.currentIndex === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 disabled:opacity-40"
                >
                  <SkipBack className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={hasDirectAudio ? togglePlay : () => void enterChannel("user")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-white"
                >
                  {session.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  onClick={playNext}
                  disabled={session.currentIndex >= session.queue.length - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 disabled:opacity-40"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-zinc-500" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(session.volume * 100)}
                    onChange={(event) => onVolume(Number(event.target.value) / 100)}
                    className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <p className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {replaceCount > 0 ? `已更新 ${replaceCount} 首，频道已切到新质感。` : today.reason}
              </p>
              {recentPrograms[0] ? (
                <Link href={`/programs/${recentPrograms[0].id}`} className="hover:text-zinc-800">
                  上一档节目
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-zinc-400">{PRODUCT_NAME} 路 ON AIR</p>
      </div>
    </div>
  );
}


