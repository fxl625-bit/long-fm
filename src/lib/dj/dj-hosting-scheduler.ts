import type {
  DJDirectorTrigger,
  DJHostDebugState,
  DJHostGuardResult,
  DJHostState,
  DJProgramPlan,
  DJTalkBreakEvent,
  DJTalkBreakResult,
} from "./dj-types";
import type { Track } from "@/lib/radio/radio-types";
import type { DJVoiceQueue } from "./dj-voice-queue";

type SchedulerVoiceQueue = Pick<DJVoiceQueue, "enqueue" | "clear" | "isActive"> & {
  getRecentLines?: () => string[];
};

type DecisionRequest = (
  trigger: DJDirectorTrigger,
  payload?: { intent?: string; event?: DJTalkBreakEvent },
) => Promise<DJTalkBreakResult | void>;

type StartContext = {
  currentTrack: Track | null;
  currentIndex: number;
  queueLength: number;
};

type HostingMomentType = "opening" | "track_intro" | "bridge" | "style_shift" | "time_context" | "outro";

const EMPTY_GUARD_RESULT: DJHostGuardResult = {
  ok: true,
  safeLines: [],
  blockedLines: [],
};

function isoNow() {
  return new Date().toISOString();
}

function createDebugState(): DJHostDebugState {
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

export class DJHostingScheduler {
  private readonly voiceQueue: SchedulerVoiceQueue;
  private readonly requestDecision?: DecisionRequest;
  private readonly canHostNow?: () => boolean;
  private readonly onDebugChange?: (debug: DJHostDebugState) => void;
  private plan: DJProgramPlan | null = null;
  private firedMoments = new Set<string>();
  private playedCount = 0;
  private currentTrackIndex = 0;
  private queueLength = 0;
  private started = false;
  private lastBridgeAt = 0;
  private lastStyleShiftAt = 0;
  private lastTrackIntroTrackId: string | null = null;
  private state: DJHostState = "idle";
  private debug = createDebugState();

  constructor(input: {
    voiceQueue: SchedulerVoiceQueue;
    requestDecision?: DecisionRequest;
    canHostNow?: () => boolean;
    onDebugChange?: (debug: DJHostDebugState) => void;
  }) {
    this.voiceQueue = input.voiceQueue;
    this.requestDecision = input.requestDecision;
    this.canHostNow = input.canHostNow;
    this.onDebugChange = input.onDebugChange;
  }

  start(plan: DJProgramPlan | null, context: StartContext, opts?: { skipOpening?: boolean }) {
    this.plan = plan;
    this.firedMoments.clear();
    this.playedCount = 0;
    this.currentTrackIndex = context.currentIndex;
    this.queueLength = context.queueLength;
    this.started = true;
    this.lastTrackIntroTrackId = null;
    this.lastBridgeAt = 0;
    this.lastStyleShiftAt = 0;
    this.setState("opening");
    if (!opts?.skipOpening) {
      void this.scheduleOpening(context.currentTrack);
    } else {
      this.firedMoments.add("opening");
      this.updateDebug({ openingDone: true, lastTalkBreakEvent: "opening" });
      this.setState("playing_music");
    }
  }

  stop() {
    this.started = false;
    this.firedMoments.clear();
    this.playedCount = 0;
    this.voiceQueue.clear();
    this.setState("ended");
  }

  pause() {
    this.voiceQueue.clear();
    this.setState("paused");
  }

  resume() {
    if (!this.started) {
      return;
    }
    this.setState("playing_music");
  }

  onTrackStart(track: Track | null, index: number, queueLength: number) {
    if (!this.canHost()) {
      return;
    }
    this.currentTrackIndex = index;
    this.queueLength = queueLength;
    if (track?.id && this.lastTrackIntroTrackId !== track.id) {
      this.setState("track_intro_pending");
    }
  }

  onTrackEnd(track: Track | null, index: number, queueLength: number) {
    if (!this.started || !this.canHost()) {
      return;
    }

    this.playedCount += 1;
    this.currentTrackIndex = index;
    this.queueLength = queueLength;
    this.updateDebug({ playedCount: this.playedCount });

    if (!this.outroShown() && queueLength > 0 && index >= queueLength - 1) {
      void this.scheduleMoment("outro", track, this.playedCount);
    }
  }

  onTimeTick(seconds: number, track: Track | null, index: number, queueLength: number) {
    if (!this.started || !this.canHost()) {
      return;
    }

    this.currentTrackIndex = index;
    this.queueLength = queueLength;

    if (track?.id && seconds >= 8 && seconds <= 20 && this.lastTrackIntroTrackId !== track.id) {
      void this.scheduleMoment("track_intro", track, seconds);
    }
  }

  onUserTune(intent: string) {
    if (!intent.trim()) {
      return;
    }

    if (this.requestDecision) {
      void this.requestDecision("user_tune", { intent: intent.trim(), event: "user_tune" });
    }
  }

  notifyPaused() {
    this.pause();
  }

  notifyEnded() {
    if (this.outroShown()) {
      this.stop();
      return;
    }
    void this.scheduleMoment("outro", null, this.playedCount);
    this.stop();
  }

  noteGuardResult(event: DJTalkBreakEvent, guardResult: DJHostGuardResult, pattern?: string, attemptedLines?: string[]) {
    const spokenLines = guardResult.safeLines;
    const blockedLines = guardResult.blockedLines;
    const attempted = attemptedLines ?? [...spokenLines, ...blockedLines.map((item) => item.line)];
    const patch: Partial<DJHostDebugState> = {
      lastTalkBreakEvent: event,
      lastTalkBreakPattern: pattern ?? this.debug.lastTalkBreakPattern,
      lastGuardResult: guardResult,
      lastBlockedLines: blockedLines,
      recentDJLines: this.voiceQueue.getRecentLines?.().slice(-5) ?? this.debug.recentDJLines,
      lastTalkBreakFailed: !spokenLines.length,
      lastTalkBreakFailureReason: !spokenLines.length ? blockedLines.map((line) => line.reason).join(" | ") || "no_safe_lines" : null,
      consecutiveTalkFailures: spokenLines.length ? 0 : this.debug.consecutiveTalkFailures + 1,
      pendingTalkBreaks: this.debug.pendingTalkBreaks.filter((item) => item !== event),
    };

    if (spokenLines.length) {
      patch.lastSpokenAt = isoNow();
      patch.recentDJLines = [...this.debug.recentDJLines, ...spokenLines].slice(-5);
    }

    if (event === "opening") {
      patch.openingDone = true;
      patch.openingLinesAttempted = attempted;
      patch.openingLinesSpoken = spokenLines;
      patch.openingBlockedLines = blockedLines;
    }

    this.updateDebug(patch);
  }

  noteTalkBreakResult(event: DJTalkBreakEvent, result: DJTalkBreakResult | void) {
    if (!result) {
      if (event === "opening") {
        this.updateDebug({ openingDone: true, lastTalkBreakEvent: event });
      }
      return;
    }

    this.noteGuardResult(
      event,
      result.guardResult ?? {
        ...EMPTY_GUARD_RESULT,
        ok: result.blockedLines.length === 0 && result.spokenLines.length > 0,
        safeLines: result.spokenLines,
        blockedLines: result.blockedLines,
      },
      result.pattern,
      result.attemptedLines,
    );
  }

  getDebugState(): DJHostDebugState {
    return {
      ...this.debug,
      state: this.state,
      schedulerRunning: this.started && this.state !== "paused" && this.state !== "ended",
      playedCount: this.playedCount,
      currentTrackIntroDoneTrackId: this.lastTrackIntroTrackId,
      recentDJLines: this.voiceQueue.getRecentLines?.().slice(-5) ?? this.debug.recentDJLines,
    };
  }

  private async scheduleOpening(track: Track | null) {
    if (!this.canHost()) {
      return;
    }
    if (this.firedMoments.has("opening")) {
      return;
    }

    this.firedMoments.add("opening");
    this.updateDebug({ lastTalkBreakEvent: "opening", openingDone: false });
    this.markSchedulerEvent("opening");

    if (!this.requestDecision) {
      this.updateDebug({
        openingDone: true,
        lastTalkBreakEvent: "opening",
        lastSchedulerEvent: "opening",
        eventTriggeredAt: isoNow(),
      });
      this.setState("playing_music");
      return;
    }

    const result = await this.requestDecision("opening", { event: "opening" });
    this.noteTalkBreakResult("opening", result);
    this.setState("playing_music");
    void track;
  }

  private async scheduleMoment(type: HostingMomentType, track: Track | null, progress: number) {
    if (!this.canHost()) {
      return;
    }

    const momentId = type === "track_intro" && track?.id ? `${type}-${track.id}` : `${type}-${progress}`;
    if (this.firedMoments.has(momentId)) {
      return;
    }

    const now = Date.now();
    if (type === "track_intro" && track?.id && this.lastTrackIntroTrackId === track.id) {
      return;
    }
    if (type === "style_shift" && now - this.lastStyleShiftAt < 4 * 60_000) {
      return;
    }

    const directorTrigger =
      type === "track_intro"
        ? "introduce_current"
        : type === "bridge"
          ? "bridge_to_next"
          : type === "style_shift"
            ? "shift_style"
            : type === "time_context"
              ? "time_context"
              : type === "outro"
                ? "music_ended"
                : null;

    this.firedMoments.add(momentId);
    const event = this.eventForMoment(type);
    this.markSchedulerEvent(event);
    this.rememberMoment(type, track, now);

    if (!directorTrigger || !this.requestDecision) {
      if (type === "track_intro") {
        this.setState("track_intro_done");
      } else if (type === "bridge") {
        this.setState("playing_music");
      } else if (type === "style_shift" || type === "time_context" || type === "outro") {
        this.setState("playing_music");
      }
      return;
    }

    if (this.voiceQueue.isActive() && type !== "outro") {
      return;
    }

    this.setState(type === "bridge" ? "bridge_pending" : type === "track_intro" ? "track_intro_pending" : "speaking");
    const result = await this.requestDecision(directorTrigger, { event });
    this.noteTalkBreakResult(event, result);
    this.setState(type === "track_intro" ? "track_intro_done" : "playing_music");
  }

  private eventForMoment(type: HostingMomentType): DJTalkBreakEvent {
    if (type === "track_intro") return "track_intro";
    if (type === "bridge") return "bridge";
    if (type === "style_shift") return "style_shift";
    if (type === "time_context") return "time_context";
    if (type === "outro") return "outro";
    return "opening";
  }

  private canHost() {
    return this.started && (this.canHostNow?.() ?? true);
  }

  private rememberMoment(type: HostingMomentType, track: Track | null, now: number) {
    if (type === "track_intro" && track?.id) {
      this.lastTrackIntroTrackId = track.id;
      this.updateDebug({ currentTrackIntroDoneTrackId: track.id });
    }
    if (type === "bridge") {
      this.lastBridgeAt = now;
      this.updateDebug({ lastBridgeAt: new Date(now).toISOString() });
    }
    if (type === "style_shift") {
      this.lastStyleShiftAt = now;
    }
  }

  private setState(state: DJHostState) {
    this.state = state;
    this.updateDebug({
      state,
      schedulerRunning: this.started && state !== "paused" && state !== "ended",
    });
  }

  private markSchedulerEvent(event: DJTalkBreakEvent) {
    this.updateDebug({
      lastTalkBreakEvent: event,
      lastSchedulerEvent: event,
      eventTriggeredAt: isoNow(),
      pendingTalkBreaks: Array.from(new Set([...this.debug.pendingTalkBreaks, event])),
    });
  }

  private updateDebug(patch: Partial<DJHostDebugState>) {
    this.debug = {
      ...this.debug,
      ...patch,
      state: patch.state ?? this.state,
      schedulerRunning: patch.schedulerRunning ?? (this.started && this.state !== "paused" && this.state !== "ended"),
      playedCount: this.playedCount,
      currentTrackIntroDoneTrackId: this.lastTrackIntroTrackId,
    };
    this.onDebugChange?.(this.getDebugState());
  }

  private outroShown() {
    return this.debug.lastSchedulerEvent === "outro" || this.firedMoments.has("outro");
  }
}
