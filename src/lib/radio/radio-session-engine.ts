import { DJHostingScheduler } from "@/lib/dj/dj-hosting-scheduler";
import { DJVoiceQueue } from "@/lib/dj/dj-voice-queue";
import { DJDirector } from "@/lib/dj/dj-director";
import { guardDJLines } from "@/lib/dj/final-dj-line-guard";
import { getQueuePatchTrackId, selectTracksForDirection } from "@/lib/dj/queue-selector";
import { buildListeningContext } from "@/lib/dj/dj-context-builder";
import type {
  DJDirectingDecision,
  DJDirectorTrigger,
  DJHostDebugState,
  DJProgramPlan,
  DJSpeakAttempt,
  DJTalkBreakEvent,
  DJTalkBreakResult,
  ListeningContext,
  UserMusicMemory,
} from "@/lib/dj/dj-types";
import { buildDJMemory } from "@/lib/dj/dj-memory";
import type { PlaybackQueueItem } from "@/lib/types/music";
import type { AudioEngine } from "./audio-engine";
import type { DJEngine } from "./dj-engine";
import type { RadioStore } from "./radio-store";
import { summarizeResolveResult } from "@/lib/providers/netease/netease-playable-resolver";
import type { BuildQueueResult } from "@/lib/providers/netease/netease-playable-service";
import { buildPlayableQueue, toTrack } from "./track-queue";
import { buildTrackIndex, resolvePatchTrackIds } from "./track-index";
import { buildRadioTimeline } from "./timeline-engine";
import type { QueuePatchResult, RadioState, Track } from "./radio-types";

type PlanApiResponse = {
  ok: boolean;
  plan?: DJProgramPlan;
  memory?: UserMusicMemory;
  context?: ListeningContext;
  candidateTracks?: Track[];
  message?: string;
};

type SessionResolveReport = {
  stats: {
    total: number;
    playable: number;
    noUrl: number;
    vipOnly: number;
    copyrightUnavailable: number;
    apiError: number;
    unknown: number;
  };
  failedTracks: Array<{ id?: string; title?: string; artist?: string; reason?: string; raw?: unknown }>;
  usedSearchFallback: boolean;
  progress: {
    current: number;
    total: number;
  };
  lastSongUrlRawShape?: string;
};

function clampIndex(index: number, queueLength: number) {
  if (!queueLength) return 0;
  return Math.max(0, Math.min(index, queueLength - 1));
}

function nowPlayingDebug(state: RadioState, audioEngine: AudioEngine) {
  return {
    currentTrackTitle: state.currentTrack?.title ?? null,
    currentTrackArtist: state.currentTrack?.artist ?? null,
    currentTrackAudioUrl: state.currentTrack?.audioUrl ?? null,
    audioCurrentSrc: audioEngine.getCurrentSrc(),
    currentIndex: state.currentIndex,
    playableQueueLength: state.playableQueue.length,
    status: state.status,
    currentSubtitle: state.currentSubtitle,
  };
}

function normalizeResolveReport(raw: unknown): SessionResolveReport | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const report = raw as Record<string, unknown>;
  const stats = report.stats && typeof report.stats === "object" ? (report.stats as Record<string, unknown>) : {};
  const total = typeof stats.total === "number" ? stats.total : typeof report.total === "number" ? report.total : 0;
  const playable = typeof stats.playable === "number" ? stats.playable : 0;
  const noUrl = typeof stats.noUrl === "number" ? stats.noUrl : 0;
  const vipOnly = typeof stats.vipOnly === "number" ? stats.vipOnly : 0;
  const copyrightUnavailable = typeof stats.copyrightUnavailable === "number" ? stats.copyrightUnavailable : 0;
  const apiError = typeof stats.apiError === "number" ? stats.apiError : 0;
  const unknown = typeof stats.unknown === "number" ? stats.unknown : 0;
  const failedTracks = Array.isArray(report.failedTracks) ? (report.failedTracks as SessionResolveReport["failedTracks"]) : [];
  const progressRecord = report.progress && typeof report.progress === "object" ? (report.progress as Record<string, unknown>) : {};

  return {
    stats: {
      total,
      playable,
      noUrl,
      vipOnly,
      copyrightUnavailable,
      apiError,
      unknown,
    },
    failedTracks,
    usedSearchFallback: Boolean(report.usedSearchFallback),
    progress: {
      current: typeof progressRecord.current === "number" ? progressRecord.current : total,
      total: typeof progressRecord.total === "number" ? progressRecord.total : total,
    },
    lastSongUrlRawShape: typeof report.lastSongUrlRawShape === "string" ? report.lastSongUrlRawShape : undefined,
  };
}

function toPlaybackSourceType(sourceType?: Track["sourceType"]) {
  if (sourceType === "local") return "LOCAL" as const;
  if (sourceType === "public") return "PUBLIC" as const;
  if (sourceType === "netease") return "NETEASE_EXPERIMENTAL" as const;
  if (sourceType === "external") return "GENERIC_API" as const;
  return "DEMO" as const;
}

function canHostNow(state: RadioState) {
  return Boolean(
    state.unlockedByUser &&
      state.isPlaying &&
      state.currentTrack &&
      state.status !== "paused" &&
      state.status !== "ended" &&
      state.status !== "error",
  );
}

