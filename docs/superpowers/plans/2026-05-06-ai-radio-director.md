# AI Radio Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed hosting scheduler with a DeepSeek-led radio director that decides when to speak and how to steer music, while keeping only a minimal mechanical fallback when the director is offline.

**Architecture:** A new director loop in `radio-session-engine` becomes the sole scheduling authority. `dj-director` and `llm-dj-director` emit a stricter decision schema, `radio-runtime` stops prebuilding host copy, and the old hosting/timeline modules are removed from the runtime control path.

**Tech Stack:** Next.js 16, TypeScript, Vitest, existing NetEase queue + TTS stack, DeepSeek integration.

---

## File Map

- Modify: `src/lib/dj/dj-types.ts`
  - Add the new AI Radio Director context, decision, attempt, and debug shapes.
- Modify: `src/lib/dj/dj-director.ts`
  - Convert the public API from host-trigger orchestration to LLM-first director decisions without host-copy fallback.
- Modify: `src/lib/dj/llm-dj-director.ts`
  - Replace the current prompt/output contract with director-mode JSON generation.
- Modify: `src/lib/radio/radio-session-engine.ts`
  - Add the heartbeat loop, event-triggered decision flow, offline handling, and music action execution ownership.
- Modify: `src/lib/radio/radio-runtime.ts`
  - Remove prepared opening generation from the startup path and expose director online/offline state.
- Modify: `src/lib/radio/radio-types.ts`
  - Add runtime-facing state for director debug and online/offline status.
- Modify: `src/components/radio/radio-session-client.tsx`
  - Surface director offline/debug state without redesigning the layout.
- Modify: `src/tests/unit/radio-session-engine.test.ts`
  - Add tests for heartbeat, offline fallback, and action execution.
- Modify: `src/tests/unit/dj-director.test.ts` or create it if absent
  - Add tests for the decision schema and no-hosting-fallback behavior.
- Modify: `src/tests/unit/radio-runtime.test.ts`
  - Add tests proving startup no longer depends on a prepared opening monologue.

## Task 1: Lock the new decision and debug contracts

**Files:**
- Modify: `src/lib/dj/dj-types.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Write the failing tests for the new director decision shape**

Add tests that assert:
- a decision can have `shouldSpeak=false` with empty `speak`
- a decision can have `shouldSpeak=true` only with 50–200 characters
- `musicAction.type` is one of `none|skip|reorder|inject`
- there is no host fallback field

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/tests/unit/dj-director.test.ts`
Expected: FAIL because the new types/normalizers do not exist yet.

- [ ] **Step 3: Implement the minimal type changes**

Add:
- `AIRadioDecision`
- `AIRadioDirectorContext`
- `AIRadioDirectorAttempt`
- `AIRadioDirectorDebug`

Also add runtime state fields for:
- `directorOnline`
- `directorLastError`
- `directorDebug`

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/tests/unit/dj-director.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dj/dj-types.ts src/lib/radio/radio-types.ts src/tests/unit/dj-director.test.ts
git commit -m "refactor: add ai radio director contracts"
```

## Task 2: Convert `llm-dj-director` to director-mode JSON output

**Files:**
- Modify: `src/lib/dj/llm-dj-director.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Write failing tests for LLM response normalization**

Cover:
- valid JSON becomes a normalized `AIRadioDecision`
- invalid JSON returns an offline/error result
- empty `speak` with `shouldSpeak=true` is rejected
- no local host-copy fallback is produced

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- src/tests/unit/dj-director.test.ts`
Expected: FAIL on missing normalization and fallback removal.

- [ ] **Step 3: Implement the new prompt and normalizer**

Change the prompt contract to:
- position DeepSeek as radio director
- request only JSON
- include current track, last 3, next 5, timeOfDay, userPreference, currentEnergy, lastSpeakAt, sessionDuration
- forbid template host speech and forbid frequent interruptions

Normalize to:
- `shouldSpeak`
- `speak`
- `musicAction`
- `energy`

If the LLM fails:
- mark the result as offline/error
- do not fabricate speech

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `npm test -- src/tests/unit/dj-director.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dj/llm-dj-director.ts src/lib/dj/dj-director.ts src/tests/unit/dj-director.test.ts
git commit -m "refactor: switch llm dj director to director-mode json"
```

## Task 3: Replace the fixed hosting scheduler with a director loop

**Files:**
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write failing tests for the new control loop**

Add tests that prove:
- channel start schedules one director decision instead of fixed opening logic
- a 10–20 second heartbeat can trigger a decision
- three tracks can pass with no speech if decisions say `shouldSpeak=false`
- fixed `playedCount % 2 === 0` bridge behavior is gone

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: FAIL because the old hosting scheduler still controls pacing.

- [ ] **Step 3: Implement the director heartbeat and event triggers**

In `radio-session-engine.ts`:
- add a heartbeat timer/randomized next-decision window
- trigger decisions on channel start, track start, near-end, ended, user tune, resume
- remove runtime dependence on `DJHostingScheduler.onTimeTick/onTrackEnd` for content pacing
- only let the director decide if/when to speak

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/radio-session-engine.ts src/lib/dj/dj-director.ts src/tests/unit/radio-session-engine.test.ts
git commit -m "refactor: replace hosting scheduler with director loop"
```

