# Broadcast Persona Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Auralia FM’s product-logic DJ behavior with a DeepSeek-led broadcast persona that speaks from worldview and scene, not from hard-coded music analysis rules.

**Architecture:** Keep the existing radio playback/runtime spine, but shrink the LLM input to only the minimal live context a radio host would plausibly know: time, current track, previous/next track, recent flow, and a compact listener memory summary. Move the “what is radio” intelligence into a stronger system persona prompt and a cleaner corpus. Reduce runtime rule pressure so the model decides from persona and silence constraints, while preserving only a thin mechanical floor to prevent dead air when the live decision path fails.

**Tech Stack:** Next.js 16, TypeScript, Vitest, existing radio runtime/store/audio engine, DeepSeek JSON completion path, browser-to-server director route.

---

### Task 1: Rebuild the Broadcast Persona Prompt and Corpus

**Files:**
- Create: `src/lib/dj/broadcast-persona-prompt.ts`
- Modify: `src/lib/dj/llm-dj-director.ts`
- Modify: `src/lib/dj/corpus/radio-host-corpus.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Write the failing persona prompt tests**

Add assertions in `src/tests/unit/dj-director.test.ts` that prove:
1. the system prompt describes Auralia as a long-running radio host persona,
2. the prompt forbids analytic phrases like “节奏推进”“旋律线”“人声靠前”,
3. the prompt emphasizes companionship, time, air, city, and scene over music taxonomy,
4. the prompt no longer requires product-facing structures like `soundHints`, `energyHint`, or `segmentIntent`.

- [ ] **Step 2: Run the targeted director tests to confirm failure**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: FAIL because the current prompt still leaks product logic and sound-analysis framing.

- [ ] **Step 3: Create a dedicated persona prompt module**

Create `src/lib/dj/broadcast-persona-prompt.ts` with:

```ts
export function buildBroadcastPersonaSystemPrompt(): string;
export function buildBroadcastPersonaRules(input: {
  forceSpeak: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
}): string[];
```

This module must encode:
- Auralia as an existing radio persona, not an assistant,
- companionship over explanation,
- concrete life/world imagery over musical feature analysis,
- silence as a valid choice,
- no “recommendation engine” language,
- no announcer/corporate/call-to-action tone.

- [ ] **Step 4: Refresh the host corpus toward real broadcast texture**

Update `src/lib/dj/corpus/radio-host-corpus.ts` so examples bias toward:
- interrupted thought,
- short observations,
- late-night / afternoon / city / weather / room-tone imagery,
- non-analytic translation of music into lived feeling.

Keep examples compact and reusable by prompt excerpting.

- [ ] **Step 5: Wire `llm-dj-director.ts` to the new persona prompt**

Replace the current inline system prompt builder with `buildBroadcastPersonaSystemPrompt()` and its rules. Preserve the current JSON contract:

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

But remove prompt pressure that asks the model to behave like a music-analysis engine.

- [ ] **Step 6: Re-run the targeted tests**

Run: `npx vitest run src/tests/unit/dj-director.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the persona prompt refactor**

```bash
git add src/lib/dj/broadcast-persona-prompt.ts src/lib/dj/llm-dj-director.ts src/lib/dj/corpus/radio-host-corpus.ts src/tests/unit/dj-director.test.ts
git commit -m "feat: move auralia into broadcast persona prompt mode"
```

### Task 2: Shrink Director Input to Radio-Native Context

**Files:**
- Modify: `src/lib/dj/dj-prompt-builder.ts`
- Modify: `src/lib/dj/music-context-builder.ts`
- Modify: `src/lib/dj/dj-context-builder.ts`
- Modify: `src/lib/dj/dj-types.ts`
- Test: `src/tests/unit/dj-brain.test.ts`

- [ ] **Step 1: Write the failing prompt-shape tests**

Add or update tests in `src/tests/unit/dj-brain.test.ts` to prove:
1. director/user prompts no longer embed `soundHints`, `energyHint`, `styleHint`, or `moodHint` as first-class instructions,
2. prompt context still includes current time, current track, previous track, next track, and recent flow,
3. listener memory is summarized instead of expanded into many control fields,
4. the prompt can still request legal queue actions using playable provider track ids.

- [ ] **Step 2: Run the targeted prompt-shape tests to confirm failure**

Run: `npx vitest run src/tests/unit/dj-brain.test.ts`

Expected: FAIL because the current prompt builder still serializes product-centric metadata.

- [ ] **Step 3: Replace product metadata with radio-native scene context**

Update `src/lib/dj/music-context-builder.ts` so it builds a compact structure closer to:

```ts
type BroadcastSceneContext = {
  roomTone: string;
  timeTexture: string;
  currentFeeling: string;
  recentDrift: string;
  nextOpening?: string;
};
```

The builder may infer lightly from existing tags, but must output radio-language summaries rather than raw analytic fields.

- [ ] **Step 4: Simplify director prompt serialization**

Update `src/lib/dj/dj-prompt-builder.ts` to keep only:
- current time / timeOfDay,
- current / previous / next track identity,
- last 3 recent tracks,
- up to 5 upcoming tracks,
- compact listener memory summary,
- scene context from Task 2 Step 3,
- immediate user intent when present.

Retain provider track ids only where needed for `musicAction.trackIds`.

- [ ] **Step 5: Trim type surfaces that encourage over-control**

Adjust `src/lib/dj/dj-types.ts` and `src/lib/dj/dj-context-builder.ts` so runtime and prompt code pass compact radio context rather than a large feature matrix. Do not remove fields still needed elsewhere; add smaller prompt-only helpers if necessary.

- [ ] **Step 6: Re-run the prompt-shape tests**

