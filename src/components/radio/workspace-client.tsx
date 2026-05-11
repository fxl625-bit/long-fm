"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Pause, Play, SkipBack, SkipForward, Sparkles, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AI_DJ_SHORT_LINES, FINE_TUNE_OPTIONS, PLAYER_MODES, QUICK_SCENES } from "@/lib/constants/product";
import type { MusicProfileStructured, PlaybackQueueItem, PlaybackSessionState, ProgramTweak } from "@/lib/types/music";
import type { GeneratedProgram } from "@/lib/types/radio";

type ProgramItem = {
  id: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
};

type PlaylistItem = {
  id: string;
  name: string;
  isLikedPlaylist: boolean;
  trackCount: number;
};

type Props = {
  initialPrograms: ProgramItem[];
  initialPlaylists: PlaylistItem[];
  initialProfile?: {
    summaryText: string;
    structured: MusicProfileStructured;
  };
  initialProgram?: GeneratedProgram;
  initialSession?: PlaybackSessionState;
};

const SCENE_PROMPTS: Record<(typeof QUICK_SCENES)[number], string> = {
  通勤: "给我一组通勤可连播的队列，前段清醒，中段推进，后段放松。",
  专注: "我要专注工作，低打扰但别太平。",
  放松: "今天想慢下来，给我一组松弛但不无聊的歌。",
  开车: "做一组开车听的队列，流动感强一点。",
  想怀旧: "我想听怀旧一点的，最好有 2000s 质感。",
  想提神: "状态有点散，帮我排一组提神但不炸的。",
};

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1518606371495-8d2f53b8dbb1?auto=format&fit=crop&w=600&q=80";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildQueueFromProgram(program?: GeneratedProgram | null): PlaybackQueueItem[] {
  if (!program?.tracksDetailed?.length) {
    return [];
  }

  return program.tracksDetailed.map((item) => ({
    track: item.track,
    reason: item.reason,
    section: item.section,
  }));
}

function buildSessionFromQueue(queue: PlaybackQueueItem[]): PlaybackSessionState {
  return {
    currentTrackId: queue[0]?.track.id,
    queue,
    currentIndex: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    source: queue[0]?.track.sourceType ?? "DEMO",
  };
}

