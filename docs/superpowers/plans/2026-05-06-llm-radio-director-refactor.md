# LLM Radio Director Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI DJ hosting path so DeepSeek becomes the primary radio director that emits paragraph-length hosting segments on a controlled cadence, without runtime guard/fallback logic silencing the station.

**Architecture:** Move the live hosting contract from sentence arrays plus quality gates to a paragraph-first `speech` contract owned by `llm-dj-director.ts` and orchestrated by `radio-session-engine.ts`. Keep legacy modules on disk for reference and tests, but route live playback around guard-based suppression and old pattern/quality enforcement. Add real-host corpus support, force-speak pacing, and end-to-end debug evidence proving when the director was called, what it returned, and how it was spoken.

**Tech Stack:** Next.js 16, TypeScript, Vitest, existing radio runtime/store/audio engine, DeepSeek JSON completion path.

---

### Task 1: Define the New Director Contract and Corpus Loader

**Files:**
- Create: `src/lib/dj/radio-host-real-corpus.txt`
- Create: `src/lib/dj/radio-host-real-corpus.ts`
- Modify: `src/lib/dj/dj-types.ts`
- Modify: `src/lib/dj/llm-dj-director.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Write the failing tests for the paragraph contract and corpus-backed prompt**

Add tests in `src/tests/unit/dj-director.test.ts` that assert:
1. `LLMDJDirector` normalizes a live payload shaped like:

```ts
{
  shouldSpeak: true,
  speech: "一整段主持表达……",
  durationHintSec: 24,
  insertAfterTracks: 2
}
```

2. `forceSpeak: true` injects stronger prompt instructions.
3. empty `speech` with `shouldSpeak: true` retries once and still does not fallback to template text.

- [ ] **Step 2: Run the targeted tests to confirm failure**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: FAIL because `speech`, `durationHintSec`, `insertAfterTracks`, and corpus prompt support do not exist yet.

- [ ] **Step 3: Add the real-host corpus assets**

Create `src/lib/dj/radio-host-real-corpus.txt` with at least 200 short paragraph samples (50-200 Chinese characters each), one paragraph per block separated by blank lines.

Create `src/lib/dj/radio-host-real-corpus.ts` with minimal helpers:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedCorpus: string[] | null = null;

export function loadRadioHostRealCorpus() {
  if (cachedCorpus) {
    return cachedCorpus;
  }

  const filePath = join(process.cwd(), "src/lib/dj/radio-host-real-corpus.txt");
  const raw = readFileSync(filePath, "utf-8");
  cachedCorpus = raw
    .split(/\r?\n\s*\r?\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
  return cachedCorpus;
}

export function buildRadioHostCorpusExcerpt(limit = 12) {
  return loadRadioHostRealCorpus().slice(0, limit);
}
```

- [ ] **Step 4: Update the director types to the paragraph-first response**

Modify `src/lib/dj/dj-types.ts` so the live DeepSeek response and live decision metadata support:

```ts
export type DJDirectorDecision = {
  shouldSpeak: boolean;
  speech: string;
  durationHintSec: number;
  insertAfterTracks: number;
  musicAction: DirectorMusicAction;
  energy: "low" | "mid" | "high";
};
```

Also extend `DJDirectorContext` with:

```ts
forceSpeak?: boolean;
tracksSinceLastSpeak?: number;
minutesSinceLastSpeak?: number;
```

- [ ] **Step 5: Rewrite `llm-dj-director.ts` around the new contract**

Make these changes:
1. Prompt rules must forbid sentence lists and require one paragraph.
2. Prompt must include corpus excerpt text via `buildRadioHostCorpusExcerpt()`.
3. `forceSpeak: true` must add stronger instructions requiring natural re-entry and 80-200 Chinese characters.
4. Response normalization must accept `speech` instead of `speak`.
5. If `shouldSpeak === true` and `speech` is empty, retry once with a retry reason embedded in the prompt.

Use a helper structure like:

