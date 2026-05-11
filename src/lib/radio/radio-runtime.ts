import { NETEASE_API_ROUTES } from "@/lib/providers/netease/netease-api-routes";
import type { DJDirectingDecision } from "@/lib/dj/dj-types";
import type { ProgramPlannerResult } from "@/lib/dj/llm-program-planner";
import type { BuildQueueResult } from "@/lib/providers/netease/netease-playable-service";
import { RadioCore } from "./radio-core";
import type { RadioState } from "./radio-types";

type Listener = () => void;

type QRStatus = "idle" | "pending" | "scanned" | "authorized" | "logged_in" | "partial_logged_in" | "expired" | "error";

type NeteaseProfile = {
  id: string;
  nickname: string;
  avatar?: string;
};

type NeteaseControllerState = {
  loading: boolean;
  authenticated: boolean;
  loginState: "unknown" | "login_required" | "logged_in";
  message: string;
  profile?: NeteaseProfile;
  likedPlaylistId?: string;
  playlistsCount?: number;
  playableTrackCount?: number;
  qrKey?: string;
  qrImageUrl?: string;
  qrStatus: QRStatus;
};

type NeteaseStatusResponse = {
  ok: boolean;
  authenticated?: boolean;
  loginState?: "login_required" | "logged_in";
  message?: string;
  profile?: NeteaseProfile;
  likedPlaylistId?: string;
  playlistsCount?: number;
  playableTrackCount?: number;
};

type QRCreateResponse = {
  ok: boolean;
  qrKey?: string;
  qrImageUrl?: string;
  message?: string;
};

type QRCheckResponse = {
  ok: boolean;
  status?: QRStatus;
  message?: string;
};

type BuildQueueResponse = BuildQueueResult & {
  ok: boolean;
  message?: string;
};

type RuntimeCore = Pick<RadioCore, "store" | "audioEngine" | "sessionEngine" | "djEngine">;

type StartupSource = "home_entry_click" | "direct_radio_click" | "unknown";

type StartupDiagnostics = {
  startedFrom: StartupSource;
  playCalledBeforeRoutePush: boolean;
  playCallTimestamp?: number;
  routePushTimestamp?: number;
  firstPlayError?: string;
  providerMountedAtRoot: boolean;
};

type RadioRuntimeDeps = {
  core?: RuntimeCore;
  readStatus?: () => Promise<NeteaseStatusResponse>;
  createQRCode?: () => Promise<QRCreateResponse>;
  checkQRCode?: (qrKey: string) => Promise<QRCheckResponse>;
  buildQueue?: (playlistId: string, options: { limit: number; level: "standard" | "higher" | "exhigh" }) => Promise<BuildQueueResponse>;
  planProgram?: (input: { playlistName: string; playableTracks: BuildQueueResult["playableTracks"] }) => Promise<ProgramPlannerResult>;
};

export type RadioRuntimeSnapshot = {
  radio: RadioState;
  netease: NeteaseControllerState;
  prepareState: "idle" | "preparing" | "ready" | "error";
  hasPrepared: boolean;
  hasStarted: boolean;
  programTitle?: string;
  directorOffline: boolean;
  directorDebugEvidence: string[];
  startup: StartupDiagnostics;
  isReady: boolean;
  isStarting: boolean;
  error?: string;
};

function createInitialNeteaseState(): NeteaseControllerState {
  return {
    loading: true,
    authenticated: false,
    loginState: "unknown",
    message: "正在检查网易云登录状态。",
    qrStatus: "idle",
  };
}

async function readJSON<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
  console.log("[netease] request:", url);

  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    console.error("[netease] fetch error:", error);
    throw error;
  }

  return (await response.json()) as T;
}

