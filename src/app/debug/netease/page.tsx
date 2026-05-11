"use client";

import { useEffect, useMemo, useState } from "react";

type NeteaseStatusPayload = {
  ok?: boolean;
  authenticated?: boolean;
  loginState?: string;
  message?: string;
  profile?: {
    id?: string;
    nickname?: string;
  };
  likedPlaylistId?: string;
};

type UserProfilePayload = {
  ok?: boolean;
  profile?: {
    userId?: string;
    nickname?: string;
  } | null;
};

type ResolveOnePayload = {
  songId: string;
  loggedIn: boolean;
  hasCookie: boolean;
  attempts: Array<{
    endpoint: string;
    params: Record<string, string | number>;
    success: boolean;
    urlFound: boolean;
    urlPrefix: string | null;
    rawShape: string;
    code: number | null;
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

type ResolvePlaylistPayload = {
  playlistId: string;
  playlistName?: string;
  totalTested: number;
  playable: number;
  failed: number;
  stats: Record<string, number>;
  playableSamples: Array<{ id: string; title: string; artist: string; audioUrlPrefix: string | null }>;
  failedSamples: Array<{ id: string; title: string; artist: string; reason: string | null; attempts: unknown[] }>;
};

type SearchPlayablePayload = {
  found: boolean;
  track: { id: string; title: string; artist: string; audioUrl: string } | null;
  tried: unknown[];
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  return (await response.json()) as T;
}

export default function DebugNeteasePage() {
  const [status, setStatus] = useState<NeteaseStatusPayload | null>(null);
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [songId, setSongId] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [searchArtist, setSearchArtist] = useState("");
  const [resolveOne, setResolveOne] = useState<ResolveOnePayload | null>(null);
  const [resolvePlaylist, setResolvePlaylist] = useState<ResolvePlaylistPayload | null>(null);
  const [searchPlayable, setSearchPlayable] = useState<SearchPlayablePayload | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      readJson<NeteaseStatusPayload>("/api/netease/status").then(setStatus).catch(() => setStatus({ ok: false, message: "status failed" })),
      readJson<UserProfilePayload>("/api/netease/user/profile").then(setProfile).catch(() => setProfile({ ok: false, profile: null })),
    ]);
  }, []);

  const identity = useMemo(
    () => ({
      hasCookie: Boolean(profile?.ok || status?.authenticated),
      userId: profile?.profile?.userId ?? status?.profile?.id ?? "",
      nickname: profile?.profile?.nickname ?? status?.profile?.nickname ?? "",
      selectedPlaylistId: playlistId.trim() || status?.likedPlaylistId || "",
    }),
    [playlistId, profile, status],
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8 text-sm">
      <h1 className="text-2xl font-semibold">NetEase Debug</h1>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Login Status</h2>
        <div className="space-y-1">
          <p>hasCookie: {String(identity.hasCookie)}</p>
          <p>userId: {identity.userId || "N/A"}</p>
          <p>nickname: {identity.nickname || "N/A"}</p>
          <p>selectedPlaylistId: {identity.selectedPlaylistId || "N/A"}</p>
          <p>status message: {status?.message ?? "N/A"}</p>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Resolve One Song</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={songId}
            onChange={(event) => setSongId(event.target.value)}
            placeholder="songId"
            className="min-w-[240px] rounded border px-3 py-2"
          />
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={!songId.trim() || loading === "resolve-one"}
            onClick={async () => {
              setLoading("resolve-one");
              try {
                const payload = await readJson<ResolveOnePayload>(`/api/netease/debug/resolve-one?id=${encodeURIComponent(songId.trim())}`);
                setResolveOne(payload);
              } finally {
                setLoading(null);
              }
            }}
          >
            解析这首歌
          </button>
        </div>
        {resolveOne ? (
          <div className="mt-4 space-y-3">
            <p>
              playable: {String(resolveOne.final.playable)} | reason: {resolveOne.final.reason ?? "none"}
            </p>
            {resolveOne.final.audioUrl ? <audio controls src={resolveOne.final.audioUrl} className="w-full" /> : null}
            <pre className="overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(resolveOne, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Resolve Playlist</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={playlistId}
            onChange={(event) => setPlaylistId(event.target.value)}
            placeholder="playlistId"
            className="min-w-[240px] rounded border px-3 py-2"
          />
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={!identity.selectedPlaylistId || loading === "resolve-playlist"}
            onClick={async () => {
              setLoading("resolve-playlist");
              try {
                const payload = await readJson<ResolvePlaylistPayload>(
                  `/api/netease/debug/resolve-playlist?playlistId=${encodeURIComponent(identity.selectedPlaylistId)}&limit=20`,
                );
                setResolvePlaylist(payload);
              } finally {
                setLoading(null);
              }
            }}
          >
            解析歌单前 20 首
          </button>
        </div>
        {resolvePlaylist ? <pre className="mt-4 overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(resolvePlaylist, null, 2)}</pre> : null}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Search Playable Replacement</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchTitle}
            onChange={(event) => setSearchTitle(event.target.value)}
            placeholder="title"
            className="min-w-[200px] rounded border px-3 py-2"
          />
          <input
            value={searchArtist}
            onChange={(event) => setSearchArtist(event.target.value)}
            placeholder="artist"
            className="min-w-[200px] rounded border px-3 py-2"
          />
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={(!searchTitle.trim() && !searchArtist.trim()) || loading === "search-playable"}
            onClick={async () => {
              setLoading("search-playable");
              try {
                const payload = await readJson<SearchPlayablePayload>("/api/netease/debug/search-playable", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: searchTitle.trim(),
                    artist: searchArtist.trim(),
                  }),
                });
                setSearchPlayable(payload);
              } finally {
                setLoading(null);
              }
            }}
          >
            搜索可播版本
          </button>
        </div>
        {searchPlayable ? (
          <div className="mt-4 space-y-3">
            {searchPlayable.track?.audioUrl ? <audio controls src={searchPlayable.track.audioUrl} className="w-full" /> : null}
            <pre className="overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(searchPlayable, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </main>
  );
}