```ts
type NormalizedDirectorPayload = {
  shouldSpeak: boolean;
  speech: string;
  durationHintSec: number;
  insertAfterTracks: number;
  musicAction: DirectorMusicAction;
  energy: "low" | "mid" | "high";
};
```

- [ ] **Step 6: Re-run the targeted director tests**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the contract and corpus work**

```bash
git add src/lib/dj/radio-host-real-corpus.txt src/lib/dj/radio-host-real-corpus.ts src/lib/dj/dj-types.ts src/lib/dj/llm-dj-director.ts src/tests/unit/dj-director.test.ts
git commit -m "feat: add paragraph-first llm radio director contract"
```

### Task 2: Rebuild Runtime Pacing Around Paragraph Hosting

**Files:**
- Modify: `src/lib/dj/dj-director.ts`
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

In `src/tests/unit/radio-session-engine.test.ts`, add tests proving:
1. The engine requests a fresh director paragraph after 2 silent tracks.
2. The engine requests a fresh director paragraph after 6 silent minutes.
3. A live `speech` paragraph is sent to TTS as one unit instead of sentence array scheduling.
4. Runtime no longer depends on `shouldSpeak=false` forever if silence thresholds are exceeded.

- [ ] **Step 2: Run the runtime tests to confirm failure**

Run: `npx vitest run src/tests/unit/radio-session-engine.test.ts`

Expected: FAIL because the engine still reasons in `lines[]` and does not use `insertAfterTracks` or paragraph pacing.

- [ ] **Step 3: Bridge the new director payload through `dj-director.ts`**

Update `src/lib/dj/dj-director.ts` so live LLM results map to legacy runtime shape temporarily, but preserve paragraph metadata:

```ts
lines: decision.shouldSpeak && decision.speech ? [decision.speech] : [],
meta: {
  provider: "deepseek",
  rawPrompt,
  rawResponse,
  promptType: trigger,
  scriptDebug: {
    durationHintSec: decision.durationHintSec,
    insertAfterTracks: decision.insertAfterTracks,
    attemptedLines: decision.shouldSpeak && decision.speech ? [decision.speech] : [],
  },
}
```

Do not run live LLM output through `validateDJLines()` or `final-dj-line-guard.ts`.

- [ ] **Step 4: Rework `radio-session-engine.ts` pacing**

Implement:
1. `lastSpeakTimestamp`
2. `tracksSinceLastSpeak`
3. `minutesSinceLastSpeak`
4. `forceSpeak`
5. `nextSpeechTrackThreshold`

Rules:
- if `tracksSinceLastSpeak >= 2` or `minutesSinceLastSpeak >= 6`, set `forceSpeak = true`
- after a successful spoken paragraph, reset the counters and set `nextSpeechTrackThreshold` from `insertAfterTracks`
- do not force one paragraph per song
- keep music moving if the LLM decides to stay quiet before the threshold

- [ ] **Step 5: Keep paragraph playback atomic**

Ensure `applyDJDecision()` and `enqueueDJLines()` treat a live LLM paragraph as one line:

```ts
await this.enqueueDJLines([decision.meta?.scriptDebug?.speech ?? decision.lines[0]], { ... });
```

Do not split the paragraph into multiple host fragments before queue/TTS.

- [ ] **Step 6: Re-run the runtime tests**

Run: `npx vitest run src/tests/unit/radio-session-engine.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the runtime pacing work**

```bash
git add src/lib/dj/dj-director.ts src/lib/radio/radio-session-engine.ts src/lib/radio/radio-types.ts src/tests/unit/radio-session-engine.test.ts
git commit -m "feat: drive radio hosting cadence from llm paragraph decisions"
```

### Task 3: Remove Guard/Pattern Enforcement from the Live Hosting Path and Expose Debug Evidence

**Files:**
- Modify: `src/lib/dj/dj-voice-queue.ts`
- Modify: `src/lib/radio/dj-engine.ts`
- Modify: `src/lib/radio/radio-runtime.ts`
- Modify: `src/components/radio/radio-session-client.tsx`
- Test: `src/tests/unit/dj-engine.test.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Write failing tests for live-path bypass and debug evidence**