function createQueueFailureResponse(playlistId: string, message: string): BuildQueueResponse {
  return {
    ok: false,
    playlistId,
    playlistName: "",
    tracksTotal: 0,
    playableTracks: [],
    failedTracks: [],
    stats: {
      total: 0,
      playable: 0,
      failed: 0,
      noUrl: 0,
      vipOnly: 0,
      copyrightUnavailable: 0,
      apiError: 1,
    },
    message,
  };
}

function shallowEqualObject<T extends Record<string, unknown>>(left: T, right: T) {
  const leftKeys = Object.keys(left) as Array<keyof T>;
  const rightKeys = Object.keys(right) as Array<keyof T>;
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

function createInitialStartupDiagnostics(): StartupDiagnostics {
  return {
    startedFrom: "unknown",
    playCalledBeforeRoutePush: false,
    providerMountedAtRoot: false,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function extractDecisionSpeech(value: RadioState["currentDecision"]) {
  if (!value || typeof value !== "object" || !("meta" in value)) {
    return null;
  }

  const meta = value.meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }

  const scriptDebug = "scriptDebug" in meta ? meta.scriptDebug : undefined;
  if (!scriptDebug || typeof scriptDebug !== "object") {
    return null;
  }

  return "speech" in scriptDebug && typeof scriptDebug.speech === "string" ? scriptDebug.speech : null;
}

function optionalAudioDiagnostics(audioEngine: RuntimeCore["audioEngine"]) {
  return audioEngine as RuntimeCore["audioEngine"] & {
    getLastPlayCallTimestamp?: () => number | undefined;
    getFirstPlayError?: () => string | undefined;
    isMusicPaused?: () => boolean;
  };
}

export class RadioRuntime {
  readonly core: RuntimeCore;
  private readonly readStatusImpl: NonNullable<RadioRuntimeDeps["readStatus"]>;
  private readonly createQRCodeImpl: NonNullable<RadioRuntimeDeps["createQRCode"]>;
  private readonly checkQRCodeImpl: NonNullable<RadioRuntimeDeps["checkQRCode"]>;
  private readonly buildQueueImpl: NonNullable<RadioRuntimeDeps["buildQueue"]>;
  private readonly planProgramImpl: NonNullable<RadioRuntimeDeps["planProgram"]>;
  private readonly listeners = new Set<Listener>();
  private initialized = false;
  private hasStartedFlag = false;
  private prepareStateValue: RadioRuntimeSnapshot["prepareState"] = "idle";
  private starting = false;
  private errorValue: string | undefined;
  private programTitleValue: string | undefined;
  private startupValue = createInitialStartupDiagnostics();
  private neteaseState = createInitialNeteaseState();
  private preparePromise: Promise<void> | null = null;
  private startPromise: Promise<boolean> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshot!: RadioRuntimeSnapshot;
  private readonly serverSnapshot: RadioRuntimeSnapshot;

  constructor(deps: RadioRuntimeDeps = {}) {
    this.core = deps.core ?? new RadioCore();
    this.readStatusImpl =
      deps.readStatus ??
      (async () => readJSON<NeteaseStatusResponse>(NETEASE_API_ROUTES.status).catch(() => ({ ok: false, message: "网易云状态接口不可用。" })));
    this.createQRCodeImpl =
      deps.createQRCode ??
      (async () =>
        readJSON<QRCreateResponse>(NETEASE_API_ROUTES.qrCreate, { method: "POST" }).catch(() => ({
          ok: false,
          message: "二维码生成失败。",
        })));
    this.checkQRCodeImpl =
      deps.checkQRCode ??
      (async (qrKey: string) =>
        readJSON<QRCheckResponse>(NETEASE_API_ROUTES.qrCheck, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrKey }),
        }).catch(() => ({
          ok: false,
          message: "二维码状态检查失败。",
        })));
    this.buildQueueImpl =
      deps.buildQueue ??
      (async (playlistId, options) =>
        readJSON<BuildQueueResponse>("/api/radio/build-netease-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlistId,
            limit: options.limit,
            level: options.level,
          }),
        }).catch(() => createQueueFailureResponse(playlistId, "build-netease-queue failed")));
    this.planProgramImpl =
      deps.planProgram ??
      (async ({ playlistName, playableTracks }) =>
        readJSON<ProgramPlannerResult>("/api/dj/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlistName,
            candidateTracks: playableTracks,
          }),
        }).catch(() => ({
          provider: "deepseek",
          configured: false,
          model: "deepseek-chat",
          usedFallback: true,
          parsedPlan: {
            title: playlistName || "Long FM",
            intent: "先从熟悉的声音进入，中段再慢慢把颜色推开。",
            segments: [],
            queueTrackIds: playableTracks.map((track) => track.providerTrackId),
          },
          error: {
            type: "api_error",
            message: "Program planner API unavailable.",
          },
        })));
    this.snapshot = this.buildSnapshot();
    this.serverSnapshot = this.snapshot;
    this.core.store.subscribe(() => this.emit());
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    void this.refreshStatus({ prepare: true });
  }

  dispose() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => this.serverSnapshot;

  getDebugState() {
    const radio = this.snapshot.radio;
    const directorOffline = this.isDirectorOffline();
    const directorDebugEvidence = this.getDirectorDebugEvidence();
    const latestAttempt = (radio.djSpeakAttempts ?? [])[0] ?? null;
    const latestSpeech =
      extractDecisionSpeech(radio.currentDecision) ??
      latestAttempt?.finalLines?.join("") ??
      radio.lastDJLine ??
      null;
    const latestOpeningSpeech =
      radio.djHostDebug?.openingLinesSpoken?.join("") ||
      radio.preparedOpeningSpeech ||
      (radio.djSpeakAttempts ?? []).find((attempt) => attempt.event === "opening")?.finalLines?.join("") ||
      null;
    return {
      currentTrackTitle: radio.currentTrack?.title ?? null,
      currentTrackArtist: radio.currentTrack?.artist ?? null,
      currentTrackAudioUrl: radio.currentTrack?.audioUrl ?? null,
      audioCurrentSrc: this.core.audioEngine.getCurrentSrc(),
      currentIndex: radio.currentIndex,
      playableQueueLength: radio.playableQueue.length,
      status: radio.status,
      currentSubtitle: radio.currentSubtitle,
      currentProgram: radio.currentProgram ?? null,
      currentDecision: radio.currentDecision ?? null,
      currentScriptDebug:
        radio.currentDecision && "meta" in radio.currentDecision
          ? (radio.currentDecision.meta?.scriptDebug ?? null)
          : null,
      resolvingProgress: radio.resolvingProgress ?? null,
      resolveStats: radio.resolveStats ?? null,
      lastSongUrlRawShape: radio.lastSongUrlRawShape ?? null,
      lastDJLine: radio.lastDJLine ?? null,
      blockedDJLines: radio.lastBlockedDJLines ?? [],
      ttsMode: radio.ttsMode ?? null,
      ttsProvider: radio.ttsProvider ?? null,
      ttsVoice: radio.ttsVoice ?? null,
      ttsRate: radio.ttsRate ?? null,
      ttsPitch: radio.ttsPitch ?? null,
      duckedVolume: radio.duckedVolume ?? null,
      djAudioUrl: radio.lastDJAudioUrl ?? null,
      djCurrentSrc: this.core.audioEngine.getCurrentDJSrc(),
      queueVersion: radio.queueVersion ?? 0,
      queuePatchApplied: radio.lastQueuePatchApplied ?? false,
      queuePatchBeforeIds: radio.lastQueuePatchBeforeIds ?? [],
      queuePatchAfterIds: radio.lastQueuePatchAfterIds ?? [],
      queuePatchBeforeProviderIds: radio.lastQueuePatchBeforeProviderIds ?? [],
      queuePatchAfterProviderIds: radio.lastQueuePatchAfterProviderIds ?? [],
      queuePatchBeforeInternalIds: radio.lastQueuePatchBeforeInternalIds ?? [],
      queuePatchAfterInternalIds: radio.lastQueuePatchAfterInternalIds ?? [],
      queuePatchResolvedIds: radio.lastQueuePatchResolvedIds ?? [],
      queuePatchUnresolvedIds: radio.lastQueuePatchUnresolvedIds ?? [],
      queuePatchNoopReason: radio.lastQueuePatchNoopReason ?? null,
      skipNowApplied: radio.lastSkipNowApplied ?? false,
      skippedFromTrackId: radio.lastSkippedFromTrackId ?? null,
      skippedToTrackId: radio.lastSkippedToTrackId ?? null,
      decisionProvider: radio.lastDecisionProvider ?? null,
      decisionUsedFallback: radio.lastDecisionUsedFallback ?? null,
      decisionFallbackReason: radio.lastDecisionFallbackReason ?? null,
      decisionRawPrompt: radio.lastDecisionRawPrompt ?? null,
      decisionRawResponse: radio.lastDecisionRawResponse ?? null,
      decisionPromptType: radio.lastDecisionPromptType ?? null,
      directorOffline,
      directorDebugEvidence,
      latestSpeech,
      latestOpeningSpeech,
      latestSpeakAttemptEvent: latestAttempt?.event ?? null,
      latestSpeakAttemptUsedLiveDirector: latestAttempt ? latestAttempt.deepseekCalled && !latestAttempt.deepseekUsedFallback : false,
      programPlanProvider: radio.lastProgramPlanProvider ?? null,
      programPlanUsedFallback: radio.lastProgramPlanUsedFallback ?? null,
      programPlanError: radio.lastProgramPlanError ?? null,
      programPlanRawPrompt: radio.lastProgramPlanRawPrompt ?? null,
      programPlanRawResponse: radio.lastProgramPlanRawResponse ?? null,
      programPlanQueueBeforeProviderIds: radio.lastProgramPlanQueueBeforeProviderIds ?? [],
      programPlanQueueAfterProviderIds: radio.lastProgramPlanQueueAfterProviderIds ?? [],
      programPlanQueueChanged: radio.lastProgramPlanQueueChanged ?? false,
      djBrainFallbackActive: radio.djBrainFallbackActive ?? false,
      djHostDebug: radio.djHostDebug ?? this.core.sessionEngine.getDJHostDebugState?.() ?? null,
      djSpeakAttempts: radio.djSpeakAttempts ?? [],
      prepareState: this.prepareStateValue,
      hasStarted: this.hasStartedFlag,
      programTitle: this.programTitleValue ?? null,
      startup: {
        ...this.startupValue,
        musicAudioPaused: optionalAudioDiagnostics(this.core.audioEngine).isMusicPaused?.() ?? true,
      },
    };
  }

  async refreshStatus(options: { prepare?: boolean } = {}) {
    this.setNeteaseState({ loading: true, message: "正在检查网易云登录状态。" });
    const payload = await this.readStatusImpl();

    if (!payload.ok) {
      this.errorValue = payload.message ?? "网易云状态接口不可用。";
      this.core.store.setState({
        status: "error",
        currentSubtitle: this.errorValue,
        providerStatus: {
          provider: "netease",
          status: "unavailable",
          message: this.errorValue,
        },
      });
      this.setNeteaseState({
        loading: false,
        authenticated: false,
        loginState: "login_required",
        message: this.errorValue,
      });
      return this.getSnapshot();
    }

    if (!payload.authenticated || payload.loginState !== "logged_in") {
      this.hasStartedFlag = false;
      this.prepareStateValue = "idle";
      this.programTitleValue = undefined;
      this.core.store.setState({
        status: "login_required",
        queue: [],
        playableQueue: [],
        currentIndex: 0,
        currentTrack: null,
        isPlaying: false,
        isSpeaking: false,
        currentTime: 0,
        duration: 0,
        currentSubtitle: payload.message ?? "请先扫码登录网易云。",
        providerStatus: {
          provider: "netease",
          status: "unavailable",
          message: payload.message ?? "请先扫码登录网易云。",
        },
        error: undefined,
      });
      this.setNeteaseState({
        loading: false,
        authenticated: false,
        loginState: "login_required",
        message: payload.message ?? "请先扫码登录网易云。",
      });
      if (!this.neteaseState.qrKey) {
        void this.createQRCode();
      }
      return this.getSnapshot();
    }

    this.errorValue = undefined;
    this.setNeteaseState({
      loading: false,
      authenticated: true,
      loginState: "logged_in",
      message: payload.message ?? "网易云已连接。",
      profile: payload.profile,
      likedPlaylistId: payload.likedPlaylistId,
      playlistsCount: payload.playlistsCount,
      playableTrackCount: payload.playableTrackCount,
      qrKey: undefined,
      qrImageUrl: undefined,
      qrStatus: "authorized",
    });

    if (options.prepare !== false) {
      await this.prepareSession(payload.likedPlaylistId);
    } else {
      this.core.store.setState({
        providerStatus: {
          provider: "netease",
          status: "available",
          message: payload.message ?? "网易云已连接。",
        },
      });
    }

    return this.getSnapshot();
  }

  async createQRCode() {
    this.setNeteaseState({
      loading: true,
      qrStatus: "pending",
      message: "正在生成网易云登录二维码。",
    });

    const payload = await this.createQRCodeImpl();
    if (!payload.ok || !payload.qrKey || !payload.qrImageUrl) {
      const message = payload.message ?? "二维码生成失败。";
      this.setNeteaseState({
        loading: false,
        qrStatus: "idle",
        message,
      });
      this.core.store.setState({
        status: "login_required",
        currentSubtitle: message,
      });
      return;
    }

    this.setNeteaseState({
      loading: false,
      authenticated: false,
      loginState: "login_required",
      qrKey: payload.qrKey,
      qrImageUrl: payload.qrImageUrl,
      qrStatus: "pending",
      message: "打开网易云扫码，频道就能接上。",
    });
    this.core.store.setState({
      status: "login_required",
      currentSubtitle: "打开网易云扫码，登录后我就开始准备你的频道。",
    });

    this.schedulePoll(payload.qrKey);
  }

  async pollQRCode(qrKey?: string) {
    const currentKey = qrKey ?? this.neteaseState.qrKey;
    if (!currentKey) {
      return;
    }

    const payload = await this.checkQRCodeImpl(currentKey);
    if (!payload.ok) {
      this.setNeteaseState({ message: payload.message ?? "二维码状态检查失败。" });
      this.schedulePoll(currentKey);
      return;
    }

    const status = payload.status ?? "pending";
    if (status === "authorized" || status === "logged_in" || status === "partial_logged_in") {
      this.setNeteaseState({
        qrStatus: "authorized",
        message: "登录成功，正在准备你的正式频道。",
      });
      await this.refreshStatus({ prepare: true });
      return;
    }

    if (status === "expired") {
      this.setNeteaseState({
        qrStatus: "expired",
        message: "二维码已过期，请重新生成。",
      });
      return;
    }

    this.setNeteaseState({
      qrStatus: status,
      message: status === "scanned" ? "已扫码，请在网易云里确认登录。" : "等待网易云扫码确认。",
    });
    this.schedulePoll(currentKey);
  }

  async prepareSession(explicitPlaylistId?: string) {
    if (this.prepareStateValue === "ready" && this.core.store.getState().playableQueue.length) {
      return this.getSnapshot();
    }

    if (this.preparePromise) {
      await this.preparePromise;
      return this.getSnapshot();
    }

    this.preparePromise = (async () => {
      let playlistId = explicitPlaylistId?.trim() || this.neteaseState.likedPlaylistId?.trim() || "";
      if (!playlistId && this.neteaseState.loginState !== "logged_in") {
        await this.refreshStatus({ prepare: false });
        playlistId = this.neteaseState.likedPlaylistId?.trim() || "";
      }

      if (!playlistId) {
        this.prepareStateValue = "error";
        this.errorValue = "没有可用的网易云默认歌单。";
        this.core.store.setState({
          status: "need_playable_tracks",
          currentSubtitle: "网易云已经连上了，但我还没有拿到默认歌单。",
          providerStatus: {
            provider: "netease",
            status: "degraded",
            message: this.errorValue,
          },
          error: this.errorValue,
        });
        return;
      }

      this.prepareStateValue = "preparing";
      this.errorValue = undefined;
      this.emit();
      this.core.store.setState({
        status: "loading_library",
        currentSubtitle: "我先帮你把频道接好，马上就能直接开播。",
        providerStatus: {
          provider: "netease",
          status: "available",
          message: "正在准备正式网易云队列。",
        },
      });

      const payload = await this.buildQueueImpl(playlistId, { limit: 100, level: "standard" });
      this.setNeteaseState({ playableTrackCount: payload.stats.playable });

      if (!payload.ok || !payload.playableTracks.length) {
        this.prepareStateValue = "error";
        this.errorValue = payload.message ?? "正式网易云队列构建失败。";
        this.hasStartedFlag = false;
        this.programTitleValue = payload.playlistName || undefined;
        this.core.store.setState({
          status: "need_playable_tracks",
          queue: [],
          playableQueue: [],
          currentIndex: 0,
          currentTrack: null,
          isPlaying: false,
          isSpeaking: false,
          currentTime: 0,
          duration: 0,
          currentSubtitle: "歌单已经读到了，但这次正式队列里还没有拿到可播放歌曲。",
          providerStatus: {
            provider: "netease",
            status: "degraded",
            message: payload.message ?? `共 ${payload.stats.total} 首，成功 ${payload.stats.playable} 首，失败 ${payload.stats.failed} 首。`,
          },
          resolveStats: {
            total: payload.stats.total,
            playable: payload.stats.playable,
            noUrl: payload.stats.noUrl,
            vipOnly: payload.stats.vipOnly,
            copyrightUnavailable: payload.stats.copyrightUnavailable,
            apiError: payload.stats.apiError,
            unknown: Math.max(0, payload.stats.failed - payload.stats.noUrl - payload.stats.vipOnly - payload.stats.copyrightUnavailable - payload.stats.apiError),
          },
          error: this.errorValue,
        });
        return;
      }

      const result: BuildQueueResult = {
        playlistId: payload.playlistId,
        playlistName: payload.playlistName,
        tracksTotal: payload.tracksTotal,
        playableTracks: payload.playableTracks,
        failedTracks: payload.failedTracks,
        stats: payload.stats,
      };
      const planning = await this.planProgramImpl({
        playlistName: result.playlistName,
        playableTracks: result.playableTracks,
      }).catch(() => null);
      await this.core.sessionEngine.loadNeteaseQueue(result, {
        programPlan: planning?.parsedPlan,
        planningDebug: planning
          ? {
              provider: planning.provider,
              usedFallback: planning.usedFallback,
              error: planning.error?.message ?? null,
              rawPrompt: planning.rawPrompt,
              rawResponse: planning.rawResponse,
            }
          : undefined,
      });
      const preparedOpeningSpeech = await this.core.sessionEngine.prepareOpening?.();
      if (preparedOpeningSpeech && !this.core.store.getState().preparedOpeningSpeech) {
        this.core.store.setState({
          preparedOpeningSpeech,
        });
      }
      this.programTitleValue = planning?.parsedPlan.title ?? result.playlistName;
      this.prepareStateValue = "ready";
      this.emit();
    })().finally(() => {
      this.preparePromise = null;
      this.emit();
    });

    await this.preparePromise;
    return this.getSnapshot();
  }

  async startSessionFromUserGesture(startedFrom: StartupSource = "unknown") {
    if (this.startPromise) {
      return this.startPromise;
    }

    this.starting = true;
    this.setStartupState({
      startedFrom,
      playCallTimestamp: undefined,
      routePushTimestamp: undefined,
      firstPlayError: undefined,
    });
    this.emit();
    this.startPromise = (async () => {
      this.primeAudio();
      if (!this.core.store.getState().currentTrack) {
        await this.prepareSession();
      }

      if (!this.core.store.getState().currentTrack) {
        this.starting = false;
        this.emit();
        return false;
      }

      this.hasStartedFlag = true;
      this.setStartupState({
        playCallTimestamp: Date.now(),
      });
      this.emit();

      try {
        await this.core.sessionEngine.enterChannel();
        const audioDiagnostics = optionalAudioDiagnostics(this.core.audioEngine);
        const actualPlayCallTimestamp = audioDiagnostics.getLastPlayCallTimestamp?.();
        this.setStartupState({
          playCallTimestamp: actualPlayCallTimestamp ?? this.startupValue.playCallTimestamp,
          firstPlayError: audioDiagnostics.getFirstPlayError?.(),
        });
        this.hasStartedFlag = true;
        return true;
      } catch (error) {
        const audioDiagnostics = optionalAudioDiagnostics(this.core.audioEngine);
        this.setStartupState({
          firstPlayError: audioDiagnostics.getFirstPlayError?.() ?? errorMessage(error),
        });
        this.core.store.setState({
          status: "locked",
          isPlaying: false,
          currentSubtitle: "频道已经接上了。声音暂时没有出来，轻点页面就能恢复。",
        });
        return true;
      } finally {
        this.starting = false;
        this.startPromise = null;
        this.emit();
      }
    })();

    return this.startPromise;
  }

  primeAudio() {
    this.core.audioEngine.unlockByUserGesture();
    this.core.store.setState({ unlockedByUser: true });
  }

  markRoutePush(timestamp = Date.now()) {
    this.setStartupState({
      routePushTimestamp: timestamp,
    });
  }

  markProviderMountedAtRoot() {
    this.setStartupState({
      providerMountedAtRoot: true,
    });
  }

  async play() {
    await this.core.sessionEngine.resume();
  }

  pause() {
    this.core.sessionEngine.pause();
  }

  async next() {
    await this.core.sessionEngine.nextTrack();
  }

  async previous() {
    await this.core.sessionEngine.previousTrack();
  }

  async playTrack(index: number) {
    await this.core.sessionEngine.playTrack(index);
  }

  async refreshProgram() {
    await this.refreshStatus({ prepare: true });
  }

  async tuneByPrompt(prompt: string) {
    await this.core.sessionEngine.tuneByPrompt(prompt);
  }

  async applyDJDecision(decision: DJDirectingDecision) {
    await this.core.sessionEngine.applyDJDecision(decision);
  }

  replaceUpcomingTracks(trackIds: string[]) {
    return this.core.sessionEngine.replaceUpcomingTracks(trackIds);
  }

  insertAfterCurrent(trackIds: string[]) {
    return this.core.sessionEngine.insertAfterCurrent(trackIds);
  }

  reorderUpcoming(trackIds: string[]) {
    return this.core.sessionEngine.reorderUpcoming(trackIds);
  }

  seek(timeMs: number) {
    this.core.sessionEngine.seek(timeMs);
  }

  setVolume(volume: number) {
    this.core.sessionEngine.setVolume(volume);
  }

  async speakDJ(lines: string | string[]) {
    const subtitle = Array.isArray(lines) ? lines.join("") : lines;
    await this.core.djEngine.speak(subtitle);
  }

  async testDJSpeakPipeline(event: "opening" | "track_intro" | "bridge" | "user_tune" | "outro" | "manual_test") {
    await this.core.sessionEngine.testSpeakPipeline(event);
  }

  duckMusic() {
    this.core.audioEngine.duckMusic();
  }

  restoreMusic() {
    this.core.audioEngine.restoreMusic();
  }

  private setNeteaseState(next: Partial<NeteaseControllerState>) {
    const nextState = {
      ...this.neteaseState,
      ...next,
    };
    if (shallowEqualObject(this.neteaseState, nextState)) {
      return;
    }
    this.neteaseState = nextState;
    this.emit();
  }

  private setStartupState(next: Partial<StartupDiagnostics>) {
    const draft = {
      ...this.startupValue,
      ...next,
    };
    const nextState = {
      ...draft,
      playCalledBeforeRoutePush: Boolean(
        draft.playCallTimestamp && draft.routePushTimestamp && draft.playCallTimestamp <= draft.routePushTimestamp,
      ),
    };
    if (shallowEqualObject(this.startupValue as Record<string, unknown>, nextState as Record<string, unknown>)) {
      return;
    }
    this.startupValue = nextState;
    this.emit();
  }

  private schedulePoll(qrKey: string) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      void this.pollQRCode(qrKey);
    }, 1800);
  }

  private emit() {
    const nextSnapshot = this.buildSnapshot();
    if (this.isSameSnapshot(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): RadioRuntimeSnapshot {
    const radio = this.core.store.getState();
    const isReady = Boolean(radio.currentTrack && radio.playableQueue.length && this.prepareStateValue === "ready");
    const directorOffline = this.isDirectorOffline();
    const directorDebugEvidence = this.getDirectorDebugEvidence();
    return {
      radio,
      netease: this.neteaseState,
      prepareState: this.prepareStateValue,
      hasPrepared: this.prepareStateValue === "ready",
      hasStarted: this.hasStartedFlag,
      programTitle: this.programTitleValue,
      directorOffline,
      directorDebugEvidence,
      startup: this.startupValue,
      isReady,
      isStarting: this.starting,
      error: this.errorValue,
    };
  }

  private isSameSnapshot(current: RadioRuntimeSnapshot, next: RadioRuntimeSnapshot) {
    return (
      current.radio === next.radio &&
      current.netease === next.netease &&
      current.prepareState === next.prepareState &&
      current.hasPrepared === next.hasPrepared &&
      current.hasStarted === next.hasStarted &&
      current.programTitle === next.programTitle &&
      current.directorOffline === next.directorOffline &&
      current.directorDebugEvidence === next.directorDebugEvidence &&
      current.startup === next.startup &&
      current.isReady === next.isReady &&
      current.isStarting === next.isStarting &&
      current.error === next.error
    );
  }

  private isDirectorOffline() {
    const radio = this.core.store.getState();
    return Boolean(radio.lastProgramPlanUsedFallback || radio.djBrainFallbackActive || radio.lastProgramPlanError);
  }

  private getDirectorDebugEvidence() {
    const radio = this.core.store.getState();
    const evidence = new Set<string>();
    if (radio.lastProgramPlanUsedFallback) evidence.add("program_plan_used_fallback");
    if (radio.djBrainFallbackActive) evidence.add("dj_brain_fallback_active");
    if (radio.lastProgramPlanError) evidence.add(`program_plan_error: ${radio.lastProgramPlanError}`);
    if (radio.lastDecisionUsedFallback) evidence.add("decision_used_fallback");
    if (radio.lastDecisionFallbackReason) evidence.add(`decision_fallback_reason: ${radio.lastDecisionFallbackReason}`);
    return [...evidence];
  }
}

export type { BuildQueueResponse, NeteaseControllerState, NeteaseStatusResponse, QRCheckResponse, QRCreateResponse, QRStatus };





