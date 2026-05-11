# AI Radio Soul Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Auralia FM from a player-with-TTS-inserts into an AI-led radio persona system with emotion, memory, silence, and paragraph hosting that feels alive instead of procedural.

**Architecture:** Replace the current event-to-copy DJ path with a soul-layer architecture: Mood Engine defines the station state, Memory Engine accumulates short-term radio memory, Silence Decision controls whether speaking is warranted, Director LLM renders a continuous paragraph when it truly should speak, and runtime pacing treats speech as a rare meaningful segment rather than a per-track duty. Keep the existing playback stack and debug surface, but move legacy guard/pattern/fallback behavior out of the live path so the AI persona can lead. Add development evidence that proves the new state machine is producing emotion shifts, deliberate silence, and non-mechanical opening behavior.

**Tech Stack:** Next.js 16, TypeScript, Vitest, existing radio runtime/store/audio engine, DeepSeek JSON completion path.

---

### Task 1: Build the Radio Soul State Model

**Files:**
- Create: `src/lib/dj/radio-soul-state.ts`
- Modify: `src/lib/dj/dj-types.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/radio-soul-state.test.ts`

- [ ] **Step 1: Write the failing soul-state tests**

Add tests in `src/tests/unit/radio-soul-state.test.ts` that prove:
1. the soul state starts with low certainty but valid defaults,
2. consecutive low-energy tracks make the station quieter and more inward,
3. a sharp energy jump changes mood state instead of preserving the same profile,
4. silence bookkeeping tracks `lastSpeakAt`, `tracksSinceLastSpeak`, and `minutesSinceLastSpeak`.

- [ ] **Step 2: Run the targeted tests to confirm failure**

Run: `npx vitest run src/tests/unit/radio-soul-state.test.ts`

Expected: FAIL because the soul state module does not exist yet.

- [ ] **Step 3: Define the soul-state types and reducer**

Create `src/lib/dj/radio-soul-state.ts` with:

```ts
export type RadioSoulState = {
  moodAxis: "hushed" | "warm" | "adrift" | "tense" | "bright";
  intimacy: number;
  motion: number;
  strangeness: number;
  confidence: number;
  tracksSinceLastSpeak: number;
  minutesSinceLastSpeak: number;
  lastSpeakAt: number | null;
  currentImagery: string[];
  recentFragments: string[];
};

export function createInitialSoulState(): RadioSoulState { /* ... */ }
export function evolveSoulState(...): RadioSoulState { /* ... */ }
export function noteSoulSpeech(...): RadioSoulState { /* ... */ }
```

Keep it deterministic and derived only from track facts + runtime counters.

- [ ] **Step 4: Extend shared DJ/runtime types**

Update `src/lib/dj/dj-types.ts` and `src/lib/radio/radio-types.ts` so runtime state can carry:
- `radioSoulState`
- `lastSpeakAt`
- `tracksSinceLastSpeak`
- `minutesSinceLastSpeak`
- `forcedSpeakTriggered`
- `lastSoulShiftReason`

- [ ] **Step 5: Re-run the soul-state tests**

Run: `npx vitest run src/tests/unit/radio-soul-state.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the soul-state foundation**

```bash
git add src/lib/dj/radio-soul-state.ts src/lib/dj/dj-types.ts src/lib/radio/radio-types.ts src/tests/unit/radio-soul-state.test.ts
git commit -m "feat: add radio soul state foundation"
```

### Task 2: Replace Mechanical DJ Copy with a Radio Soul Prompt Pipeline

**Files:**
- Create: `src/lib/dj/radio-soul-corpus.ts`
- Modify: `src/lib/dj/llm-dj-director.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Write the failing director prompt tests**

Update `src/tests/unit/dj-director.test.ts` so it asserts:
1. the prompt includes soul-state context instead of only track utility fields,
2. the response contract uses `speech`, `durationHintSec`, and `insertAfterTracks`,
3. `forceSpeak: true` requires a continuous paragraph,
4. the prompt explicitly discourages analytic phrases like “鼓点推进” and “人声靠前”.

