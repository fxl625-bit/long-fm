"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";

type StatusPayload = {
  ok?: boolean;
  authenticated?: boolean;
  loginState?: string;
  message?: string;
  profile?: {
    id?: string;
    nickname?: string;
  };
};

type ProfilePayload = {
  ok?: boolean;
  authenticated?: boolean;
  status?: string;
  profile?: {
    userId?: string;
    nickname?: string;
    avatarUrl?: string | null;
  } | null;
};

type QRCreatePayload = {
  ok?: boolean;
  qrKey?: string;
  qrImageUrl?: string;
  message?: string;
};

type QRCheckPayload = {
  ok?: boolean;
  status?: string;
  message?: string;
};

type PlaylistItem = {
  id: string;
  name: string;
  trackCount?: number;
  isLikedPlaylist?: boolean;
};

type PlaylistsPayload = {
  ok?: boolean;
  playlists?: PlaylistItem[];
  message?: string;
};

type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  coverUrl?: string;
};

type PlaylistTracksPayload = {
  playlistId: string;
  name: string;
  trackCount: number;
  tracks: PlaylistTrack[];
  debug: {
    rawShape: string;
    hasCookie: boolean;
    trackCountFromRaw: number;
  };
};

type ResolveOnePayload = {
  songId: string;
  hasCookie: boolean;
  apiMode: "package" | "remote";
  attempts: Array<{
    endpoint: string;
    params: Record<string, string | number>;
    rawShape: string;
    urlFound: boolean;
    urlPrefix: string | null;
    code: number | null;
    fee: number | null;
    message: string;
  }>;
  final: {
    playable: boolean;
    audioUrl: string | null;
    reason: string | null;
  };
  debug: {
    rawKeys: string[];
    sampleRaw: unknown;
  };
};

type BatchStats = {
  playable: number;
  failed: number;
  no_url: number;
  vip_only: number;
  copyright_unavailable: number;
  api_error: number;
  invalid_response: number;
};

type TrackResolveStatus = "idle" | "loading" | "playable" | "failed";

