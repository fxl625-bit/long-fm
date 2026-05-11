import type { ProviderStatus, TodayDJPayload, ProgramTweak, PlaybackQueueItem, PlaybackSessionState } from "@/lib/types/music";
import { analyzeMusicProfile } from "@/lib/engines/music-profile-engine";
import { generateRadioProgram } from "@/lib/engines/radio-program-engine";
import { createMusicProvider, createMusicProviderForMode } from "@/lib/providers/music";
import { getUserMusicProfile, saveUserMusicProfile } from "@/lib/repositories/music-profile-repository";
import { fetchUserTracksFromDb, syncLibraryFromProvider } from "@/lib/repositories/music-sync-repository";
import { getPlaybackSession, upsertPlaybackSession } from "@/lib/repositories/playback-session-repository";
import { listRecentProgramTrackIds, saveRadioProgram } from "@/lib/repositories/radio-program-repository";
import { mapDbTrackToMusicTrack } from "@/lib/utils/mappers";
import { parseStructuredProfile } from "@/lib/utils/profile-json";
import { buildPlayableQueue, normalizeSessionQueue } from "@/lib/audio/radio-playback-state";

function toProviderStatus(provider: string, status: "available" | "degraded" | "metadata_only" | "unavailable", message: string): ProviderStatus {
  return {
    provider: provider as ProviderStatus["provider"],
    status,
    message,
  };
}

function queueFromProgram(program: Awaited<ReturnType<typeof generateRadioProgram>>): PlaybackQueueItem[] {
  const queue = program.tracksDetailed.map((item) => ({
    track: item.track,
    reason: item.reason,
    section: item.section,
  }));
  return buildPlayableQueue(queue);
}

function getCurrentFromSession(session: PlaybackSessionState) {
  if (!session.queue.length) {
    return null;
  }
  const index = Math.max(0, Math.min(session.currentIndex, session.queue.length - 1));
  return session.queue[index]?.track ?? null;
}

function titleByHour(hour: number): string {
  if (hour < 6) return "今晚先从轻一点开始";
  if (hour < 12) return "今天适合从轻快一点开始";
  if (hour < 18) return "下午这组先稳，再慢慢提节奏";
  return "今晚先给你一组顺耳的节目";
}

function defaultPromptByHour(hour: number): string {
  if (hour < 6) return "给我一组安静但不丧的夜间队列。";
  if (hour < 12) return "今天先来一组轻快通勤队列。";
  if (hour < 18) return "做一组适合工作时连播的节目。";
  return "今晚来一组顺滑、耐听、不过度激烈的节目。";
}

function tweakPrompt(tweak: ProgramTweak): string {
  switch (tweak) {
    case "more_nostalgic":
      return "换一组更怀旧一些，但不要太沉的节目。";
    case "less_sad":
      return "换一组少一点悲伤、情绪更轻的节目。";
    case "more_rhythm":
      return "换一组节奏更明显、但不要太炸的节目。";
    case "more_female_vocal":
      return "换一组女声占比更高的节目。";
    case "more_city_night":
      return "换一组更有城市流动感的节目。";
    case "more_chinese":
      return "换一组中文占比更高的节目。";
    case "fit_work":
      return "换一组更适合工作专注的节目。";
    case "fit_drive":
      return "换一组更适合开车连播的节目。";
    default:
      return "换一组更像我的节目。";
  }
}

async function ensureTracks(userId: string): Promise<{ tracks: Awaited<ReturnType<typeof fetchUserTracksFromDb>>; providerStatus: ProviderStatus }> {
  const existing = await fetchUserTracksFromDb(userId);
  if (existing.length) {
    const provider = createMusicProvider();
    const health = await provider.healthcheck();
    return {
      tracks: existing,
      providerStatus: toProviderStatus(health.mode, health.status, health.message ?? "音乐源可用。"),
    };
  }

  const provider = createMusicProvider();
  const health = await provider.healthcheck();

  if (health.available || health.status === "degraded" || health.status === "metadata_only") {
    try {
      await syncLibraryFromProvider(userId, provider);
      const synced = await fetchUserTracksFromDb(userId);
      if (synced.length) {
        return {
          tracks: synced,
          providerStatus: toProviderStatus(health.mode, health.status, health.message ?? "已同步音乐源。"),
        };
      }
    } catch {
      // continue demo fallback
    }
  }

  try {
    const demoProvider = createMusicProviderForMode("demo");
    await syncLibraryFromProvider(userId, demoProvider);
    const demoTracks = await fetchUserTracksFromDb(userId);
    if (demoTracks.length) {
      return {
        tracks: demoTracks,
        providerStatus: toProviderStatus("demo", "degraded", "当前音乐源暂时不可用，已切到演示源。"),
      };
    }
  } catch {
    // ignore
  }

  return {
    tracks: [],
    providerStatus: toProviderStatus(health.mode, "unavailable", health.message ?? "当前音乐源不可用。"),
  };
}