Run: `npx vitest run src/tests/unit/dj-brain.test.ts`

Expected: PASS

- [ ] **Step 7: Commit the radio-native context slimming**

```bash
git add src/lib/dj/dj-prompt-builder.ts src/lib/dj/music-context-builder.ts src/lib/dj/dj-context-builder.ts src/lib/dj/dj-types.ts src/tests/unit/dj-brain.test.ts
git commit -m "refactor: slim director context into radio-native scene data"
```

### Task 3: Reduce Runtime Rule Pressure and Let Persona Lead

**Files:**
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Modify: `src/lib/dj/radio-soul-state.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write the failing runtime-behavior tests**

Update `src/tests/unit/radio-session-engine.test.ts` so it proves:
1. opening is still attempted immediately,
2. follow-up speaking is triggered by silence thresholds rather than per-track commentary expectations,
3. runtime does not force descriptive “useful” copy on every trigger,
4. if live director is unavailable, the system uses only a thin opening-safe floor instead of a verbose template loop.

- [ ] **Step 2: Run the targeted runtime tests to confirm failure**

Run: `npx vitest run src/tests/unit/radio-session-engine.test.ts`

Expected: FAIL because current runtime still carries legacy pacing assumptions and local descriptive fallback behavior.

- [ ] **Step 3: Keep only minimal mechanical constraints**

Update `src/lib/radio/radio-session-engine.ts` and `src/lib/dj/dj-director.ts` so runtime keeps:
- opening attempt on entry,
- force-speak after 2 silent tracks or 6 silent minutes,
- one controlled retry when `shouldSpeak=true` but `speech` is empty,
- a minimal opening-safe local floor if the live path hard fails.

Remove pressure to generate local explanatory lines on every trigger.

- [ ] **Step 4: Make the soul state reflect silence and drift, not rigid pattern stages**

Adjust `src/lib/dj/radio-soul-state.ts` so its output supports:
- intimacy,
- drift,
- motion,
- quiet accumulation,
- last-fragment memory.

Keep it lightweight and suitable for prompt input rather than direct rule branching.

- [ ] **Step 5: Re-run the runtime-behavior tests**

Run: `npx vitest run src/tests/unit/radio-session-engine.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the runtime de-mechanization**

```bash
git add src/lib/radio/radio-session-engine.ts src/lib/dj/dj-director.ts src/lib/dj/radio-soul-state.ts src/tests/unit/radio-session-engine.test.ts
git commit -m "refactor: reduce runtime rule pressure on broadcast persona"
```

### Task 4: Expose Persona-Led Debug Evidence Without Expanding Public UI

**Files:**
- Modify: `src/components/radio/radio-session-client.tsx`
- Modify: `DEBUG_REPORT.md`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Write the failing debug evidence test**

Add/update `src/tests/unit/radio-runtime.test.ts` to prove development debug exposes:
1. whether the opening decision came from live DeepSeek or thin fallback,
2. the latest `speech` paragraph,
3. the compact scene context snapshot,
4. silence counters and `forcedSpeakTriggered`.

- [ ] **Step 2: Run the targeted debug test to confirm failure**

Run: `npx vitest run src/tests/unit/radio-runtime.test.ts`

Expected: FAIL because the debug panel currently emphasizes legacy fields and does not surface the new persona context cleanly.

- [ ] **Step 3: Refresh development-only debug output**

In `src/components/radio/radio-session-client.tsx`, keep the public layout unchanged. Inside development-only debug, surface:
- `decisionProvider`
- `decisionFallbackReason`
- `latestSpeech`
- `sceneContext`
- `radioSoulState`
- `tracksSinceLastSpeak`
- `minutesSinceLastSpeak`
- `forcedSpeakTriggered`

- [ ] **Step 4: Update engineering notes**

Append to `DEBUG_REPORT.md`:
- why product metadata was trimmed,
- how the browser->server DeepSeek route now works,
- what evidence to inspect when the host feels mechanical again.

- [ ] **Step 5: Re-run the debug test**

Run: `npx vitest run src/tests/unit/radio-runtime.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the debug refresh**

```bash
git add src/components/radio/radio-session-client.tsx DEBUG_REPORT.md src/tests/unit/radio-runtime.test.ts
git commit -m "feat: expose broadcast persona debug evidence"
```

### Task 5: Full Verification and Live Radio Check

**Files:**
- Optional notes: `QA_CHECKLIST.md`

- [ ] **Step 1: Run the focused acceptance suite**

Run:

```bash
npx vitest run src/tests/unit/dj-director.test.ts src/tests/unit/dj-director-browser-route.test.ts src/tests/unit/dj-brain.test.ts src/tests/unit/radio-session-engine.test.ts src/tests/unit/radio-runtime.test.ts
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
- `lint` passes,
- tests pass,
- `build` passes,
- the existing Netease dynamic import warning may remain if already known.

- [ ] **Step 3: Start the dev server and inspect the live page**

Run:

```bash
npm run dev
```

Open [http://localhost:3000/radio](http://localhost:3000/radio) and confirm in development debug:
- `directorOffline` is false during live DeepSeek use,
- opening `finalLines` is non-empty,
- `latestSpeech` sounds like persona rather than product copy,
- the host can stay quiet later without feeling broken.

- [ ] **Step 4: Update the QA checklist**

Add a short note in `QA_CHECKLIST.md` covering:
- opening speech appears immediately,
- DeepSeek route is active,
- live speech reads as broadcast persona,
- fallback is thin and only used on failure.

- [ ] **Step 5: Commit the final verification sweep**

```bash
git add QA_CHECKLIST.md
git commit -m "test: verify broadcast persona takeover"
```