const EMPTY_BATCH_STATS: BatchStats = {
  playable: 0,
  failed: 0,
  no_url: 0,
  vip_only: 0,
  copyright_unavailable: 0,
  api_error: 0,
  invalid_response: 0,
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  return (await response.json()) as T;
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) {
    return "--:--";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createBatchStats() {
  return { ...EMPTY_BATCH_STATS };
}

function statusFromResolve(result?: ResolveOnePayload | null, isLoading = false): TrackResolveStatus {
  if (isLoading) return "loading";
  if (!result) return "idle";
  return result.final.playable ? "playable" : "failed";
}

export default function YesPlayCoreDebugPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [selectedPlaylistName, setSelectedPlaylistName] = useState("");
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [playlistTracksDebug, setPlaylistTracksDebug] = useState<PlaylistTracksPayload["debug"] | null>(null);
  const [playlistTracksLoading, setPlaylistTracksLoading] = useState(false);
  const [lastPlaylistTracksError, setLastPlaylistTracksError] = useState("");
  const [playlistClickCount, setPlaylistClickCount] = useState(0);
  const [lastClickedPlaylistId, setLastClickedPlaylistId] = useState("");
  const [qr, setQr] = useState<{ qrKey: string; qrImageUrl: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [resolveResults, setResolveResults] = useState<Record<string, ResolveOnePayload>>({});
  const [loadingTrackIds, setLoadingTrackIds] = useState<string[]>([]);
  const [lastResolveSongId, setLastResolveSongId] = useState("");
  const [lastResolveResult, setLastResolveResult] = useState<ResolveOnePayload | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchStats, setBatchStats] = useState<BatchStats>(createBatchStats);
  const [batchPlayableSamples, setBatchPlayableSamples] = useState<Array<{ id: string; title: string; audioUrl: string }>>([]);

  const isDev = process.env.NODE_ENV !== "production";
  const loggedIn = Boolean(profile?.ok && profile?.authenticated && profile.profile?.userId);

  const identity = useMemo(
    () => ({
      hasCookie: loggedIn,
      userId: profile?.profile?.userId ?? status?.profile?.id ?? "",
      nickname: profile?.profile?.nickname ?? status?.profile?.nickname ?? "",
      message: status?.message ?? "",
    }),
    [loggedIn, profile, status],
  );

  async function refreshIdentity() {
    const [statusPayload, profilePayload] = await Promise.all([
      readJson<StatusPayload>("/api/netease/status").catch(() => ({ ok: false, message: "status failed" })),
      readJson<ProfilePayload>("/api/netease/user/profile").catch(() => ({
        ok: false,
        authenticated: false,
        status: "login_required",
        profile: null,
      })),
    ]);

    setStatus(statusPayload);
    setProfile(profilePayload);
  }

  async function refreshPlaylists() {
    const payload = await readJson<PlaylistsPayload>("/api/netease/user/playlists").catch(() => ({
      ok: false,
      playlists: [],
    }));
    setPlaylists(payload.playlists ?? []);
  }

  async function loadPlaylistTracks(playlist: PlaylistItem) {
    setPlaylistClickCount((count) => count + 1);
    setLastClickedPlaylistId(playlist.id);
    setSelectedPlaylistId(playlist.id);
    setSelectedPlaylistName(playlist.name);
    setPlaylistTracksLoading(true);
    setLastPlaylistTracksError("");
    setTracks([]);
    setPlaylistTracksDebug(null);
    setResolveResults({});
    setLastResolveSongId("");
    setLastResolveResult(null);
    setBatchProgress(null);
    setBatchStats(createBatchStats());
    setBatchPlayableSamples([]);

    try {
      const payload = await readJson<PlaylistTracksPayload & { ok?: boolean; reason?: string; message?: string }>(
        `/api/netease/debug/playlist-tracks?playlistId=${encodeURIComponent(playlist.id)}&limit=20`,
      );

      if (!payload || Array.isArray((payload as { tracks?: unknown }).tracks) === false) {
        throw new Error("invalid_response_shape");
      }

      if ("ok" in payload && payload.ok === false) {
        throw new Error(payload.reason ?? payload.message ?? "playlist_detail_api_error");
      }

      setSelectedPlaylistId(payload.playlistId);
      setSelectedPlaylistName(payload.name);
      setTracks(payload.tracks);
      setPlaylistTracksDebug(payload.debug);
      if (!payload.tracks.length) {
        setLastPlaylistTracksError("no_tracks_in_response");
      }
    } catch (error) {
      setLastPlaylistTracksError(error instanceof Error ? error.message : "playlist_detail_api_error");
    } finally {
      setPlaylistTracksLoading(false);
    }
  }

  async function resolveTrack(track: PlaylistTrack) {
    setLoadingTrackIds((current) => (current.includes(track.id) ? current : [...current, track.id]));
    setLastResolveSongId(track.id);

    try {
      const payload = await readJson<ResolveOnePayload>(
        `/api/netease/debug/resolve-one?id=${encodeURIComponent(track.id)}`,
      );
      setResolveResults((current) => ({ ...current, [track.id]: payload }));
      setLastResolveResult(payload);
      return payload;
    } finally {
      setLoadingTrackIds((current) => current.filter((id) => id !== track.id));
    }
  }

  async function resolveTopTracks() {
    const targetTracks = tracks.slice(0, 20);
    setBatchProgress({ current: 0, total: targetTracks.length });
    setBatchStats(createBatchStats());
    setBatchPlayableSamples([]);

    const nextStats = createBatchStats();
    const samples: Array<{ id: string; title: string; audioUrl: string }> = [];

    for (let index = 0; index < targetTracks.length; index += 1) {
      const track = targetTracks[index];
      const result = await resolveTrack(track);

      if (result.final.playable && result.final.audioUrl) {
        nextStats.playable += 1;
        if (samples.length < 5) {
          samples.push({
            id: track.id,
            title: track.title,
            audioUrl: result.final.audioUrl,
          });
        }
      } else {
        nextStats.failed += 1;
        const reason = result.final.reason;
        if (reason && reason in nextStats) {
          nextStats[reason as keyof BatchStats] += 1;
        } else {
          nextStats.invalid_response += 1;
        }
      }

      setBatchStats({ ...nextStats });
      setBatchPlayableSamples([...samples]);
      setBatchProgress({ current: index + 1, total: targetTracks.length });
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshIdentity();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshPlaylists();
    }, 0);
    return () => clearTimeout(timer);
  }, [loggedIn]);

  useEffect(() => {
    if (!qr?.qrKey) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        const payload = await readJson<QRCheckPayload>("/api/netease/qr-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrKey: qr.qrKey }),
        }).catch(() => ({ ok: false, status: "error", message: "QR check failed" }));

        if (payload.status === "authorized" || payload.status === "logged_in" || payload.status === "partial_logged_in") {
          await refreshIdentity();
          await refreshPlaylists();
          if (!cancelled) {
            setQr(null);
          }
          return;
        }

        if (payload.status === "expired") {
          if (!cancelled) {
            setStatus({
              ok: true,
              authenticated: false,
              loginState: "login_required",
              message: payload.message ?? "二维码已过期，请重新生成。",
            });
          }
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [qr]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8 text-sm">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">YesPlay Core Debug</h1>
        <p className="text-zinc-600">只验证网易云真实播放闭环：登录、读取歌单、解析 song/url、直接试听。</p>
      </header>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">1. 登录状态</h2>
        <div className="space-y-1">
          <p>hasCookie: {String(identity.hasCookie)}</p>
          <p>userId: {identity.userId || "N/A"}</p>
          <p>nickname: {identity.nickname || "N/A"}</p>
          <p>message: {identity.message || "N/A"}</p>
        </div>

        {!loggedIn ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              className="rounded border px-3 py-2"
              disabled={loading === "qr"}
              onClick={async () => {
                setLoading("qr");
                try {
                  const payload = await readJson<QRCreatePayload>("/api/netease/qr-create", { method: "POST" });
                  if (payload.qrKey && payload.qrImageUrl) {
                    setQr({ qrKey: payload.qrKey, qrImageUrl: payload.qrImageUrl });
                  } else {
                    setStatus({
                      ok: false,
                      authenticated: false,
                      loginState: "login_required",
                      message: payload.message ?? "生成二维码失败。",
                    });
                  }
                } finally {
                  setLoading(null);
                }
              }}
            >
              生成二维码登录
            </button>
            {qr?.qrImageUrl ? <img src={qr.qrImageUrl} alt="NetEase QR" className="h-40 w-40 rounded border bg-white p-2" /> : null}
          </div>
        ) : null}
      </section>

      {loggedIn ? (
        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-medium">2. 用户歌单</h2>
          <p className="mb-3 text-zinc-600">点击任意歌单，读取前 20 首歌曲，再逐首调试 `song/url`。</p>
          <div className="grid gap-2">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="cursor-pointer rounded border px-3 py-2 text-left hover:bg-zinc-50"
                onClick={() => {
                  void loadPlaylistTracks(playlist);
                }}
              >
                <div className="font-medium">
                  {playlist.name} ({playlist.trackCount ?? 0}) {playlist.isLikedPlaylist ? "[Liked]" : ""}
                </div>
                <div className="text-xs text-zinc-500">playlistId: {playlist.id}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {selectedPlaylistId ? (
        <section className="rounded border p-4">
          <div className="mb-3 space-y-1">
            <h2 className="text-lg font-medium">3. 已选择歌单</h2>
            <p>selectedPlaylistId: {selectedPlaylistId}</p>
            <p>selectedPlaylistName: {selectedPlaylistName || "N/A"}</p>
            <p>playlistTracksLoading: {String(playlistTracksLoading)}</p>
            <p>playlistTracksCount: {tracks.length}</p>
            <p>lastPlaylistTracksError: {lastPlaylistTracksError || "none"}</p>
            {playlistTracksDebug ? (
              <p>
                rawShape: {playlistTracksDebug.rawShape} | trackCountFromRaw: {playlistTracksDebug.trackCountFromRaw}
              </p>
            ) : null}
          </div>

          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded border px-3 py-2"
              disabled={playlistTracksLoading || tracks.length === 0}
              onClick={() => {
                void resolveTopTracks();
              }}
            >
              解析前 20 首
            </button>
            {batchProgress ? (
              <p className="self-center">
                正在解析 {batchProgress.current} / {batchProgress.total}
              </p>
            ) : null}
          </div>

          <div className="mb-4 rounded bg-zinc-50 p-3 text-xs">
            <p>playable: {batchStats.playable}</p>
            <p>failed: {batchStats.failed}</p>
            <p>no_url: {batchStats.no_url}</p>
            <p>vip_only: {batchStats.vip_only}</p>
            <p>copyright_unavailable: {batchStats.copyright_unavailable}</p>
            <p>api_error: {batchStats.api_error}</p>
            <p>invalid_response: {batchStats.invalid_response}</p>
            {batchPlayableSamples.length ? (
              <pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(batchPlayableSamples, null, 2)}</pre>
            ) : null}
          </div>

          <div className="space-y-4">
            {tracks.map((track, index) => {
              const isLoading = loadingTrackIds.includes(track.id);
              const resolved = resolveResults[track.id];
              const resolveStatus = statusFromResolve(resolved, isLoading);

              return (
                <div key={track.id} className="rounded border p-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {index + 1}. {track.title} - {track.artist}
                    </p>
                    <p className="text-xs text-zinc-600">songId: {track.id}</p>
                    <p className="text-xs text-zinc-600">
                      专辑: {track.album || "N/A"} | 时长: {formatDuration(track.durationMs)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded border px-3 py-2"
                      disabled={isLoading}
                      onClick={() => {
                        void resolveTrack(track);
                      }}
                    >
                      解析 URL
                    </button>
                    <span>状态：{resolveStatus === "idle" ? "未解析" : resolveStatus === "loading" ? "解析中" : resolveStatus === "playable" ? "可播放" : "不可播"}</span>
                  </div>

                  {resolved ? (
                    <div className="mt-3 space-y-2">
                      <p>reason: {resolved.final.reason ?? "none"}</p>
                      <p>attempts: {resolved.attempts.length}</p>
                      {resolved.final.audioUrl ? (
                        <>
                          <p className="break-all text-xs text-zinc-600">audioUrl: {resolved.final.audioUrl.slice(0, 120)}...</p>
                          <audio controls src={resolved.final.audioUrl} className="w-full" />
                        </>
                      ) : null}
                      <div className="rounded bg-zinc-50 p-3 text-xs">
                        <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(resolved, null, 2)}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {isDev ? (
        <section className="rounded border border-dashed p-4 text-xs">
          <h2 className="mb-3 text-lg font-medium">Debug Log</h2>
          <pre className="overflow-auto whitespace-pre-wrap">
            {JSON.stringify(
              {
                playlistClickCount,
                lastClickedPlaylistId,
                selectedPlaylistId,
                playlistTracksLoading,
                playlistTracksCount: tracks.length,
                lastPlaylistTracksError,
                lastResolveSongId,
                lastResolveResult,
              },
              null,
              2,
            )}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
