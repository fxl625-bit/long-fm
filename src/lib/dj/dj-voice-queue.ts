import { guardDJLines, type BlockedDJLine } from "./final-dj-line-guard";

type QueueSpeakOptions = {
  withinGroup?: boolean;
};

type EnqueueOptions = {
  priority?: "low" | "normal" | "high";
  bypassGuard?: boolean;
  rewrite?: (blockedLines: BlockedDJLine[]) => Promise<string[]>;
  fallbackLines?: string[];
  onGuardResult?: (result: {
    rawLines: string[];
    safeLines: string[];
    blockedLines: BlockedDJLine[];
    rewriteAttempted: boolean;
    rewriteLines: string[];
    fallbackUsed: boolean;
    fallbackLines: string[];
    finalLines: string[];
    skippedReason?: string;
  }) => void;
  onPlayed?: (line: string) => void;
};

type QueueDJEngine = {
  beginSpeechGroup?: () => void;
  endSpeechGroup?: () => void;
  isSpeaking?: () => boolean;
  speak: (line: string, options?: QueueSpeakOptions) => Promise<void>;
};

type VoiceJob = {
  lines: string[];
  priority: "low" | "normal" | "high";
  resolve: () => void;
  reject: (error: unknown) => void;
  onPlayed?: (line: string) => void;
};

type RecentLine = {
  text: string;
  spokenAt: number;
};

type QueueGuardHooks = {
  onBlocked?: (blockedLines: BlockedDJLine[]) => void;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class DJVoiceQueue {
  private readonly djEngine: QueueDJEngine;
  private readonly gapMs: number;
  private readonly onBlocked?: QueueGuardHooks["onBlocked"];
  private jobs: VoiceJob[] = [];
  private running = false;
  private recentLines: RecentLine[] = [];
  private blockedLines: BlockedDJLine[] = [];

  constructor(input: {
    djEngine: QueueDJEngine;
    gapMs?: number;
    onBlocked?: QueueGuardHooks["onBlocked"];
  }) {
    this.djEngine = input.djEngine;
    this.gapMs = input.gapMs ?? 500;
    this.onBlocked = input.onBlocked;
  }

  async enqueue(lines: string[], options: EnqueueOptions = {}) {
    const rawLines = lines.map((line) => line.trim()).filter(Boolean);
    const guarded = options.bypassGuard
      ? {
          ok: rawLines.length > 0,
          safeLines: rawLines,
          blockedLines: [] as BlockedDJLine[],
        }
      : guardDJLines(rawLines);
    if (guarded.blockedLines.length) {
      this.rememberBlockedLines(guarded.blockedLines);
      this.onBlocked?.(guarded.blockedLines);
    }

    let rewriteAttempted = false;
    let rewriteLines: string[] = [];
    let fallbackUsed = false;
    let fallbackLines: string[] = [];
    let finalLines = guarded.safeLines;

    if (!options.bypassGuard && !finalLines.length && guarded.blockedLines.length && options.rewrite) {
      rewriteAttempted = true;
      rewriteLines = (await options.rewrite(guarded.blockedLines).catch(() => [])).map((line) => line.trim()).filter(Boolean);
      const rewriteGuarded = guardDJLines(rewriteLines);
      if (rewriteGuarded.blockedLines.length) {
        this.rememberBlockedLines(rewriteGuarded.blockedLines);
        this.onBlocked?.(rewriteGuarded.blockedLines);
      }
      finalLines = rewriteGuarded.safeLines;
    }

    if (!options.bypassGuard && !finalLines.length && options.fallbackLines?.length) {
      fallbackUsed = true;
      fallbackLines = options.fallbackLines.map((line) => line.trim()).filter(Boolean);
      const fallbackGuarded = guardDJLines(fallbackLines);
      if (fallbackGuarded.blockedLines.length) {
        this.rememberBlockedLines(fallbackGuarded.blockedLines);
        this.onBlocked?.(fallbackGuarded.blockedLines);
      }
      finalLines = fallbackGuarded.safeLines;
    }

    const normalized = this.filterRecentDuplicates(finalLines);
    if (!normalized.length) {
      options.onGuardResult?.({
        rawLines,
        safeLines: guarded.safeLines,
        blockedLines: guarded.blockedLines,
        rewriteAttempted,
        rewriteLines,
        fallbackUsed,
        fallbackLines,
        finalLines: [],
        skippedReason: fallbackUsed ? "fallback_lines_blocked_or_duplicate" : "all_lines_blocked",
      });
      return Promise.resolve();
    }

    options.onGuardResult?.({
      rawLines,
      safeLines: guarded.safeLines,
      blockedLines: guarded.blockedLines,
      rewriteAttempted,
      rewriteLines,
      fallbackUsed,
      fallbackLines,
      finalLines: normalized,
    });

    return new Promise<void>((resolve, reject) => {
      const job: VoiceJob = {
        lines: normalized,
        priority: options.priority ?? "normal",
        resolve,
        reject,
        onPlayed: options.onPlayed,
      };
      if (job.priority === "high") {
        this.jobs = [job, ...this.jobs];
      } else {
        this.jobs.push(job);
      }
      void this.playNext();
    });
  }

  clear() {
    this.jobs = [];
    this.recentLines = [];
  }

  isActive() {
    return this.running || this.jobs.length > 0 || Boolean(this.djEngine.isSpeaking?.());
  }

  getRecentLines() {
    return this.recentLines.map((entry) => entry.text);
  }

  getBlockedLines() {
    return [...this.blockedLines];
  }

  private async playNext() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift();
        if (!job) {
          continue;
        }

        this.djEngine.beginSpeechGroup?.();
        try {
          for (let index = 0; index < job.lines.length; index += 1) {
            const line = job.lines[index];
            try {
              await this.djEngine.speak(line, { withinGroup: true });
              this.rememberLine(line);
              job.onPlayed?.(line);
            } catch {
              // Keep the rest of the monologue running even if one line fails to synthesize.
            }

            if (index < job.lines.length - 1) {
              await sleep(this.gapMs);
            }
          }
          job.resolve();
        } catch (error) {
          job.reject(error);
        } finally {
          this.djEngine.endSpeechGroup?.();
        }
      }
    } finally {
      this.running = false;
    }
  }

  private normalizeLine(text: string) {
    return text.replace(/[，。！？、,.!?]/g, "").replace(/\s+/g, "").trim();
  }

  private similarity(left: string, right: string) {
    const a = this.normalizeLine(left);
    const b = this.normalizeLine(right);
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }

    const leftChars = new Set(a.split(""));
    const rightChars = new Set(b.split(""));
    const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
    return overlap / Math.max(leftChars.size, rightChars.size, 1);
  }

  private filterRecentDuplicates(lines: string[]) {
    const now = Date.now();
    const recentWindow = this.recentLines.filter((entry) => now - entry.spokenAt <= 10 * 60 * 1000).slice(-10);
    return lines.filter((line) => recentWindow.every((entry) => this.similarity(line, entry.text) <= 0.75));
  }

  private rememberLine(text: string) {
    this.recentLines = [...this.recentLines, { text, spokenAt: Date.now() }].slice(-12);
  }

  private rememberBlockedLines(lines: BlockedDJLine[]) {
    this.blockedLines = [...this.blockedLines, ...lines].slice(-12);
  }
}