export function WorkspaceClient({ initialPrograms, initialPlaylists, initialProfile, initialProgram, initialSession }: Props) {
  const searchParams = useSearchParams();
  const promptFromQuery = searchParams.get("prompt")?.trim();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressPersistRef = useRef<number>(0);

  const [mode, setMode] = useState<(typeof PLAYER_MODES)[number]>(PLAYER_MODES[0]);
  const [prompt, setPrompt] = useState(promptFromQuery || "给我一组今天可以循环听的队列，别太吵，顺一点。");
  const [program, setProgram] = useState<GeneratedProgram | null>(initialProgram ?? null);
  const [programs, setPrograms] = useState(initialPrograms);
  const [isPending, startTransition] = useTransition();
  const [durationMs, setDurationMs] = useState(0);

  const initialQueue = useMemo(
    () => initialSession?.queue?.length ? initialSession.queue : buildQueueFromProgram(initialProgram),
    [initialSession, initialProgram],
  );

  const [session, setSession] = useState<PlaybackSessionState>(
    initialSession ?? buildSessionFromQueue(initialQueue),
  );
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const selectedPlaylist = useMemo(
    () => initialPlaylists.find((item) => item.isLikedPlaylist) ?? initialPlaylists[0],
    [initialPlaylists],
  );

  const currentItem = session.queue[session.currentIndex];

  const djLine = useMemo(() => {
    if (currentItem?.reason) {
      return currentItem.reason;
    }
    const seed = (session.queue.length + (currentItem?.track.name.length ?? 0)) % AI_DJ_SHORT_LINES.length;
    return AI_DJ_SHORT_LINES[seed];
  }, [currentItem, session.queue.length]);

  const persistSession = useCallback(async (nextState?: PlaybackSessionState) => {
    const payload = nextState ?? sessionRef.current;
    await fetch("/api/playback/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }, []);

  const schedulePersist = useCallback((nextState?: PlaybackSessionState) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      void persistSession(nextState);
    }, 500);
  }, [persistSession]);

  useEffect(() => {
    if (initialSession?.queue?.length) {
      return;
    }

    void fetch("/api/playback/session")
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok || !data?.session) {
          return;
        }
        const remote = data.session as PlaybackSessionState;
        if (!remote.queue?.length) {
          return;
        }
        setSession(remote);
      })
      .catch(() => undefined);
  }, [initialSession?.queue?.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const src = currentItem?.track.audioUrl;
    if (!src) {
      audio.pause();
      sourceRef.current = null;
      return;
    }

    if (sourceRef.current !== src) {
      audio.src = src;
      sourceRef.current = src;
      audio.currentTime = Math.max(0, sessionRef.current.currentTime / 1000);
    }

    audio.volume = session.volume;

    if (session.isPlaying) {
      void audio.play().catch(() => {
        setSession((prev) => ({ ...prev, isPlaying: false }));
      });
    } else {
      audio.pause();
    }
  }, [currentItem?.track.audioUrl, session.isPlaying, session.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

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
      setSession((prev) => {
        if (prev.currentIndex >= prev.queue.length - 1) {
          const next = { ...prev, isPlaying: false, currentTime: 0 };
          schedulePersist(next);
          return next;
        }

        const nextIndex = prev.currentIndex + 1;
        const next: PlaybackSessionState = {
          ...prev,
          currentIndex: nextIndex,
          currentTrackId: prev.queue[nextIndex]?.track.id,
          currentTime: 0,
          isPlaying: true,
        };
        schedulePersist(next);
        return next;
      });
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
  }, [schedulePersist]);

  const playAtIndex = useCallback((index: number) => {
    setSession((prev) => {
      if (!prev.queue.length) {
        return prev;
      }

      const clamped = Math.max(0, Math.min(index, prev.queue.length - 1));
      const next: PlaybackSessionState = {
        ...prev,
        currentIndex: clamped,
        currentTrackId: prev.queue[clamped]?.track.id,
        currentTime: 0,
        isPlaying: true,
      };
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const playPrev = useCallback(() => {
    playAtIndex(session.currentIndex - 1);
  }, [playAtIndex, session.currentIndex]);

  const playNext = useCallback(() => {
    playAtIndex(session.currentIndex + 1);
  }, [playAtIndex, session.currentIndex]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const onSeek = (nextMs: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

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

    setSession((prev) => {
      const next = { ...prev, volume: nextVolume };
      schedulePersist(next);
      return next;
    });
  };

  const runGenerate = (tweak?: ProgramTweak) => {
    if (!prompt.trim()) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/radio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          playlistId: selectedPlaylist?.id,
          desiredTrackCount: 12,
          styleId: "daily-flow",
          tweak,
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        alert(data.message ?? "生成失败");
        return;
      }

      const generated = data.program as GeneratedProgram;
      setProgram(generated);
      setPrograms((prev) => [
        {
          id: data.programId,
          title: generated.title,
          subtitle: generated.subtitle,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      const queue = buildQueueFromProgram(generated);
      const nextState = buildSessionFromQueue(queue);
      nextState.isPlaying = true;

      setSession(nextState);
      schedulePersist(nextState);
    });
  };

  const subtleProfile = initialProfile?.structured
    ? `${initialProfile.structured.moods.slice(0, 2).join(" / ")} · ${initialProfile.structured.keywords.slice(0, 2).join(" / ")}`
    : "先同步你的喜欢歌曲，AI DJ 会更像你";

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-12">
      <audio ref={audioRef} preload="metadata" />

      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Player-first AI DJ</p>
          <p className="text-sm text-zinc-300">{subtleProfile}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
          {PLAYER_MODES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${item === mode ? "bg-white/15 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_0.9fr]">
        <Card className="h-full">
          <CardContent className="space-y-6 p-6">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60">
              <Image
                src={currentItem?.track.coverUrl || program?.tracksDetailed[0]?.track.coverUrl || FALLBACK_COVER}
                alt={currentItem?.track.name ?? "cover"}
                width={1200}
                height={1200}
                className="h-[300px] w-full object-cover"
                unoptimized
              />
            </div>

            <div className="space-y-2">
              <h2 className="line-clamp-1 text-3xl font-semibold tracking-tight text-zinc-100">
                {currentItem?.track.name ?? "还没有开始播放"}
              </h2>
              <p className="line-clamp-1 text-zinc-300">{currentItem ? `${currentItem.track.artist} · ${currentItem.track.album ?? "Single"}` : "先准备一组节目队列"}</p>
              <div className="flex flex-wrap gap-2">
                {(currentItem?.track.moodTags ?? []).slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="muted">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="range"
                min={0}
                max={Math.max(durationMs, currentItem?.track.durationMs ?? currentItem?.track.duration ?? 0, 1)}
                value={Math.min(session.currentTime, Math.max(durationMs, currentItem?.track.durationMs ?? currentItem?.track.duration ?? 0, 1))}
                onChange={(event) => onSeek(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-300"
              />
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{formatTime(session.currentTime)}</span>
                <span>{formatTime(durationMs || currentItem?.track.durationMs || currentItem?.track.duration || 0)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={playPrev} disabled={session.currentIndex === 0}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="lg" onClick={togglePlay} disabled={!session.queue.length}>
                {session.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {session.isPlaying ? "暂停" : "播放"}
              </Button>
              <Button variant="secondary" size="sm" onClick={playNext} disabled={session.currentIndex >= session.queue.length - 1}>
                <SkipForward className="h-4 w-4" />
              </Button>
              <div className="ml-auto flex items-center gap-2 text-zinc-400">
                <Volume2 className="h-4 w-4" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(session.volume * 100)}
                  onChange={(event) => onVolume(Number(event.target.value) / 100)}
                  className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-300"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">当前节目队列</p>
              <h3 className="line-clamp-2 text-2xl font-semibold text-zinc-100">{program?.title ?? "默认播放队列"}</h3>
              <p className="text-sm text-zinc-400">{program?.subtitle ?? "点击任意歌曲立即切换播放"}</p>
            </div>

            <div className="space-y-2">
              {session.queue.length ? (
                session.queue.map((item, index) => {
                  const active = index === session.currentIndex;
                  return (
                    <button
                      key={`${item.track.id}-${index}`}
                      type="button"
                      onClick={() => playAtIndex(index)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"
                      }`}
                    >
                      <p className="line-clamp-1 text-sm text-zinc-100">{index + 1}. {item.track.name}</p>
                      <p className="line-clamp-1 text-xs text-zinc-400">{item.track.artist}</p>
                      {active && item.reason ? <p className="mt-1 line-clamp-2 text-xs text-cyan-100/80">{item.reason}</p> : null}
                    </button>
                  );
                })
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">
                  还没有可播放队列，先告诉 DJ 你现在想听的感觉。
                </p>
              )}
            </div>

            {programs.length ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">历史记录卡片</p>
                <div className="space-y-2">
                  {programs.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={`/programs/${item.id}`}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20"
                    >
                      <p className="line-clamp-1 text-zinc-100">{item.title}</p>
                      <p className="line-clamp-1 text-xs text-zinc-500">{item.subtitle ?? "节目详情"}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="space-y-5 p-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">AI DJ 一句话</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{djLine}</p>
            </div>

            <div className="space-y-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="比如：今天心有点乱，想听顺一点、别太丧的。"
                className="h-28 w-full resize-none rounded-2xl border border-white/12 bg-black/25 p-3 text-sm text-zinc-100 outline-none ring-cyan-300/50 placeholder:text-zinc-500 focus:ring"
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_SCENES.map((scene) => (
                  <button
                    key={scene}
                    type="button"
                    onClick={() => setPrompt(SCENE_PROMPTS[scene])}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
                  >
                    {scene}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => runGenerate()} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                再来一组
              </Button>
              <Button variant="secondary" onClick={() => runGenerate("more_rhythm")} disabled={isPending}>
                更轻快
              </Button>
              <Button variant="secondary" onClick={() => runGenerate("more_nostalgic")} disabled={isPending}>
                更怀旧
              </Button>
              <Button variant="secondary" onClick={() => runGenerate("less_sad")} disabled={isPending}>
                少一点悲伤
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">微调选项</p>
              <div className="flex flex-wrap gap-2">
                {FINE_TUNE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => runGenerate(option.key)}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-cyan-300/35 hover:text-cyan-100"
                    disabled={isPending}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