- [ ] **Step 2: Run the targeted director tests to confirm failure**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: FAIL because the prompt still behaves like a bounded DJ copy generator.

- [ ] **Step 3: Add a soul-oriented corpus helper**

Create `src/lib/dj/radio-soul-corpus.ts` that exports a short curated excerpt builder from existing corpus assets, tuned toward:
- fragmented radio speech,
- self-interruption,
- sparse emotional observation,
- non-analytic imagery.

Use the existing corpus directory rather than creating duplicate raw files.

- [ ] **Step 4: Rewrite `llm-dj-director.ts` into radio-persona mode**

Change the prompt so the model is instructed as:
- a real radio presence,
- allowed to stay silent,
- forbidden from describing recommendation logic,
- forbidden from using mechanical music-analysis jargon,
- encouraged to produce a continuous paragraph or deliberate silence.

The JSON contract stays:

```ts
{
  shouldSpeak: boolean;
  speech: string;
  durationHintSec: number;
  insertAfterTracks: number;
  musicAction: { type: "none" | "skip" | "reorder" | "inject"; reason?: string; trackIds?: string[] };
  energy: "low" | "mid" | "high";
}
```

But the user prompt must now include:
- soul state,
- imagery,
- recent fragments,
- silence counters,
- current track + recent/upcoming tracks,
- explicit “don’t narrate your algorithm” rules.

- [ ] **Step 5: Keep live decisions out of local quality suppression**

Update `src/lib/dj/dj-director.ts` so live DeepSeek output is preserved as a paragraph and tagged in `scriptDebug` with:
- `speech`
- `durationHintSec`
- `insertAfterTracks`
- `bypassedGuard: true`
- `soulStateSnapshot`

Do not run live DeepSeek paragraphs through `validateDJLines()`.

- [ ] **Step 6: Re-run the director tests**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the radio-soul prompt pipeline**

```bash
git add src/lib/dj/radio-soul-corpus.ts src/lib/dj/llm-dj-director.ts src/lib/dj/dj-director.ts src/tests/unit/dj-director.test.ts
git commit -m "feat: move dj director into radio soul prompt mode"
```

### Task 3: Rework Runtime Pacing Around Silence, Memory, and Soul Shifts

**Files:**
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/radio/radio-runtime.ts`
- Modify: `src/hooks/use-radio-runtime.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

Update `src/tests/unit/radio-session-engine.test.ts` and `src/tests/unit/radio-runtime.test.ts` to prove:
1. opening is attempted immediately after channel entry,
2. the system does not ask for speech every 15 seconds,
3. a new paragraph request happens after 2 silent tracks or 6 silent minutes,
4. a spoken paragraph resets silence counters,
5. runtime debug exposes the current soul state and last soul shift reason.

- [ ] **Step 2: Run the targeted runtime tests to confirm failure**

Run:
```bash
npx vitest run src/tests/unit/radio-session-engine.test.ts src/tests/unit/radio-runtime.test.ts
```

Expected: FAIL because runtime still mixes old pacing assumptions and does not surface the soul model.

- [ ] **Step 3: Integrate soul-state evolution into `radio-session-engine.ts`**

Wire soul state updates at:
- channel start,
- track start,
- track end,
- successful speech,
- user tune events.

Track and persist:
- `radioSoulState`
- `lastSoulShiftReason`
- `lastSpeakAt`
- `tracksSinceLastSpeak`
- `minutesSinceLastSpeak`
- `forcedSpeakTriggered`

- [ ] **Step 4: Simplify pacing to meaningful re-entry only**

Keep these runtime rules:
- opening once on entry,
- no fixed 15-second heartbeat,
- ask again after 2 silent tracks,
- ask again after 6 silent minutes,
- allow style-shift / user-tune overrides when needed,
- no per-track compulsory commentary.

- [ ] **Step 5: Expose runtime soul debug**

Update `src/lib/radio/radio-runtime.ts` and `src/hooks/use-radio-runtime.ts` so development debug can read:
- `radioSoulState`
- `lastSoulShiftReason`
- `lastSpeakAt`
- `tracksSinceLastSpeak`
- `minutesSinceLastSpeak`
- `forcedSpeakTriggered`