## Task 4: Remove host-copy fallback and keep only music fallback

**Files:**
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/dj/dj-voice-queue.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write failing tests for no-hosting-fallback behavior**

Cover:
- LLM timeout => no speech generated
- guard blocks speech => speech skipped, music action still executes
- invalid JSON => director offline, next track still plays mechanically

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: FAIL because old fallback/rewrite pathways still feed speech.

- [ ] **Step 3: Implement the runtime changes**

Remove formal use of:
- `safe-fallback-lines.ts`
- opening text fallback from the director path
- rewrite-driven host recovery in the official control loop

Keep:
- final guard
- TTS subtitle fallback
- queue execution fallback only

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/radio-session-engine.ts src/lib/dj/dj-voice-queue.ts src/tests/unit/radio-session-engine.test.ts
git commit -m "refactor: remove hosting fallback from director path"
```

## Task 5: Remove prepared opening generation from runtime startup

**Files:**
- Modify: `src/lib/radio/radio-runtime.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Write failing tests for startup without prepared opening**

Assert:
- `prepareSession()` no longer calls `generateOpening`
- `startSessionFromUserGesture()` does not depend on `preparedOpeningMonologue`
- the first spoken segment only comes from director decisions

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`
Expected: FAIL because runtime still prepares opening speech.

- [ ] **Step 3: Implement the startup cleanup**

Remove:
- `generateOpening`
- `prepareOpeningMonologue`
- `preparedOpeningValue` as a required control path input

Keep only:
- queue preparation
- channel start
- director loop kick-off

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/radio-runtime.ts src/tests/unit/radio-runtime.test.ts
git commit -m "refactor: remove runtime opening monologue preparation"
```

## Task 6: Add director offline state and debug evidence

**Files:**
- Modify: `src/lib/radio/radio-runtime.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Modify: `src/components/radio/radio-session-client.tsx`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Write failing tests for offline visibility**

Assert:
- invalid or timed-out director decisions mark `directorOnline=false`
- debug snapshot exposes the last raw response, parse status, and last error
- UI-facing snapshot exposes “director offline / pure music fallback” state

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`
Expected: FAIL because the offline/debug state is not present yet.

- [ ] **Step 3: Implement the state and debug plumbing**

Expose:
- `directorOnline`
- `directorLastError`
- `directorDebug`
- recent attempts
- last executed music action

Keep the visible UI change minimal and development-focused where appropriate.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/radio-runtime.ts src/lib/radio/radio-types.ts src/components/radio/radio-session-client.tsx src/tests/unit/radio-runtime.test.ts
git commit -m "feat: expose director offline state and debug evidence"
```

## Task 7: Reconcile queue actions with the director schema

**Files:**
- Modify: `src/lib/radio/radio-session-engine.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write failing tests for `skip`, `reorder`, and `inject`**

Assert:
- `skip` can immediately advance playback
- `reorder` mutates the upcoming block only
- `inject` inserts new tracks after current
- invalid `trackIds` are ignored and recorded as execution errors

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: FAIL because the old queuePatch contract does not match the new schema.

- [ ] **Step 3: Implement the music action adapter**

Map:
- `musicAction.type="none"` -> no queue change
- `skip` -> immediate next-track execution
- `reorder` -> reorder upcoming
- `inject` -> insert after current

Record execution results in director debug state.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/tests/unit/radio-session-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio/radio-session-engine.ts src/lib/dj/dj-director.ts src/tests/unit/radio-session-engine.test.ts
git commit -m "feat: execute director music actions"
```

## Task 8: Final integration and regression sweep

**Files:**
- Modify as needed from previous tasks
- Test: `src/tests/unit/radio-session-engine.test.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`
- Test: `src/tests/unit/dj-director.test.ts`

- [ ] **Step 1: Run the focused regression suite**

Run:
- `npm test -- src/tests/unit/dj-director.test.ts`
- `npm test -- src/tests/unit/radio-session-engine.test.ts`
- `npm test -- src/tests/unit/radio-runtime.test.ts`

Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src docs
git commit -m "refactor: ship ai radio director runtime"
```
