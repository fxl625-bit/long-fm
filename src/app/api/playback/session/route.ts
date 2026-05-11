import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/actions/session";
import { NeteaseClient } from "@/lib/providers/netease/netease-client";
import { getNeteaseSessionForUser } from "@/lib/providers/netease/netease-auth";
import { NeteasePlayableService } from "@/lib/providers/netease/netease-playable-service";
import { getPlaybackSession, upsertPlaybackSession } from "@/lib/repositories/playback-session-repository";
import { playbackSessionUpdateSchema } from "@/lib/types/api";
import type { PlaybackQueueItem, PlaybackSessionState } from "@/lib/types/music";
import { buildPlayableQueue, normalizeSessionQueue } from "@/lib/audio/radio-playback-state";

type PlaybackBootstrapResult = {
  session: PlaybackSessionState;
  resolveReport?: unknown;
};

function buildStateFromQueue(queue: PlaybackQueueItem[]): PlaybackSessionState {
  const playableQueue = buildPlayableQueue(queue);
  return {
    currentTrackId: playableQueue[0]?.track.id,
    queue: playableQueue,
    currentIndex: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    source: playableQueue[0]?.track.sourceType ?? "NETEASE_EXPERIMENTAL",
  };
}

async function bootstrapPlaybackSession(userId: string): Promise<PlaybackBootstrapResult> {
  const providerSession = await getNeteaseSessionForUser(userId);
  const cookie = providerSession?.cookie?.trim();

  if (cookie) {
    const client = new NeteaseClient();
    const playlists = await client.getUserPlaylists(cookie).catch(() => []);
    const likedPlaylist = playlists.find((item) => item.isLikedPlaylist) ?? playlists[0];

    if (likedPlaylist?.id) {
      const service = new NeteasePlayableService({
        client,
        cookieResolver: async () => cookie,
      });
      const result = await service.buildPlayableQueue(likedPlaylist.id, { limit: 24 });

      if (result.playableTracks.length) {
        const queue: PlaybackQueueItem[] = result.playableTracks.map((track) => ({
          track: {
            id: track.id,
            name: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.durationMs ?? 0,
            durationMs: track.durationMs ?? 0,
            coverUrl: track.coverUrl,
            audioUrl: track.audioUrl,
            sourceType: "NETEASE_EXPERIMENTAL",
            playableStatus: "playable",
            rawMeta: {
              providerTrackId: track.neteaseId,
            },
          },
          section: "build",
        }));

        const state = buildStateFromQueue(queue);
        await upsertPlaybackSession(userId, state);
        return { session: state, resolveReport: result };
      }
    }
  }

  const state: PlaybackSessionState = {
    currentTrackId: undefined,
    queue: [],
    currentIndex: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    source: "NETEASE_EXPERIMENTAL",
  };

  await upsertPlaybackSession(userId, state);
  return { session: state };
}

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const existingSession = await getPlaybackSession(user.id);
    const bootstrapped = existingSession ? null : await bootstrapPlaybackSession(user.id);
    const session =
      existingSession ??
      bootstrapped?.session ?? {
        currentTrackId: undefined,
        queue: [],
        currentIndex: 0,
        currentTime: 0,
        isPlaying: false,
        volume: 0.85,
        source: "NETEASE_EXPERIMENTAL" as const,
      };
    const normalized = normalizeSessionQueue(session);
    const resolveReport = bootstrapped?.resolveReport;
    if (
      normalized.currentTrackId !== session.currentTrackId ||
      normalized.queue.length !== session.queue.length ||
      normalized.currentIndex !== session.currentIndex
    ) {
      await upsertPlaybackSession(user.id, normalized);
    }

    return NextResponse.json({
      ok: true,
      session: normalized,
      resolveReport,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load playback session",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const body = await request.json().catch(() => ({}));
    const parsed = playbackSessionUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid playback session payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;

    const queue = buildPlayableQueue(
      payload.queue.map((item) => ({
        track: item.track as unknown as PlaybackQueueItem["track"],
        reason: item.reason,
        section: item.section,
      })),
    );

    let nextState: PlaybackSessionState = {
      currentTrackId: payload.currentTrackId,
      queue,
      currentIndex: payload.currentIndex,
      currentTime: payload.currentTime,
      isPlaying: payload.isPlaying,
      volume: payload.volume,
      source: payload.source,
    };

    if (!nextState.currentTrackId && nextState.queue.length) {
      nextState.currentTrackId = nextState.queue[Math.max(0, Math.min(nextState.currentIndex, nextState.queue.length - 1))]?.track.id;
    }
    nextState = normalizeSessionQueue(nextState);

    await upsertPlaybackSession(user.id, nextState);

    return NextResponse.json({
      ok: true,
      session: nextState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to save playback session",
      },
      { status: 500 },
    );
  }
}