async function ensureProfile(userId: string, tracks: Awaited<ReturnType<typeof fetchUserTracksFromDb>>) {
  const profileRecord = await getUserMusicProfile(userId);
  if (profileRecord) {
    return parseStructuredProfile(profileRecord.structuredProfileJson);
  }

  const generated = await analyzeMusicProfile(tracks);
  await saveUserMusicProfile(userId, generated);
  return generated.structured;
}

async function buildNewQueue(input: {
  userId: string;
  prompt: string;
  tweak?: ProgramTweak;
}) {
  const ensured = await ensureTracks(input.userId);

  if (!ensured.tracks.length) {
    return {
      mode: "need_source" as const,
      title: "还没有可用音乐源",
      reason: "请先配置网易云官方源、本地音频目录，或使用演示源。",
      djLine: "我随时可以开始，先给我一个可用音乐源。",
      queue: [] as PlaybackQueueItem[],
      currentTrack: null,
      currentIndex: 0,
      providerStatus: ensured.providerStatus,
    };
  }

  const profile = await ensureProfile(input.userId, ensured.tracks);
  const tracks = ensured.tracks.map(mapDbTrackToMusicTrack);
  const avoidTrackIds = await listRecentProgramTrackIds(input.userId, 3, 36);

  const program = await generateRadioProgram({
    userPrompt: input.prompt,
    tracks,
    profile,
    desiredTrackCount: 16,
    tweak: input.tweak,
    avoidTrackIds,
    styleId: "daily-flow",
  });

  await saveRadioProgram(input.userId, program);

  const queue = queueFromProgram(program);
  if (!queue.length) {
    return {
      mode: "need_source" as const,
      title: "当前没有可播放歌曲",
      reason: "歌曲元数据已同步，但缺少可播放音源。",
      djLine: "我已经拿到你的口味，但这批歌曲暂时无法直接播放。",
      queue,
      currentTrack: null,
      currentIndex: 0,
      providerStatus: ensured.providerStatus,
    };
  }

  const state: PlaybackSessionState = {
    currentTrackId: queue[0]?.track.id,
    queue,
    currentIndex: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 0.85,
    source: queue[0]?.track.sourceType ?? "DEMO",
  };
  await upsertPlaybackSession(input.userId, state);

  return {
    mode: ensured.providerStatus.provider === "demo" ? "demo" : "today_recommendation",
    title: program.title,
    reason: program.vibeDescription,
    djLine: program.introText,
    queue,
    currentTrack: queue[0]?.track ?? null,
    currentIndex: 0,
    providerStatus: ensured.providerStatus,
  } as TodayDJPayload;
}

export async function getTodayDJPayload(userId: string): Promise<TodayDJPayload> {
  const session = await getPlaybackSession(userId);

  if (session?.queue?.length) {
    const normalized = normalizeSessionQueue(session);
    if (normalized.currentTrackId !== session.currentTrackId || normalized.queue.length !== session.queue.length) {
      await upsertPlaybackSession(userId, normalized);
    }
    if (normalized.queue.length) {
      const provider = createMusicProvider();
      const health = await provider.healthcheck();
      const currentTrack = getCurrentFromSession(normalized);

      return {
        mode: "resume",
        title: "你的 DJ 已经准备好了",
        reason: "已恢复你上次的播放队列。",
        djLine: "我保留了你上次的节奏，可以直接继续播放。",
        queue: normalized.queue,
        currentTrack,
        currentIndex: normalized.currentIndex,
        providerStatus: toProviderStatus(health.mode, health.status, health.message ?? "音乐源已就绪。"),
      };
    }
  }

  const hour = new Date().getHours();
  const generated = await buildNewQueue({
    userId,
    prompt: defaultPromptByHour(hour),
  });

  if (generated.mode === "today_recommendation" || generated.mode === "demo") {
    return {
      ...generated,
      title: titleByHour(hour),
      reason: generated.reason,
    };
  }

  return generated;
}

export async function refreshTodayDJ(userId: string): Promise<TodayDJPayload> {
  return buildNewQueue({
    userId,
    prompt: "换一组更顺滑、耐听、少重复的节目。",
  });
}

export async function tuneTodayDJ(userId: string, tweak: ProgramTweak, prompt?: string): Promise<TodayDJPayload> {
  return buildNewQueue({
    userId,
    tweak,
    prompt: prompt?.trim() || tweakPrompt(tweak),
  });
}

export async function getProviderStatuses() {
  const official = createMusicProviderForMode("netease_official");
  const local = createMusicProviderForMode("local");
  const demo = createMusicProviderForMode("demo");
  const experimental = createMusicProviderForMode("netease_experimental");

  const [s1, s2, s3, s4] = await Promise.all([
    official.healthcheck(),
    local.healthcheck(),
    demo.healthcheck(),
    experimental.healthcheck(),
  ]);

  return [
    toProviderStatus("netease_official", s1.status, s1.message ?? ""),
    toProviderStatus("local", s2.status, s2.message ?? ""),
    toProviderStatus("demo", s3.status, s3.message ?? ""),
    toProviderStatus("netease_experimental", s4.status, s4.message ?? ""),
  ];
}
