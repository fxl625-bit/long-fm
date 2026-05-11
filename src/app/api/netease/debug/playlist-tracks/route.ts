import { NextResponse } from "next/server";
import { getNeteaseApiBaseUrl } from "@/lib/providers/netease/netease-api-mode";
import { getCurrentNeteaseSession } from "@/lib/providers/netease/netease-auth";
import {
  extractPlaylistTracksDebugPayload,
  mapPlaylistTracksDebugError,
} from "@/lib/providers/netease/netease-playlist-debug";

function buildNeteaseUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(path, getNeteaseApiBaseUrl());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchNeteaseDebugJson(path: string, params: Record<string, string | number>, cookie: string) {
  const url = buildNeteaseUrl(path, {
    ...params,
    cookie,
    timestamp: Date.now(),
  });

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Playlist detail API error: ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get("playlistId")?.trim() ?? "";
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") ?? "20") || 20));

    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          reason: "playlist_id_missing",
          message: "playlistId is required",
        },
        { status: 400 },
      );
    }

    const { providerSession } = await getCurrentNeteaseSession();
    const cookie = providerSession?.cookie?.trim() ?? "";
    if (!cookie) {
      return NextResponse.json(
        {
          ok: false,
          reason: "cookie_missing",
          message: "NetEase cookie is missing",
        },
        { status: 401 },
      );
    }

    const playlistRaw = await fetchNeteaseDebugJson("/playlist/detail", { id: playlistId }, cookie);
    const playlistRecord =
      (playlistRaw.playlist as Record<string, unknown> | undefined) ??
      ((playlistRaw.body as Record<string, unknown> | undefined)?.playlist as Record<string, unknown> | undefined) ??
      ((playlistRaw.data as Record<string, unknown> | undefined)?.playlist as Record<string, unknown> | undefined);

    const trackIds = Array.isArray(playlistRecord?.trackIds)
      ? (playlistRecord.trackIds as Array<Record<string, unknown> | number | string>)
          .map((item) => {
            if (typeof item === "number" || typeof item === "string") {
              return String(item);
            }
            const id = (item as Record<string, unknown>)?.id;
            return typeof id === "number" || typeof id === "string" ? String(id) : "";
          })
          .filter(Boolean)
      : [];

    const songDetailRaw =
      !Array.isArray(playlistRecord?.tracks) || (playlistRecord.tracks as unknown[]).length === 0
        ? trackIds.length > 0
          ? await fetchNeteaseDebugJson("/song/detail", { ids: trackIds.slice(0, limit).join(",") }, cookie)
          : null
        : null;

    const songs =
      (songDetailRaw?.songs as unknown[] | undefined) ??
      ((songDetailRaw?.body as Record<string, unknown> | undefined)?.songs as unknown[] | undefined) ??
      ((songDetailRaw?.data as Record<string, unknown> | undefined)?.songs as unknown[] | undefined) ??
      [];

    const payload = extractPlaylistTracksDebugPayload(playlistRaw, limit, songs);

    return NextResponse.json({
      ...payload,
      debug: {
        ...payload.debug,
        hasCookie: true,
      },
    });
  } catch (error) {
    const reason = mapPlaylistTracksDebugError(error);
    const status =
      reason === "cookie_missing" ? 401 : reason === "playlist_id_missing" ? 400 : reason === "playlist_detail_api_error" ? 502 : 500;

    return NextResponse.json(
      {
        ok: false,
        reason,
        message: error instanceof Error ? error.message : "Failed to fetch playlist tracks",
      },
      { status },
    );
  }
}