function createAttemptId() {
  return `dj-speak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyAttempt(event: DJSpeakAttempt["event"], schedulerTriggered: boolean): DJSpeakAttempt {
  return {
    id: createAttemptId(),
    event,
    createdAt: new Date().toISOString(),
    schedulerTriggered,
    deepseekCalled: false,
    deepseekUsedFallback: false,
    rawLines: [],
    qualityChecked: false,
    qualityPass: false,
    qualityFailures: [],
    guardChecked: false,
    safeLines: [],
    blockedLines: [],
    rewriteAttempted: false,
    rewriteLines: [],
    rewritePass: false,
    rewriteFailures: [],
    fallbackUsed: false,
    fallbackLines: [],
    finalLines: [],
    ttsCalled: false,
    subtitleShown: false,
    queueEnqueued: false,
    queuePlayed: false,
  };
}

function createHostDebugState(): DJHostDebugState {
  return {
    state: "idle",
    schedulerRunning: false,
    openingDone: false,
    openingLinesAttempted: [],
    openingLinesSpoken: [],
    openingBlockedLines: [],
    currentTrackIntroDoneTrackId: null,
    playedCount: 0,
    lastBridgeAt: null,
    lastSpokenAt: null,
    lastTalkBreakEvent: null,
    lastTalkBreakPattern: null,
    lastGuardResult: null,
    lastBlockedLines: [],
    recentDJLines: [],
    lastSchedulerEvent: null,
    eventTriggeredAt: null,
    pendingTalkBreaks: [],
    lastTalkBreakFailed: false,
    lastTalkBreakFailureReason: null,
    consecutiveTalkFailures: 0,
    lastSpeakAt: null,
    tracksSinceLastSpeak: 0,
    minutesSinceLastSpeak: 0,
    forcedSpeakTriggered: false,
  };
}

export class RadioSessionEngine {
  private static readonly PAUSE_CONFIRMATION_MS = 350;
  private static readonly FORCE_SPEAK_MAX_SILENT_TRACKS = 2;
  private static readonly FORCE_SPEAK_MAX_SILENT_MINUTES = 6;
  private playedCount = 0;
  private recentPlayed: Track[] = [];
  private recentSkipped: Track[] = [];
  private hostingStarted = false;
  private persistedTime = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPauseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastContextSlot: ListeningContext["timeOfDay"] | null = null;
  private userMemory: UserMusicMemory | null = null;
  private listeningContext: ListeningContext | null = null;
  private directorDecisionInFlight = false;
  private lastSpeakTimestamp: number | null = null;
  private nextSpeechTrackThreshold = 2;
  private preparedOpeningSpeech: string | null = null;
  private pendingDirectorRequests: Array<{
    trigger: DJDirectorTrigger;
    userIntent?: string;
    event?: DJTalkBreakEvent;
  }> = [];
  private advancingTrack = false;
  private hostDebugState: DJHostDebugState = createHostDebugState();
  private readonly voiceQueue: DJVoiceQueue;
  private readonly hostingScheduler: DJHostingScheduler;
  private readonly director: DJDirector;

  constructor(
    private readonly store: RadioStore,
    private readonly audioEngine: AudioEngine,
    private readonly djEngine: DJEngine,
    deps: {
      voiceQueue?: DJVoiceQueue;
      hostingScheduler?: DJHostingScheduler;
      director?: DJDirector;
    } = {},
  ) {
    this.director = deps.director ?? new DJDirector();
    this.voiceQueue =
      deps.voiceQueue ??
      new DJVoiceQueue({
        djEngine: this.djEngine,
        onBlocked: (blockedLines) => {
          this.hostingScheduler?.noteGuardResult?.(this.eventFromDecisionPrompt(this.store.getState().lastDecisionPromptType), {
            ok: false,
            safeLines: [],
            blockedLines,
          });
          this.store.setState({
            lastBlockedDJLines: [...(this.store.getState().lastBlockedDJLines ?? []), ...blockedLines].slice(-12),
          });
        },
      });
    this.hostingScheduler =
      deps.hostingScheduler ??
      new DJHostingScheduler({
        voiceQueue: this.voiceQueue,
        requestDecision: (trigger, payload) => this.requestDirectorDecision(trigger, payload?.intent, payload?.event),
        canHostNow: () => canHostNow(this.store.getState()),
        onDebugChange: (debug) => this.setHostDebug(debug),
      });
    this.setHostDebug(this.hostDebugState);
  }

  async loadNeteaseQueue(
    result: BuildQueueResult,
    options?: {
      programPlan?: DJProgramPlan;
      planningDebug?: {
        provider?: string;
        usedFallback?: boolean;
        error?: string | null;
        rawPrompt?: string;
        rawResponse?: string;
      };
    },
  ) {
    const rawQueue: Track[] = result.playableTracks.map((track) => ({
      id: track.id,
      providerTrackId: track.providerTrackId,
      neteaseId: track.neteaseId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      durationMs: track.durationMs,
      sourceType: "netease",
      playableStatus: "playable",
      tags: {
        mood: [],
        style: [],
        energy: "medium",
      },
    }));

    const queueBuild = buildPlayableQueue(rawQueue);
    const playableQueue = queueBuild.playableQueue;
    if (!playableQueue.length) {
      this.store.setState({
        status: "need_playable_tracks",
        queue: [],
        playableQueue: [],
        currentIndex: 0,
        currentTrack: null,
        currentSubtitle: "歌单已经连上了，但这次还没有拿到可播放歌曲。",
        providerStatus: {
          provider: "netease",
          status: "degraded",
          message: `共解析 ${result.stats.total} 首，成功 ${result.stats.playable} 首，失败 ${result.stats.failed} 首。`,
        },
        resolveStats: {
          total: result.stats.total,
          playable: result.stats.playable,
          noUrl: result.stats.noUrl,
          vipOnly: result.stats.vipOnly,
          copyrightUnavailable: result.stats.copyrightUnavailable,
          apiError: result.stats.apiError,
          unknown: result.stats.failed - result.stats.noUrl - result.stats.vipOnly - result.stats.copyrightUnavailable - result.stats.apiError,
        },
        resolvingProgress: {
          current: result.stats.total,
          total: result.stats.total,
        },
      });
      return;
    }

    const programPlan = options?.programPlan;
    const orderedQueue = programPlan ? this.reorderQueueForProgram(playableQueue, programPlan) : playableQueue;
    const currentTrack = orderedQueue[0];
    const beforeProgramProviderIds = playableQueue.map((track) => getQueuePatchTrackId(track));
    const afterProgramProviderIds = orderedQueue.map((track) => getQueuePatchTrackId(track));
    this.playedCount = 0;
    this.recentPlayed = [];
    this.recentSkipped = [];
    this.hostingStarted = false;
    this.lastSpeakTimestamp = null;
    this.directorDecisionInFlight = false;
    this.preparedOpeningSpeech = null;
    this.pendingDirectorRequests = [];
    this.advancingTrack = false;
    this.nextSpeechTrackThreshold = 2;
    this.userMemory = await buildDJMemory({
      tracks: orderedQueue,
      recentPlayed: [],
      recentSkipped: [],
    });
    this.listeningContext = buildListeningContext(new Date());
    this.lastContextSlot = this.listeningContext.timeOfDay;
    this.voiceQueue.clear();
    this.resetHostDebug();

    this.store.setState({
      status: "ready",
      unlockedByUser: false,
      queue: orderedQueue,
      playableQueue: orderedQueue,
      currentIndex: 0,
      currentTrack,
      queueVersion: 1,
      timeline: [],
      currentSubtitle: `频道已经接好，从《${currentTrack.title}》开始。`,
      subtitleHistory: [],
      preparedOpeningSpeech: undefined,
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: currentTrack.durationMs ?? 0,
      currentProgram: programPlan,
      currentDecision: undefined,
      providerStatus: {
        provider: "netease",
        status: "available",
        message: `${result.playlistName} · 已准备 ${orderedQueue.length} 首真实歌曲`,
      },
      resolveStats: {
        total: result.stats.total,
        playable: result.stats.playable,
        noUrl: result.stats.noUrl,
        vipOnly: result.stats.vipOnly,
        copyrightUnavailable: result.stats.copyrightUnavailable,
        apiError: result.stats.apiError,
        unknown: result.stats.failed - result.stats.noUrl - result.stats.vipOnly - result.stats.copyrightUnavailable - result.stats.apiError,
      },
      resolvingProgress: {
        current: result.stats.total,
        total: result.stats.total,
      },
      lastProgramPlanProvider: options?.planningDebug?.provider,
      lastProgramPlanUsedFallback: options?.planningDebug?.usedFallback,
      lastProgramPlanError: options?.planningDebug?.error ?? undefined,
      lastProgramPlanRawPrompt: options?.planningDebug?.rawPrompt,
      lastProgramPlanRawResponse: options?.planningDebug?.rawResponse,
      lastProgramPlanQueueBeforeProviderIds: beforeProgramProviderIds,
      lastProgramPlanQueueAfterProviderIds: afterProgramProviderIds,
      lastProgramPlanQueueChanged: beforeProgramProviderIds.join(",") !== afterProgramProviderIds.join(","),
      djBrainFallbackActive: Boolean(options?.planningDebug?.usedFallback),
      error: undefined,
    });

    this.audioEngine.setTrack(currentTrack, 0);
    this.persistSession();
  }

  private reorderQueueForProgram(queue: Track[], programPlan: DJProgramPlan) {
    const byProviderId = new Map(queue.map((track) => [getQueuePatchTrackId(track), track]));
    const selected: Track[] = [];
    const seen = new Set<string>();

    for (const providerTrackId of programPlan.queueTrackIds) {
      const track = byProviderId.get(providerTrackId);
      if (!track || seen.has(track.id)) {
        continue;
      }
      selected.push(track);
      seen.add(track.id);
    }

    for (const track of queue) {
      if (seen.has(track.id)) {
        continue;
      }
      selected.push(track);
      seen.add(track.id);
    }

    return selected;
  }

  async bootstrap() {
    this.store.setState({
      status: "tuning",
      error: undefined,
      currentSubtitle: "正在调到你的私人频道...",
    });

    const session = await fetch("/api/playback/session")
      .then((res) => res.json())
      .catch(() => null);

    let baseQueue: Track[] = [];
    if (session?.ok && Array.isArray(session.session?.queue)) {
      const queueItems = session.session.queue as PlaybackQueueItem[];
      baseQueue = queueItems.map(toTrack);
    }
    const resolveReport = normalizeResolveReport(session?.resolveReport);

    if (!baseQueue.length && resolveReport && resolveReport.stats.total > 0 && resolveReport.stats.playable === 0) {
      const providerMessage = summarizeResolveResult({
        playableTracks: [],
        failedTracks: resolveReport.failedTracks.map((track) => ({
          id: track.id ?? "unknown",
          title: track.title ?? "Unknown track",
          artist: track.artist ?? "Unknown artist",
          reason: (track.reason ?? "unknown") as "no_url" | "vip_only" | "copyright_unavailable" | "api_error" | "invalid_response" | "unknown",
          raw: track.raw,
        })),
        stats: resolveReport.stats,
        usedSearchFallback: resolveReport.usedSearchFallback,
        progress: resolveReport.progress,
        lastSongUrlRawShape: resolveReport.lastSongUrlRawShape,
      });
      const subtitle = "歌单我已经读到了，但这次还没拿到可播放链接。你可以换个歌单，或者继续看解析报告。";

      this.store.setState({
        status: "need_playable_tracks",
        error: providerMessage,
        currentSubtitle: subtitle,
        providerStatus: {
          provider: "netease",
          status: "degraded",
          message: providerMessage,
        },
        resolvingProgress: resolveReport.progress,
        resolveStats: resolveReport.stats,
        lastSongUrlRawShape: resolveReport.lastSongUrlRawShape,
      });

      await this.voiceQueue.enqueue([subtitle]);
      this.store.setState({
        status: "need_playable_tracks",
        isSpeaking: false,
        providerStatus: {
          provider: "netease",
          status: "degraded",
          message: providerMessage,
        },
      });
      return;
    }

    const planResponse = await this.requestPlan(baseQueue);
    if (!planResponse.ok || !planResponse.plan || !planResponse.candidateTracks?.length) {
      this.store.setState({
        status: "need_source",
        error: planResponse.message ?? "当前没有可用的音乐源，请先接入正式播放队列。",
        currentSubtitle: "当前没有可用的音乐源，我还接不上节目。",
        providerStatus: {
          provider: "auto",
          status: "unavailable",
          message: "当前没有可用的音乐源",
        },
      });
      return;
    }

    this.applyProgram(planResponse.plan, planResponse.candidateTracks, {
      memory: planResponse.memory,
      context: planResponse.context,
      providerStatus: {
        provider: "auto",
        status: "available",
        message: "节目已经准备好",
      },
    });
    if (resolveReport) {
      this.store.setState({
        resolvingProgress: resolveReport.progress,
        resolveStats: resolveReport.stats,
        lastSongUrlRawShape: resolveReport.lastSongUrlRawShape,
      });
    }

    await this.tryAutoPlay();
  }

  private async requestPlan(candidateTracks: Track[]): Promise<PlanApiResponse> {
    const payload = candidateTracks.length ? { candidateTracks } : {};
    const response = await fetch("/api/dj/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .catch(() => ({ ok: false, message: "DJ plan API unavailable" }));
    return response as PlanApiResponse;
  }

  private applyProgram(
    program: DJProgramPlan,
    candidateTracks: Track[],
    extra: {
      memory?: UserMusicMemory;
      context?: ListeningContext;
      providerStatus: RadioState["providerStatus"];
    },
  ) {
    const candidateMap = new Map<string, Track>();
    for (const track of candidateTracks) {
      candidateMap.set(track.id, track);
      candidateMap.set(getQueuePatchTrackId(track), track);
    }
    const queue = program.queueTrackIds.map((id) => candidateMap.get(id)).filter((item): item is Track => Boolean(item));
    const queueBuild = buildPlayableQueue(queue);
    const playableQueue = queueBuild.playableQueue;

    if (!playableQueue.length) {
      this.store.setState({
        status: "need_playable_tracks",
        queue,
        playableQueue,
        currentTrack: null,
        currentIndex: 0,
        error: "节目队列里还没有可播放歌曲。",
        currentSubtitle: "节目已经排好了，但这次队列里没有拿到可播放歌曲。",
        currentProgram: program,
        providerStatus: extra.providerStatus,
      });
      return;
    }

    const currentTrack = playableQueue[0];
    const timeline = buildRadioTimeline(playableQueue, program);

    this.playedCount = 0;
    this.recentPlayed = [];
    this.recentSkipped = [];
    this.hostingStarted = false;
    this.lastSpeakTimestamp = null;
    this.directorDecisionInFlight = false;
    this.pendingDirectorRequests = [];
    this.advancingTrack = false;
    this.nextSpeechTrackThreshold = 2;
    this.userMemory = extra.memory ?? null;
    this.listeningContext = extra.context ?? buildListeningContext(new Date());
    this.lastContextSlot = this.listeningContext.timeOfDay;
    this.voiceQueue.clear();
    this.resetHostDebug();

    this.store.setState({
      status: "tuning",
      unlockedByUser: false,
      queue,
      playableQueue,
      currentIndex: 0,
      currentTrack,
      queueVersion: 1,
      timeline,
      currentSubtitle: "频道已经排好，正在接入你的频道。",
      subtitleHistory: [],
      isPlaying: false,
      isSpeaking: false,
      currentTime: 0,
      duration: currentTrack.durationMs ?? 0,
      volume: this.store.getState().volume,
      currentProgram: program,
      currentDecision: undefined,
      providerStatus: extra.providerStatus,
      error: undefined,
    });

    this.audioEngine.setTrack(currentTrack, 0);
    this.persistSession();
  }

  private async tryAutoPlay() {
    const state = this.store.getState();
    const currentTrack = state.currentTrack;
    if (!currentTrack) {
      return;
    }

    try {
      await this.audioEngine.play();
      this.store.setState({
        status: "on_air",
        isPlaying: true,
      });
      this.markHostingStarted();
      void this.requestDirectorDecision("opening");
    } catch {
      this.store.setState({
        status: "locked",
        isPlaying: false,
        currentSubtitle: "频道已经准备好了。浏览器先把声音拦住了，再点一下就能接入频道。",
      });
    }
  }

  async enterChannel() {
    const state = this.store.getState();
    const currentTrack = state.currentTrack;
    if (!currentTrack) {
      return;
    }

    this.audioEngine.unlockByUserGesture();
    this.audioEngine.setTrack(currentTrack, state.currentTime);
    const playPromise = this.audioEngine.play();
    this.store.setState({
      status: "on_air",
      unlockedByUser: true,
      isPlaying: true,
    });

    this.markHostingStarted();
    if (this.preparedOpeningSpeech) {
      void this.playPreparedOpening();
    } else {
      void this.requestDirectorDecision("opening");
    }
    try {
      await playPromise;
    } catch (error) {
      this.store.setState({
        status: "locked",
        isPlaying: false,
        currentSubtitle: "频道已经接上了。声音暂时没有出来，轻点页面就能恢复。",
      });
      throw error;
    }
  }

  async playTrack(index: number) {
    const state = this.store.getState();
    const nextIndex = clampIndex(index, state.playableQueue.length);
    const nextTrack = state.playableQueue[nextIndex] ?? null;
    if (!nextTrack) {
      return;
    }

    this.store.setState({
      currentIndex: nextIndex,
      currentTrack: nextTrack,
      currentTime: 0,
      duration: nextTrack.durationMs ?? 0,
      status: this.voiceQueue.isActive() ? "speaking" : state.unlockedByUser || this.audioEngine.isUnlockedByGesture() ? "playing" : "ready",
    });
    this.audioEngine.setTrack(nextTrack, 0);

    if (state.unlockedByUser || this.audioEngine.isUnlockedByGesture()) {
      try {
        await this.audioEngine.play();
        this.store.setState({ isPlaying: true, status: this.voiceQueue.isActive() ? "speaking" : "playing" });
      } catch {
        this.store.setState({ status: "locked", isPlaying: false });
      }
    }

    this.persistSession();
  }

  async nextTrack() {
    const state = this.store.getState();
    if (state.currentIndex >= state.playableQueue.length - 1) {
      this.store.setState({ status: "ended", isPlaying: false, currentTime: 0 });
      this.updateHostDebug({
        state: "ended",
        schedulerRunning: false,
      });
      return;
    }

    await this.playTrack(state.currentIndex + 1);
  }

  async previousTrack() {
    const state = this.store.getState();
    if (state.currentIndex <= 0) {
      return;
    }
    await this.playTrack(state.currentIndex - 1);
  }

  pause() {
    this.clearPendingPauseTimer();
    this.audioEngine.pause();
    this.store.setState({ status: "paused", isPlaying: false });
    this.updateHostDebug({ state: "paused", schedulerRunning: false });
    this.persistSession();
  }

  async resume() {
    try {
      this.clearPendingPauseTimer();
      await this.audioEngine.play();
      this.store.setState({ status: this.voiceQueue.isActive() ? "speaking" : "playing", isPlaying: true, unlockedByUser: true });
      this.markHostingStarted();
      void this.requestDirectorDecision("introduce_current");
      this.persistSession();
    } catch {
      this.store.setState({ status: "locked", isPlaying: false });
    }
  }

  setVolume(volume: number) {
    this.audioEngine.setVolume(volume);
    this.store.setState({ volume });
    this.persistSession();
  }

  seek(timeMs: number) {
    const state = this.store.getState();
    if (!state.currentTrack) {
      return;
    }
    this.audioEngine.setTrack(state.currentTrack, timeMs);
    this.store.setState({ currentTime: timeMs });
    if (state.isPlaying) {
      void this.audioEngine.play().catch(() => undefined);
    }
    this.persistedTime = timeMs;
    this.persistSession();
  }

  async refreshProgram() {
    const state = this.store.getState();
    const response = await this.requestPlan(state.queue.length ? state.queue : state.playableQueue);
    if (!response.ok || !response.plan || !response.candidateTracks?.length) {
      return;
    }
    this.applyProgram(response.plan, response.candidateTracks, {
      memory: response.memory,
      context: response.context,
      providerStatus: state.providerStatus,
    });
    await this.enterChannel();
  }

  async tuneByPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content) {
      return;
    }
    await this.requestDirectorDecision("user_tune", content);
  }

  async testSpeakPipeline(event: DJSpeakAttempt["event"]) {
    const directorTrigger =
      event === "opening"
        ? "opening"
        : event === "track_intro"
          ? "introduce_current"
          : event === "bridge"
            ? "bridge_to_next"
            : event === "user_tune"
              ? "user_tune"
              : event === "outro"
                ? "music_ended"
                : null;
    if (directorTrigger) {
      const talkBreakEvent: DJTalkBreakEvent =
        event === "opening" || event === "track_intro" || event === "bridge" || event === "user_tune" || event === "outro"
          ? event
          : "track_intro";
      await this.requestDirectorDecision(directorTrigger, undefined, talkBreakEvent);
      return;
    }

    const attemptId = this.createSpeakAttempt(event, false);

    this.updateSpeakAttempt(attemptId, {
      rawLines: [],
      fallbackUsed: false,
      fallbackLines: [],
      skippedReason: "manual_event_without_director_path",
    });
  }

  async prepareOpening() {
    const state = this.store.getState();
    if (this.preparedOpeningSpeech || state.preparedOpeningSpeech) {
      return this.preparedOpeningSpeech ?? state.preparedOpeningSpeech ?? null;
    }
    if (!state.currentTrack || !state.playableQueue.length) {
      return null;
    }

    const context = await this.buildDirectorContext();
    if (!context) {
      return null;
    }

    let decision: DJDirectingDecision;
    try {
      decision = await this.director.decide("opening", context);
    } catch {
      return null;
    }

    const speech = decision.lines[0]?.trim();
    if (!decision.shouldSpeak || !speech) {
      return null;
    }

    this.preparedOpeningSpeech = speech;
    this.store.setState({
      preparedOpeningSpeech: speech,
      lastDecisionProvider: decision.meta?.provider,
      lastDecisionUsedFallback: decision.meta?.usedFallback,
      lastDecisionFallbackReason: decision.meta?.fallbackReason,
      lastDecisionRawPrompt: decision.meta?.rawPrompt,
      lastDecisionRawResponse: decision.meta?.rawResponse,
      lastDecisionPromptType: decision.meta?.promptType,
      djBrainFallbackActive: Boolean(decision.meta?.usedFallback),
    });
    return speech;
  }

  async applyDJDecision(
    decision: DJDirectingDecision,
    speakContext: { event?: DJSpeakAttempt["event"]; attemptId?: string; schedulerTriggered?: boolean } = {},
  ): Promise<{ queuePatchResult: QueuePatchResult; decision: DJDirectingDecision }> {
    const state = this.store.getState();
    const currentTrack = state.currentTrack;
    if (!currentTrack) {
      return {
        decision,
        queuePatchResult: this.createQueuePatchResult({
          mode: decision.queuePatch?.mode ?? "none",
          resolvedTrackIds: [],
          unresolvedTrackIds: decision.queuePatch?.trackIds ?? [],
          before: this.captureUpcomingIds(state.playableQueue),
          after: this.captureUpcomingIds(state.playableQueue),
          changed: false,
          noopReason: "no_resolved_tracks",
        }),
      };
    }

    if (decision.action === "stop_talking") {
      this.voiceQueue.clear();
      const queuePatchResult = this.createQueuePatchResult({
        mode: "none",
        resolvedTrackIds: [],
        unresolvedTrackIds: [],
        before: this.captureUpcomingIds(state.playableQueue),
        after: this.captureUpcomingIds(state.playableQueue),
        changed: false,
        noopReason: "no_patch",
      });
      this.store.setState({
        currentDecision: decision,
        isSpeaking: false,
        status: state.isPlaying ? "playing" : state.status,
        lastQueuePatchApplied: queuePatchResult.applied,
        lastQueuePatchBeforeIds: queuePatchResult.beforeUpcomingProviderIds,
        lastQueuePatchAfterIds: queuePatchResult.afterUpcomingProviderIds,
        lastQueuePatchBeforeProviderIds: queuePatchResult.beforeUpcomingProviderIds,
        lastQueuePatchAfterProviderIds: queuePatchResult.afterUpcomingProviderIds,
        lastQueuePatchBeforeInternalIds: queuePatchResult.beforeUpcomingInternalIds,
        lastQueuePatchAfterInternalIds: queuePatchResult.afterUpcomingInternalIds,
        lastQueuePatchResolvedIds: queuePatchResult.resolvedTrackIds,
        lastQueuePatchUnresolvedIds: queuePatchResult.unresolvedTrackIds,
        lastQueuePatchNoopReason: queuePatchResult.noopReason,
        lastQueuePatchResult: queuePatchResult,
        lastDecisionProvider: decision.meta?.provider,
        lastDecisionUsedFallback: decision.meta?.usedFallback,
        lastDecisionFallbackReason: decision.meta?.fallbackReason,
      });
      return { queuePatchResult, decision };
    }

    const patch = decision.queuePatch;
    const speakEvent = speakContext.event ?? this.eventFromDecisionPrompt(decision.meta?.promptType ?? decision.action);
    const shouldCreateAttempt = Boolean(speakContext.event || speakContext.schedulerTriggered);
    const attemptId =
      speakContext.attemptId ??
      (shouldCreateAttempt && (this.shouldAttemptSpeech(decision) || this.shouldAttemptFallbackSpeech(decision))
        ? this.createSpeakAttempt(speakEvent, Boolean(speakContext.schedulerTriggered))
        : undefined);
    if (attemptId) {
      this.updateAttemptFromDecision(attemptId, decision);
    }
    const before = this.captureUpcomingIds(state.playableQueue);
    let queuePatchResult = this.createQueuePatchResult({
      mode: patch?.mode ?? "none",
      resolvedTrackIds: [],
      unresolvedTrackIds: [],
      before,
      after: before,
      changed: false,
      noopReason: "no_patch",
    });

    if (patch?.trackIds.length) {
      if (patch.mode === "skip_now") {
        if (this.shouldAttemptSpeech(decision) || this.shouldAttemptFallbackSpeech(decision)) {
          void this.enqueueDJLines(decision.lines, {
            event: speakEvent,
            attemptId,
            priority: decision.priority ?? "high",
            decision,
          });
        }

        const resolved = this.resolveActionablePatchTracks(decision, patch.trackIds);
        if (!resolved.selectedTracks.length) {
          queuePatchResult = this.createQueuePatchResult({
            mode: patch.mode,
            resolvedTrackIds: resolved.resolvedTrackIds,
            unresolvedTrackIds: resolved.unresolvedTrackIds,
            before,
            after: before,
            changed: false,
            noopReason: "no_resolved_tracks",
          });
          this.commitQueuePatchResult(decision, queuePatchResult, {
            currentDecision: decision,
          });
          return { queuePatchResult, decision };
        }

        const upcomingStart = state.currentIndex + 1;
        const remaining = state.playableQueue
          .slice(upcomingStart)
          .filter((track) => !resolved.selectedTracks.some((candidate) => candidate.id === track.id));
        const nextQueue = [...state.playableQueue.slice(0, upcomingStart), ...resolved.selectedTracks, ...remaining];

        this.store.setState({
          currentSubtitle: "DJ 正在立刻调整频道。",
          currentDecision: decision,
          playableQueue: nextQueue,
          queue: nextQueue,
          currentTrack,
          timeline: buildRadioTimeline(nextQueue, state.currentProgram),
          queueVersion: (state.queueVersion ?? 0) + 1,
        });

        await this.playTrack(state.currentIndex + 1);
        const latestState = this.store.getState();
        queuePatchResult = this.createQueuePatchResult({
          mode: patch.mode,
          resolvedTrackIds: resolved.resolvedTrackIds,
          unresolvedTrackIds: resolved.unresolvedTrackIds,
          before,
          after: this.captureUpcomingIds(latestState.playableQueue),
          changed:
            before.providerIds.join(",") !== this.captureUpcomingIds(latestState.playableQueue).providerIds.join(","),
        });
        this.commitQueuePatchResult(decision, queuePatchResult, {
          currentDecision: decision,
          lastSkipNowApplied: queuePatchResult.changed,
          lastSkippedFromTrackId: getQueuePatchTrackId(currentTrack),
          lastSkippedToTrackId: latestState.currentTrack ? getQueuePatchTrackId(latestState.currentTrack) : undefined,
        });
        this.persistSession();
        return { queuePatchResult, decision };
      }

      const { queue: nextQueue, queuePatchResult: nextQueuePatchResult } = this.applyQueuePatchMode(patch.mode, patch.trackIds, decision);
      queuePatchResult = nextQueuePatchResult;
      if (queuePatchResult.changed) {
        this.store.setState({
          currentSubtitle: "DJ 正在调整节目。",
          currentDecision: decision,
          playableQueue: nextQueue,
          queue: nextQueue,
          currentTrack: nextQueue[state.currentIndex] ?? currentTrack,
          timeline: buildRadioTimeline(nextQueue, state.currentProgram),
          queueVersion: (state.queueVersion ?? 0) + 1,
        });
        this.commitQueuePatchResult(decision, queuePatchResult);
      } else {
        this.commitQueuePatchResult(decision, queuePatchResult, {
          currentDecision: decision,
        });
      }
    }

    if (!patch?.trackIds.length) {
      this.commitQueuePatchResult(decision, queuePatchResult, {
        currentDecision: decision,
      });
    }

    if (decision.action === "skip_to_next") {
      if (this.shouldAttemptSpeech(decision) || this.shouldAttemptFallbackSpeech(decision)) {
        await this.enqueueDJLines(decision.lines, {
          event: speakEvent,
          attemptId,
          priority: decision.priority ?? "high",
          decision,
        });
      }
      await this.nextTrack();
      return { queuePatchResult, decision };
    }

    if (this.shouldAttemptSpeech(decision) || this.shouldAttemptFallbackSpeech(decision)) {
      await this.enqueueDJLines(decision.lines, {
        event: speakEvent,
        attemptId,
        priority: decision.priority ?? "normal",
        decision,
      });
    }

    if (queuePatchResult.changed) {
      this.persistSession();
    }
    return { queuePatchResult, decision };
  }

  replaceUpcomingTracks(trackIds: string[], decision?: DJDirectingDecision) {
    return this.applyQueuePatchMode("replace_next", trackIds, decision).queue;
  }

  insertAfterCurrent(trackIds: string[], decision?: DJDirectingDecision) {
    return this.applyQueuePatchMode("insert_after_current", trackIds, decision).queue;
  }

  reorderUpcoming(trackIds: string[], decision?: DJDirectingDecision) {
    return this.applyQueuePatchMode("reorder_upcoming", trackIds, decision).queue;
  }

  private applyQueuePatchMode(
    mode: NonNullable<DJDirectingDecision["queuePatch"]>["mode"],
    trackIds: string[],
    decision?: DJDirectingDecision,
  ) {
    const state = this.store.getState();
    const before = this.captureUpcomingIds(state.playableQueue);
    const resolved = this.resolveActionablePatchTracks(decision, trackIds);
    if (!resolved.selectedTracks.length) {
      return {
        queue: state.playableQueue,
        queuePatchResult: this.createQueuePatchResult({
          mode,
          resolvedTrackIds: resolved.resolvedTrackIds,
          unresolvedTrackIds: resolved.unresolvedTrackIds,
          before,
          after: before,
          changed: false,
          noopReason: "no_resolved_tracks",
        }),
      };
    }

    const upcomingStart = state.currentIndex + 1;
    const selected = resolved.selectedTracks;
    const existingUpcoming = state.playableQueue.slice(upcomingStart);
    const remaining = existingUpcoming.filter((track) => !selected.some((candidate) => candidate.id === track.id));
    const nextQueue = [...state.playableQueue.slice(0, upcomingStart), ...selected, ...remaining];
    const after = this.captureUpcomingIds(nextQueue);
    const changed = before.providerIds.join(",") !== after.providerIds.join(",");
    const noopReason = !changed
      ? resolved.sameLeadingOrder
        ? "same_order"
        : "no_actual_change"
      : undefined;

    return {
      queue: changed ? nextQueue : state.playableQueue,
      queuePatchResult: this.createQueuePatchResult({
        mode,
        resolvedTrackIds: resolved.resolvedTrackIds,
        unresolvedTrackIds: resolved.unresolvedTrackIds,
        before,
        after,
        changed,
        noopReason,
      }),
    };
  }

  private resolveActionablePatchTracks(
    decision: DJDirectingDecision | undefined,
    trackIds: string[]
  ) {
    const state = this.store.getState();
    const pool = state.queue.length ? state.queue : state.playableQueue;
    const index = buildTrackIndex(pool);
    const resolved = resolvePatchTrackIds(trackIds, index);
    const lockedTrackIds = new Set(state.playableQueue.slice(0, state.currentIndex + 1).map((track) => track.id));
    const selectedTracks = resolved.resolvedTracks.filter((track) => !lockedTrackIds.has(track.id));
    const needsProgramAdjustment = Boolean(
      decision &&
        (decision.action === "user_tune" ||
          decision.action === "shift_style" ||
          decision.action === "raise_energy" ||
          decision.action === "lower_energy" ||
          decision.action === "insert_discovery"),
    );
    const minimumCount = needsProgramAdjustment ? 3 : 1;
    const upcomingProviderIds = state.playableQueue.slice(state.currentIndex + 1).map((track) => getQueuePatchTrackId(track));
    const sameLeadingOrder = this.hasSameLeadingOrder(
      selectedTracks.map((track) => getQueuePatchTrackId(track)),
      upcomingProviderIds,
    );

    let actionableTracks = selectedTracks;
    if (actionableTracks.length > 0 && (actionableTracks.length < minimumCount || sameLeadingOrder)) {
      const selectorIds = selectTracksForDirection({
        targetDirection: decision?.targetDirection,
        userIntent: this.selectorIntentForDecision(decision),
        currentTrack: state.currentTrack ?? state.playableQueue[state.currentIndex]!,
        recentTracks: this.recentPlayed.length ? this.recentPlayed : state.playableQueue.slice(0, state.currentIndex + 1),
        upcomingTracks: state.playableQueue.slice(state.currentIndex + 1),
        pool,
        count: 5,
      });
      const selectorResolved = resolvePatchTrackIds(selectorIds, index).resolvedTracks.filter((track) => !lockedTrackIds.has(track.id));
      const merged = sameLeadingOrder
        ? this.uniqueTracksByInternalId([...selectorResolved, ...actionableTracks])
        : this.uniqueTracksByInternalId([...actionableTracks, ...selectorResolved]);
      actionableTracks = merged.slice(0, Math.max(minimumCount, Math.min(5, merged.length)));
    }

    return {
      selectedTracks: actionableTracks,
      resolvedTrackIds: actionableTracks.map((track) => getQueuePatchTrackId(track)),
      unresolvedTrackIds: resolved.unresolvedTrackIds,
      sameLeadingOrder:
        actionableTracks.length > 0 &&
        this.hasSameLeadingOrder(
          actionableTracks.map((track) => getQueuePatchTrackId(track)),
          upcomingProviderIds,
        ),
    };
  }

  private selectorIntentForDecision(decision?: DJDirectingDecision) {
    if (!decision) {
      return "surprise";
    }
    if (decision.queuePatch?.mode === "skip_now" && decision.targetDirection?.energy === "low") return "lighter";
    if (decision.action === "raise_energy") return "more_rhythm";
    if (decision.action === "lower_energy") return "quieter";
    if (decision.action === "insert_discovery") return "surprise";
    if (decision.targetDirection?.language === "中文") return "more_chinese";
    if (decision.targetDirection?.language) return "more_english";
    if (decision.targetDirection?.energy === "high") return "more_rhythm";
    if (decision.targetDirection?.energy === "low") return "quieter";
    if (decision.targetDirection?.mood?.includes("nostalgic")) return "nostalgic";
    return decision.action === "user_tune" ? "surprise" : "lighter";
  }

  private uniqueTracksByInternalId(tracks: Track[]) {
    const seen = new Set<string>();
    return tracks.filter((track) => {
      if (seen.has(track.id)) {
        return false;
      }
      seen.add(track.id);
      return true;
    });
  }

  private hasSameLeadingOrder(candidateIds: string[], upcomingIds: string[]) {
    if (!candidateIds.length) {
      return false;
    }
    return candidateIds.every((id, index) => upcomingIds[index] === id);
  }

  private captureUpcomingIds(queue: Track[]) {
    const state = this.store.getState();
    const upcoming = queue.slice(state.currentIndex + 1, state.currentIndex + 6);
    return {
      providerIds: upcoming.map((track) => getQueuePatchTrackId(track)),
      internalIds: upcoming.map((track) => track.id),
    };
  }

  private createQueuePatchResult(input: {
    mode: QueuePatchResult["mode"];
    resolvedTrackIds: string[];
    unresolvedTrackIds: string[];
    before: { providerIds: string[]; internalIds: string[] };
    after: { providerIds: string[]; internalIds: string[] };
    changed: boolean;
    noopReason?: QueuePatchResult["noopReason"];
  }): QueuePatchResult {
    return {
      applied: input.changed,
      changed: input.changed,
      mode: input.mode,
      resolvedTrackIds: input.resolvedTrackIds,
      unresolvedTrackIds: input.unresolvedTrackIds,
      beforeUpcomingProviderIds: input.before.providerIds,
      afterUpcomingProviderIds: input.after.providerIds,
      beforeUpcomingInternalIds: input.before.internalIds,
      afterUpcomingInternalIds: input.after.internalIds,
      noopReason: input.changed ? undefined : input.noopReason,
    };
  }

  private commitQueuePatchResult(
    decision: DJDirectingDecision,
    queuePatchResult: QueuePatchResult,
    extra: Partial<RadioState> = {},
  ) {
    this.store.setState({
      ...extra,
      lastQueuePatchApplied: queuePatchResult.applied,
      lastQueuePatchBeforeIds: queuePatchResult.beforeUpcomingProviderIds,
      lastQueuePatchAfterIds: queuePatchResult.afterUpcomingProviderIds,
      lastQueuePatchBeforeProviderIds: queuePatchResult.beforeUpcomingProviderIds,
      lastQueuePatchAfterProviderIds: queuePatchResult.afterUpcomingProviderIds,
      lastQueuePatchBeforeInternalIds: queuePatchResult.beforeUpcomingInternalIds,
      lastQueuePatchAfterInternalIds: queuePatchResult.afterUpcomingInternalIds,
      lastQueuePatchResolvedIds: queuePatchResult.resolvedTrackIds,
      lastQueuePatchUnresolvedIds: queuePatchResult.unresolvedTrackIds,
      lastQueuePatchNoopReason: queuePatchResult.noopReason,
      lastQueuePatchResult: queuePatchResult,
      lastSkipNowApplied: extra.lastSkipNowApplied ?? false,
      lastSkippedFromTrackId: extra.lastSkippedFromTrackId,
      lastSkippedToTrackId: extra.lastSkippedToTrackId,
      lastDecisionProvider: decision.meta?.provider,
      lastDecisionUsedFallback: decision.meta?.usedFallback,
      lastDecisionFallbackReason: decision.meta?.fallbackReason,
      lastDecisionRawPrompt: decision.meta?.rawPrompt,
      lastDecisionRawResponse: decision.meta?.rawResponse,
      lastDecisionPromptType: decision.meta?.promptType,
      djBrainFallbackActive: Boolean(decision.meta?.usedFallback),
    });
  }

  onAudioTimeUpdate(currentTimeMs: number, durationMs: number) {
    const state = this.store.getState();
    this.store.setState({
      currentTime: currentTimeMs,
      duration: durationMs || state.currentTrack?.durationMs || 0,
    });

    if (Math.abs(currentTimeMs - this.persistedTime) > 5000) {
      this.persistedTime = currentTimeMs;
      this.persistSession();
    }

    const nextState = this.store.getState();
    if (!canHostNow(nextState)) {
      return;
    }

    const hour = new Date().getHours();
    const slot: ListeningContext["timeOfDay"] = hour < 11 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
    if (this.lastContextSlot && this.lastContextSlot !== slot) {
      this.lastContextSlot = slot;
      void this.requestDirectorDecision("time_context");
    }
  }

  onAudioEnded() {
    const state = this.store.getState();
    if (state.currentTrack) {
      this.playedCount += 1;
      this.recentPlayed = [...this.recentPlayed, state.currentTrack].slice(-5);
    }
    if (state.currentIndex >= state.playableQueue.length - 1) {
      void this.nextTrack();
      return;
    }
    const triggerByArtist = this.hasSameArtistStreak(this.recentPlayed);
    const triggerByStyle = this.hasSameStyleStreak(this.recentPlayed);

    if (triggerByArtist) void this.requestDirectorDecision("avoid_repetition");
    if (triggerByStyle) void this.requestDirectorDecision("shift_style");
    if (this.playedCount >= this.nextSpeechTrackThreshold) {
      void this.requestDirectorDecision("bridge_to_next");
    }
    void this.nextTrack();
  }

  onAudioPlay() {
    this.clearPendingPauseTimer();
    const state = this.store.getState();
    if (state.status !== "speaking") {
      this.store.setState({ status: "playing", isPlaying: true });
    }
    this.markHostingStarted();
  }

  onAudioPause() {
    this.clearPendingPauseTimer();
    this.pendingPauseTimer = setTimeout(() => {
      this.pendingPauseTimer = null;
      const state = this.store.getState();
      const audioStillPlaying = !this.audioEngine.isMusicPaused?.();
      const hasTrackSource = this.audioEngine.hasCurrentTrackSource?.() ?? Boolean(this.audioEngine.getCurrentSrc?.());
      if (audioStillPlaying && hasTrackSource) {
        return;
      }
      if (state.status !== "speaking" && state.status !== "ended") {
        this.store.setState({ status: "paused", isPlaying: false });
      }
      this.updateHostDebug({ state: "paused", schedulerRunning: false });
    }, RadioSessionEngine.PAUSE_CONFIRMATION_MS);
  }

  private clearPendingPauseTimer() {
    if (!this.pendingPauseTimer) {
      return;
    }
    clearTimeout(this.pendingPauseTimer);
    this.pendingPauseTimer = null;
  }

  markSkip(track: Track) {
    this.recentSkipped = [...this.recentSkipped, track].slice(-8);
    void this.requestDirectorDecision("shift_style");
  }

  private async requestDirectorDecision(
    trigger: DJDirectorTrigger,
    userIntent?: string,
    event?: DJTalkBreakEvent,
    openingRetryAttempted = false,
  ) {
    if (this.directorDecisionInFlight) {
      this.enqueueDirectorRequest(trigger, userIntent, event);
      return;
    }
    const allowDuringActiveQueue = trigger === "opening" || trigger === "user_tune" || trigger === "music_paused" || trigger === "music_ended";
    if (!allowDuringActiveQueue && this.voiceQueue.isActive()) {
      return;
    }
    const context = await this.buildDirectorContext(userIntent);
    if (!context) {
      return;
    }
    const eventName = event ?? this.eventFromDecisionPrompt(trigger);
    const attemptId = this.createSpeakAttempt(eventName, true);
    let decision: DJDirectingDecision;
    this.directorDecisionInFlight = true;
    this.updateHostDebug({
      forcedSpeakTriggered: Boolean(context.forceSpeak),
      tracksSinceLastSpeak: context.tracksSinceLastSpeak ?? this.hostDebugState.tracksSinceLastSpeak,
      minutesSinceLastSpeak: context.minutesSinceLastSpeak ?? this.hostDebugState.minutesSinceLastSpeak,
      lastSpeakAt: this.lastSpeakTimestamp ? new Date(this.lastSpeakTimestamp).toISOString() : this.hostDebugState.lastSpeakAt,
    });
    this.updateHostDebug({
      state: trigger === "opening" ? "opening" : trigger === "bridge_to_next" ? "bridge_pending" : "track_intro_pending",
      schedulerRunning: true,
      lastSchedulerEvent: eventName,
      eventTriggeredAt: new Date().toISOString(),
      pendingTalkBreaks: [eventName],
    });
    try {
      decision = await this.director.decide(trigger, context);
      this.updateAttemptFromDecision(attemptId, decision);
    } catch (error) {
      this.updateSpeakAttempt(attemptId, {
        deepseekCalled: true,
        deepseekError: error instanceof Error ? error.message : String(error),
        skippedReason: "director_failed",
      });
      this.updateHostDebug({
        pendingTalkBreaks: [],
        lastTalkBreakFailed: true,
        lastTalkBreakFailureReason: error instanceof Error ? error.message : String(error),
        consecutiveTalkFailures: this.hostDebugState.consecutiveTalkFailures + 1,
      });
      this.directorDecisionInFlight = false;
      this.flushPendingDirectorRequests();
      return;
    }
    await this.applyDJDecision(decision, { event: eventName, attemptId, schedulerTriggered: true });
    const bypassedGuard = Boolean(decision.meta?.scriptDebug?.bypassedGuard);
    const guardResult =
      decision.meta?.scriptDebug?.guardResult ??
      (bypassedGuard
        ? {
            ok: decision.lines.length > 0,
            safeLines: decision.lines,
            blockedLines: [],
          }
        : guardDJLines(decision.lines));
    const attempt = this.store.getState().djSpeakAttempts?.find((item) => item.id === attemptId);
    const talkBreakResult = {
      attemptedLines: decision.meta?.scriptDebug?.attemptedLines ?? decision.lines,
      spokenLines: attempt?.finalLines?.length ? attempt.finalLines : guardResult.safeLines,
      blockedLines: guardResult.blockedLines,
      guardResult,
      pattern: decision.meta?.scriptDebug?.pattern,
    };
    this.maybeAdvanceSpeechThreshold(decision, attempt?.finalLines?.length ?? 0);
    this.updateTalkBreakDebug(eventName, talkBreakResult, attempt?.finalLines?.length ?? 0);
    if (trigger === "opening" && (attempt?.finalLines?.length ?? 0) === 0 && !openingRetryAttempted) {
      this.directorDecisionInFlight = false;
      this.flushPendingDirectorRequests();
      await this.requestDirectorDecision("opening", userIntent, eventName, true);
      return talkBreakResult;
    }
    this.directorDecisionInFlight = false;
    this.flushPendingDirectorRequests();
    return talkBreakResult;
  }

  private enqueueDirectorRequest(trigger: DJDirectorTrigger, userIntent?: string, event?: DJTalkBreakEvent) {
    const requestKey = `${trigger}|${event ?? ""}|${userIntent ?? ""}`;
    const alreadyQueued = this.pendingDirectorRequests.some(
      (request) => `${request.trigger}|${request.event ?? ""}|${request.userIntent ?? ""}` === requestKey,
    );
    if (alreadyQueued) {
      return;
    }
    this.pendingDirectorRequests.push({ trigger, userIntent, event });
  }

  private flushPendingDirectorRequests() {
    if (this.directorDecisionInFlight) {
      return;
    }
    const nextRequest = this.pendingDirectorRequests.shift();
    if (!nextRequest) {
      return;
    }
    void this.requestDirectorDecision(nextRequest.trigger, nextRequest.userIntent, nextRequest.event);
  }

  private async playPreparedOpening() {
    const speech = this.preparedOpeningSpeech ?? this.store.getState().preparedOpeningSpeech;
    if (!speech) {
      return;
    }

    this.preparedOpeningSpeech = null;
    this.store.setState({
      preparedOpeningSpeech: undefined,
    });

    const attemptId = this.createSpeakAttempt("opening", true);
    this.updateSpeakAttempt(attemptId, {
      deepseekCalled: true,
      deepseekUsedFallback: false,
      rawLines: [speech],
      guardChecked: true,
      safeLines: [speech],
      finalLines: [speech],
      queueEnqueued: true,
    });

    await this.enqueueDJLines([speech], {
      event: "opening",
      attemptId,
      decision: {
        action: "keep_flow",
        shouldSpeak: true,
        reason: "Prepared opening speech.",
        lines: [speech],
        meta: {
          provider: "deepseek",
          usedFallback: false,
          promptType: "opening",
          scriptDebug: {
            bypassedGuard: true,
            attemptedLines: [speech],
            speech,
            durationHintSec: 24,
            insertAfterTracks: 2,
          },
        },
      },
    });

    const talkBreakResult = {
      attemptedLines: [speech],
      spokenLines: [speech],
      blockedLines: [],
      guardResult: {
        ok: true,
        safeLines: [speech],
        blockedLines: [],
      },
    };
    this.maybeAdvanceSpeechThreshold(
      {
        action: "keep_flow",
        shouldSpeak: true,
        reason: "Prepared opening speech.",
        lines: [speech],
        meta: {
          provider: "deepseek",
          scriptDebug: {
            insertAfterTracks: 2,
          },
        },
      },
      1,
    );
    this.updateTalkBreakDebug("opening", talkBreakResult, 1);
  }

  getDJHostDebugState(): DJHostDebugState {
    return this.hostDebugState;
  }

  private setHostDebug(debug: DJHostDebugState) {
    this.hostDebugState = debug;
    this.store.setState({ djHostDebug: debug });
  }

  private eventFromDecisionPrompt(value?: string): DJTalkBreakEvent {
    if (value === "opening") return "opening";
    if (value === "introduce_current") return "track_intro";
    if (value === "bridge_to_next") return "bridge";
    if (value === "user_tune") return "user_tune";
    if (value === "shift_style") return "style_shift";
    if (value === "time_context") return "time_context";
    if (value === "music_ended") return "outro";
    return "track_intro";
  }

  private createSpeakAttempt(event: DJSpeakAttempt["event"], schedulerTriggered: boolean) {
    const attempt = createEmptyAttempt(event, schedulerTriggered);
    this.store.setState({
      djSpeakAttempts: [attempt, ...(this.store.getState().djSpeakAttempts ?? [])].slice(0, 10),
    });
    return attempt.id;
  }

  private updateSpeakAttempt(id: string | undefined, patch: Partial<DJSpeakAttempt>) {
    if (!id) {
      return;
    }
    const attempts = this.store.getState().djSpeakAttempts ?? [];
    this.store.setState({
      djSpeakAttempts: attempts.map((attempt) => (attempt.id === id ? { ...attempt, ...patch } : attempt)).slice(0, 10),
    });
  }

  private updateAttemptFromDecision(id: string | undefined, decision: DJDirectingDecision) {
    const scriptDebug = decision.meta?.scriptDebug;
    const quality = scriptDebug?.quality;
    const bypassedGuard = Boolean(scriptDebug?.bypassedGuard);
    const guard =
      scriptDebug?.guardResult ??
      (bypassedGuard
        ? {
            ok: (scriptDebug?.attemptedLines ?? decision.lines).length > 0,
            safeLines: scriptDebug?.attemptedLines ?? decision.lines,
            blockedLines: [],
          }
        : guardDJLines(scriptDebug?.attemptedLines ?? decision.lines));
    this.updateSpeakAttempt(id, {
      deepseekCalled: decision.meta?.provider === "deepseek" || Boolean(decision.meta?.rawPrompt),
      deepseekUsedFallback: Boolean(decision.meta?.usedFallback),
      deepseekError: decision.meta?.fallbackReason,
      rawLines: scriptDebug?.attemptedLines ?? decision.lines,
      qualityChecked: Boolean(quality),
      qualityPass: bypassedGuard ? true : Boolean(quality?.pass),
      qualityFailures: bypassedGuard ? [] : quality?.pass === false ? [quality.reason, ...(quality.radioFailures ?? [])].filter(Boolean) : [],
      guardChecked: true,
      safeLines: guard.safeLines,
      blockedLines: guard.blockedLines,
      rewriteAttempted: Boolean(scriptDebug?.rewriteAttempted),
      rewriteLines: scriptDebug?.rewriteLines ?? [],
      rewritePass: Boolean(scriptDebug?.rewriteAttempted && guard.safeLines.length),
      rewriteFailures: scriptDebug?.rewriteAttempted && !guard.safeLines.length ? guard.blockedLines.map((line) => line.reason) : [],
      finalLines: decision.lines,
    });
  }

  private shouldAttemptSpeech(decision: DJDirectingDecision) {
    return decision.action !== "stop_talking" && decision.shouldSpeak !== false && decision.lines.length > 0;
  }

  private shouldAttemptFallbackSpeech(decision: DJDirectingDecision) {
    void decision;
    return false;
  }

  private maybeAdvanceSpeechThreshold(decision: DJDirectingDecision, spokenCount: number) {
    if (spokenCount <= 0) {
      return;
    }
    const preferredGap = decision.meta?.scriptDebug?.insertAfterTracks;
    this.playedCount = 0;
    this.nextSpeechTrackThreshold = typeof preferredGap === "number" ? Math.min(3, Math.max(2, Math.round(preferredGap))) : 2;
  }

  private async enqueueDJLines(
    lines: string[],
    input: {
      event: DJSpeakAttempt["event"];
      attemptId?: string;
      priority?: "low" | "normal" | "high";
      decision?: DJDirectingDecision;
      fallbackLines?: string[];
    },
  ) {
    if (!input.attemptId && lines.length > 0) {
      if (input.priority && input.priority !== "normal") {
        await this.voiceQueue.enqueue(lines, {
          priority: input.priority,
          bypassGuard: Boolean(input.decision?.meta?.scriptDebug?.bypassedGuard),
        });
      } else {
        await this.voiceQueue.enqueue(lines, {
          bypassGuard: Boolean(input.decision?.meta?.scriptDebug?.bypassedGuard),
        });
      }
      return;
    }

    await this.voiceQueue.enqueue(lines, {
      priority: input.priority,
      bypassGuard: Boolean(input.decision?.meta?.scriptDebug?.bypassedGuard),
      fallbackLines: input.fallbackLines ?? [],
      onGuardResult: (result) => {
        this.updateSpeakAttempt(input.attemptId, {
          guardChecked: true,
          safeLines: result.safeLines,
          blockedLines: result.blockedLines,
          rewriteAttempted: result.rewriteAttempted || Boolean(input.decision?.meta?.scriptDebug?.rewriteAttempted),
          rewriteLines: result.rewriteLines.length ? result.rewriteLines : (input.decision?.meta?.scriptDebug?.rewriteLines ?? []),
          rewritePass: result.rewriteLines.length > 0 && result.finalLines.length > 0,
          rewriteFailures: result.rewriteLines.length && !result.finalLines.length ? ["rewrite_lines_blocked"] : [],
          fallbackUsed: result.fallbackUsed,
          fallbackLines: result.fallbackLines,
          finalLines: result.finalLines,
          queueEnqueued: result.finalLines.length > 0,
          skippedReason: result.skippedReason,
        });
      },
      onPlayed: () => {
        const latest = this.store.getState();
        this.updateSpeakAttempt(input.attemptId, {
          queuePlayed: true,
          ttsCalled: true,
          ttsProvider: latest.ttsProvider,
          ttsAudioUrl: latest.lastDJAudioUrl,
          subtitleShown: Boolean(latest.currentSubtitle),
        });
      },
    });
  }

  private async buildDirectorContext(userIntent?: string) {
    const state = this.store.getState();
    const currentTrack = state.currentTrack;
    if (!currentTrack) {
      return null;
    }

    const userMemory =
      this.userMemory ??
      (await buildDJMemory({
        tracks: state.playableQueue,
        recentPlayed: this.recentPlayed,
        recentSkipped: this.recentSkipped,
      }));
    this.userMemory = userMemory;

    const listeningContext = buildListeningContext(new Date());
    this.listeningContext = listeningContext;
    this.lastContextSlot = listeningContext.timeOfDay;

    const currentSegment =
      state.currentProgram?.segments.find((segment) => segment.trackIds.includes(getQueuePatchTrackId(currentTrack)))?.purpose ?? "main";

    const upcomingTracks = state.playableQueue.slice(state.currentIndex + 1);
    const tracksSinceLastSpeak = this.playedCount;
    const minutesSinceLastSpeak = this.lastSpeakTimestamp ? (Date.now() - this.lastSpeakTimestamp) / 60_000 : Number.POSITIVE_INFINITY;
    const forceSpeak =
      tracksSinceLastSpeak >= RadioSessionEngine.FORCE_SPEAK_MAX_SILENT_TRACKS ||
      minutesSinceLastSpeak >= RadioSessionEngine.FORCE_SPEAK_MAX_SILENT_MINUTES ||
      state.status === "on_air";
    return {
      currentTrack,
      nextTrack: upcomingTracks[0],
      recentTracks: this.recentPlayed.slice(-5),
      upcomingTracks,
      playedCount: this.playedCount,
      timeOfDay: listeningContext.timeOfDay,
      userMemory,
      currentSegment,
      userIntent,
      musicState: {
        isPlaying: state.isPlaying,
        isPaused: state.status === "paused" || !state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
      },
      recentLines: (this.voiceQueue as DJVoiceQueue & { getRecentLines?: () => string[] }).getRecentLines?.().slice(-8) ?? [],
      playableTrackPool: state.playableQueue.slice(0, 80),
      forceSpeak,
      tracksSinceLastSpeak,
      minutesSinceLastSpeak: Number.isFinite(minutesSinceLastSpeak) ? Number(minutesSinceLastSpeak.toFixed(2)) : 999,
    };
  }

  private hasSameArtistStreak(recentTracks: Track[]) {
    if (recentTracks.length < 2) return false;
    return recentTracks[recentTracks.length - 1]?.artist === recentTracks[recentTracks.length - 2]?.artist;
  }

  private hasSameStyleStreak(recentTracks: Track[]) {
    if (recentTracks.length < 3) return false;
    const a = recentTracks[recentTracks.length - 1]?.tags?.style?.[0];
    const b = recentTracks[recentTracks.length - 2]?.tags?.style?.[0];
    const c = recentTracks[recentTracks.length - 3]?.tags?.style?.[0];
    return Boolean(a && b && c && a === b && b === c);
  }


  getDebugState() {
    return nowPlayingDebug(this.store.getState(), this.audioEngine);
  }

  private markHostingStarted() {
    if (this.hostingStarted) {
      return;
    }

    const state = this.store.getState();
    if (!state.currentTrack || !state.playableQueue.length) {
      return;
    }

    if (!state.currentProgram) {
      this.store.setState({
        currentProgram: undefined,
        timeline: buildRadioTimeline(state.playableQueue),
      });
    }

    this.hostingStarted = true;
    this.updateHostDebug({
      ...createHostDebugState(),
      state: "playing_music",
      schedulerRunning: true,
      playedCount: this.playedCount,
    });
  }

  private resetHostDebug() {
    this.setHostDebug(createHostDebugState());
  }

  private updateHostDebug(patch: Partial<DJHostDebugState>) {
    this.setHostDebug({
      ...this.hostDebugState,
      ...patch,
    });
  }

  private updateTalkBreakDebug(eventName: DJTalkBreakEvent, talkBreakResult: DJTalkBreakResult, spokenCount: number) {
    const spokenLines = talkBreakResult.spokenLines ?? [];
    const nowIso = new Date().toISOString();
    if (spokenCount > 0) {
      this.lastSpeakTimestamp = Date.now();
    }
    const tracksSinceLastSpeak = spokenCount > 0 ? 0 : this.playedCount;
    const minutesSinceLastSpeak = this.lastSpeakTimestamp ? (Date.now() - this.lastSpeakTimestamp) / 60_000 : 999;
    this.updateHostDebug({
      state: this.store.getState().status === "paused" ? "paused" : "playing_music",
      schedulerRunning: this.store.getState().status !== "ended",
      openingDone: this.hostDebugState.openingDone || eventName === "opening",
      openingLinesAttempted:
        eventName === "opening" ? talkBreakResult.attemptedLines : this.hostDebugState.openingLinesAttempted,
      openingLinesSpoken: eventName === "opening" ? spokenLines : this.hostDebugState.openingLinesSpoken,
      openingBlockedLines: eventName === "opening" ? talkBreakResult.blockedLines : this.hostDebugState.openingBlockedLines,
      currentTrackIntroDoneTrackId:
        eventName === "track_intro" && spokenCount > 0 ? this.store.getState().currentTrack?.id ?? null : this.hostDebugState.currentTrackIntroDoneTrackId,
      playedCount: this.playedCount,
      lastBridgeAt: eventName === "bridge" ? nowIso : this.hostDebugState.lastBridgeAt,
      lastSpokenAt: spokenCount > 0 ? nowIso : this.hostDebugState.lastSpokenAt,
      lastTalkBreakEvent: eventName,
      lastTalkBreakPattern: talkBreakResult.pattern ?? null,
      lastGuardResult: talkBreakResult.guardResult ?? null,
      lastBlockedLines: talkBreakResult.blockedLines,
      recentDJLines: [...this.hostDebugState.recentDJLines, ...spokenLines].slice(-12),
      lastSchedulerEvent: eventName,
      eventTriggeredAt: nowIso,
      pendingTalkBreaks: [],
      lastTalkBreakFailed: spokenCount === 0 && talkBreakResult.attemptedLines.length > 0,
      lastTalkBreakFailureReason:
        spokenCount === 0 && talkBreakResult.attemptedLines.length > 0 ? "no_spoken_lines" : null,
      consecutiveTalkFailures:
        spokenCount === 0 && talkBreakResult.attemptedLines.length > 0 ? this.hostDebugState.consecutiveTalkFailures + 1 : 0,
      lastSpeakAt: this.lastSpeakTimestamp ? new Date(this.lastSpeakTimestamp).toISOString() : this.hostDebugState.lastSpeakAt,
      tracksSinceLastSpeak,
      minutesSinceLastSpeak: Number.isFinite(minutesSinceLastSpeak) ? Number(minutesSinceLastSpeak.toFixed(2)) : 999,
      forcedSpeakTriggered: spokenCount === 0 ? this.hostDebugState.forcedSpeakTriggered : false,
    });
  }

  private persistSession() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      void this.persistSessionNow();
    }, 280);
  }

  private async persistSessionNow() {
    const state = this.store.getState();
    const queuePayload = state.playableQueue.map((track) => ({
      track: {
        id: track.id,
        name: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.durationMs ?? 0,
        durationMs: track.durationMs ?? 0,
        coverUrl: track.coverUrl,
        audioUrl: track.audioUrl,
        externalUrl: track.externalUrl,
        sourceType: toPlaybackSourceType(track.sourceType),
        playableStatus: track.playableStatus,
        language: track.tags?.language,
        era: track.tags?.era,
        moodTags: track.tags?.mood ?? [],
        styleTags: track.tags?.style ?? [],
        energyLevel: track.tags?.energy === "high" ? "high" : track.tags?.energy === "low" ? "low" : "medium",
        providerTrackId: track.providerTrackId ?? track.neteaseId ?? track.id,
        neteaseId: track.neteaseId ?? track.providerTrackId ?? track.id,
        rawMeta: {
          providerTrackId: track.providerTrackId ?? track.neteaseId ?? track.id,
          neteaseId: track.neteaseId ?? track.providerTrackId ?? track.id,
        },
      },
      section: "build" as const,
    }));

    await fetch("/api/playback/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentTrackId: state.currentTrack?.id,
        queue: queuePayload,
        currentIndex: state.currentIndex,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        volume: state.volume,
        source: toPlaybackSourceType(state.currentTrack?.sourceType),
      }),
    }).catch(() => undefined);
  }
}