- [ ] **Step 6: Re-run the runtime tests**

Run:
```bash
npx vitest run src/tests/unit/radio-session-engine.test.ts src/tests/unit/radio-runtime.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the runtime pacing refactor**

```bash
git add src/lib/radio/radio-session-engine.ts src/lib/radio/radio-runtime.ts src/hooks/use-radio-runtime.ts src/tests/unit/radio-session-engine.test.ts src/tests/unit/radio-runtime.test.ts
git commit -m "feat: drive runtime pacing from silence and radio soul state"
```

### Task 4: Refresh Dev Debug and Manual-Test Hooks for the New Persona System

**Files:**
- Modify: `src/components/radio/radio-session-client.tsx`
- Modify: `src/lib/dj/dj-voice-queue.ts`
- Modify: `src/lib/radio/dj-engine.ts`
- Test: `src/tests/unit/dj-engine.test.ts`
- Test: `src/tests/unit/dj-voice-queue.test.ts`

- [ ] **Step 1: Write the failing debug-path tests**

Add/update tests proving:
1. live paragraphs still bypass guard in the queue and engine,
2. TTS failure still shows subtitles,
3. manual dev-test buttons create `djSpeakAttempts`,
4. the latest attempt exposes `speech`, `finalLines`, `ttsCalled`, and `subtitleShown`.

- [ ] **Step 2: Run the targeted tests to confirm failure**

Run:
```bash
npx vitest run src/tests/unit/dj-engine.test.ts src/tests/unit/dj-voice-queue.test.ts
```

Expected: FAIL if the manual-test or debug surfaces still assume old line-based behavior.

- [ ] **Step 3: Keep live speech atomic through queue and TTS**

Ensure the queue and engine continue to treat a live LLM paragraph as one atomic unit for playback/subtitle purposes, while allowing sentence-level subtitle stepping only for display timing.

- [ ] **Step 4: Update development debug UI only**

Inside the existing development-only `Developer Debug` area, add soul-focused evidence:
- `radioSoulState`
- `lastSoulShiftReason`
- `lastSpeakAt`
- `tracksSinceLastSpeak`
- `minutesSinceLastSpeak`
- latest `djSpeakAttempts`
- `decisionRawPrompt`
- `decisionRawResponse`

Do not change the public UI layout.

- [ ] **Step 5: Re-run the debug-path tests**

Run:
```bash
npx vitest run src/tests/unit/dj-engine.test.ts src/tests/unit/dj-voice-queue.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the debug refresh**

```bash
git add src/components/radio/radio-session-client.tsx src/lib/dj/dj-voice-queue.ts src/lib/radio/dj-engine.ts src/tests/unit/dj-engine.test.ts src/tests/unit/dj-voice-queue.test.ts
git commit -m "feat: expose radio soul debug evidence in development"
```

### Task 5: Full Verification and Evidence Capture

**Files:**
- Modify: `DEBUG_REPORT.md`
- Optional notes: `QA_CHECKLIST.md`

- [ ] **Step 1: Run the focused acceptance tests**

Run:
```bash
npx vitest run src/tests/unit/radio-soul-state.test.ts src/tests/unit/dj-director.test.ts src/tests/unit/radio-session-engine.test.ts src/tests/unit/radio-runtime.test.ts src/tests/unit/dj-engine.test.ts src/tests/unit/dj-voice-queue.test.ts
```

Expected: PASS

- [ ] **Step 2: Run full project verification**

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

- [ ] **Step 3: Update debug notes**

Append a short section to `DEBUG_REPORT.md` covering:
- radio soul state introduced,
- silence-first pacing introduced,
- live DeepSeek paragraph path bypasses legacy guard,
- remaining known warnings,
- what evidence to inspect in development when opening still feels mechanical.

- [ ] **Step 4: Commit the verification sweep**

```bash
git add DEBUG_REPORT.md QA_CHECKLIST.md
git commit -m "test: verify ai radio soul refactor behavior"
```