Add tests covering:
1. live DeepSeek paragraph speech is not blocked by `final-dj-line-guard.ts`
2. debug state exposes `lastSpeakAt`, `tracksSinceLastSpeak`, `minutesSinceLastSpeak`, `forcedSpeakTriggered`
3. the UI debug snapshot surfaces the latest paragraph attempt and whether DeepSeek was called

- [ ] **Step 2: Run the tests to confirm failure**

Run:
```bash
npx vitest run src/tests/unit/dj-engine.test.ts src/tests/unit/radio-runtime.test.ts
```

Expected: FAIL because live hosting still flows through guard-oriented behavior and incomplete debug fields.

- [ ] **Step 3: Bypass live-path guard enforcement**

Update `src/lib/dj/dj-voice-queue.ts` and `src/lib/radio/dj-engine.ts` so live director paragraphs can pass through without `guardDJLines()` stripping them. Keep guard utilities callable only for manual debug tools or legacy non-director paths.

The runtime rule is:
- live LLM paragraphs: no guard interception
- legacy/manual safe-fallback test mode: existing guard behavior may remain

- [ ] **Step 4: Expand runtime debug state**

Update `src/lib/radio/radio-runtime.ts` to expose:

```ts
lastSpeakAt
tracksSinceLastSpeak
minutesSinceLastSpeak
forcedSpeakTriggered
decisionRawPrompt
decisionRawResponse
djSpeakAttempts
```

- [ ] **Step 5: Keep the UI simple but show richer dev debug**

Update `src/components/radio/radio-session-client.tsx` only inside the development-only debug area so it prints the new fields and the last 10 `djSpeakAttempts`.

Do not change the public radio UI layout.

- [ ] **Step 6: Re-run the debug/UI tests**

Run:
```bash
npx vitest run src/tests/unit/dj-engine.test.ts src/tests/unit/radio-runtime.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the live-path bypass and debug work**

```bash
git add src/lib/dj/dj-voice-queue.ts src/lib/radio/dj-engine.ts src/lib/radio/radio-runtime.ts src/components/radio/radio-session-client.tsx src/tests/unit/dj-engine.test.ts src/tests/unit/radio-runtime.test.ts
git commit -m "feat: expose llm radio director debug evidence and bypass live guard path"
```

### Task 4: Full Acceptance Verification and Cleanup

**Files:**
- Modify: `src/tests/unit/dj-voice-queue.test.ts`
- Modify: `src/tests/unit/dj-hosting-scheduler.test.ts`
- Modify: `src/tests/unit/dj-json-schema.test.ts`
- Optional notes: `DEBUG_REPORT.md`

- [ ] **Step 1: Add acceptance-oriented regression tests**

Cover:
1. no speech lists required for live path
2. `insertAfterTracks` influences future pacing
3. `forceSpeak` produces a DeepSeek call with non-empty paragraph output
4. station no longer enters permanent silence because of `shouldSpeak=false`

- [ ] **Step 2: Run the focused acceptance tests**

Run:
```bash
npx vitest run src/tests/unit/dj-voice-queue.test.ts src/tests/unit/dj-hosting-scheduler.test.ts src/tests/unit/dj-json-schema.test.ts
```

Expected: PASS

- [ ] **Step 3: Run full project verification**

Run:
```bash
npm run lint
npm test
npm run build
```

Expected:
- `lint` passes
- all tests pass
- `build` passes; existing `netease-api-mode.ts` critical dependency warning may remain if already known

- [ ] **Step 4: Update the debug notes if new behavior differs from prior report**

If needed, append a short section to `DEBUG_REPORT.md` summarizing:
- new paragraph contract
- force-speak thresholds
- live-path guard bypass
- remaining known warnings

- [ ] **Step 5: Commit the verification sweep**

```bash
git add src/tests/unit/dj-voice-queue.test.ts src/tests/unit/dj-hosting-scheduler.test.ts src/tests/unit/dj-json-schema.test.ts DEBUG_REPORT.md
git commit -m "test: verify llm-led radio director acceptance behavior"
```

