# DJ Audibility And Natural TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Auralia's speech consistently audible over background music and upgrade the default TTS path so the host sounds more natural and less mechanical.

**Architecture:** Split the work into two isolated tracks on top of the repaired git baseline. The audio-mix track strengthens ducking and speech-priority playback in the radio runtime so speech wins immediately and restores cleanly. The TTS track improves provider ordering, default voice presets, and runtime selection so the most natural available voice is chosen without breaking subtitle fallback or existing debug visibility.

**Tech Stack:** Next.js, TypeScript, Vitest, browser Audio API, existing TTS provider stack (Edge, Kokoro, Piper, OpenAI)

---

### Task 1: Strengthen speech-over-music ducking in the playback layer

**Files:**
- Modify: `src/lib/radio/audio-engine.ts`
- Modify: `src/lib/radio/dj-engine.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/dj-engine.test.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] **Step 1: Write failing tests for stronger speech ducking**

Add or update tests proving DJ speech requests a stronger duck target than `0.35`, stores that target in radio state, and restores the original level after speech ends.

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `npm test -- src/tests/unit/dj-engine.test.ts src/tests/unit/radio-session-engine.test.ts`

Expected: at least one ducking assertion fails against the current `0.35` behavior.

- [ ] **Step 3: Implement minimal stronger-duck behavior**

Replace the fixed duck volume with an explicit speech mix profile that includes:
- a lower `targetVolume`
- the original music volume
- a restore path that does not stack incorrectly across grouped speech

Keep the change confined to the radio audio path.

- [ ] **Step 4: Add fade timing so the first spoken syllable is not masked**

Add a short fade-down before DJ playback starts and a short fade-up after it ends. Do not introduce long pauses or alter unrelated transport behavior.

- [ ] **Step 5: Re-run targeted tests to verify GREEN**

Run: `npm test -- src/tests/unit/dj-engine.test.ts src/tests/unit/radio-session-engine.test.ts`

Expected: the ducking-related tests pass.

### Task 2: Improve the natural-voice TTS selection path

**Files:**
- Modify: `src/lib/tts/tts-manager.ts`
- Modify: `src/lib/tts/tts-settings.ts`
- Modify: `src/lib/tts/edge-tts-provider.ts`
- Modify: `src/lib/tts/openai-tts-provider.ts`
- Modify: `src/lib/tts/kokoro-tts-provider.ts`
- Modify: `src/lib/tts/piper-tts-provider.ts`
- Test: `src/tests/unit/tts-manager.test.ts`
- Test: `src/tests/unit/dj-engine.test.ts`

- [ ] **Step 1: Write failing tests for natural-provider preference**

Add tests proving the runtime prefers the most natural available provider and voice for DJ speech while still honoring an explicit user override and preserving subtitle fallback.

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `npm test -- src/tests/unit/tts-manager.test.ts src/tests/unit/dj-engine.test.ts`

Expected: at least one provider-order or default-preset assertion fails against the current behavior.

- [ ] **Step 3: Implement minimal provider ranking and better defaults**

Introduce a naturalness-first provider order and update the default DJ voice preset so Chinese speech defaults away from the current mechanical presentation when a better provider is available.

- [ ] **Step 4: Preserve existing safety behavior**

Keep subtitle-only fallback intact, keep explicit provider requests respected, and do not break `/api/tts` request payload compatibility.

- [ ] **Step 5: Re-run targeted tests to verify GREEN**

Run: `npm test -- src/tests/unit/tts-manager.test.ts src/tests/unit/dj-engine.test.ts`

Expected: the TTS-selection tests pass.

### Task 3: Surface enough runtime debug evidence to prove the change

**Files:**
- Modify: `src/lib/radio/radio-runtime.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] **Step 1: Add failing tests for speech-mix and voice telemetry**

Add tests proving the runtime debug state exposes the latest ducking profile, the active TTS provider, the active voice, and the latest spoken audio URL.

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`

Expected: the new debug assertions fail before implementation.

- [ ] **Step 3: Implement minimal telemetry wiring**

Record:
- music volume before duck
- duck target during speech
- restored music volume after speech
- effective TTS provider and voice

- [ ] **Step 4: Re-run targeted tests to verify GREEN**

Run: `npm test -- src/tests/unit/radio-runtime.test.ts`

Expected: the telemetry tests pass.

### Task 4: Parallel execution layout

**Files:**
- Worktree A: audio mix and runtime telemetry ownership
- Worktree B: TTS provider ranking and preset ownership

- [ ] **Step 1: Create fresh worktrees from `master` at commit `7e862ac`**

Create:
- `.worktrees/dj-audibility`
- `.worktrees/dj-natural-tts`

- [ ] **Step 2: Assign disjoint ownership**

Worktree A owns:
- `src/lib/radio/audio-engine.ts`
- `src/lib/radio/dj-engine.ts`
- `src/lib/radio/radio-runtime.ts`
- `src/lib/radio/radio-types.ts`
- relevant radio tests

Worktree B owns:
- `src/lib/tts/*`
- `src/tests/unit/tts-manager.test.ts`
- TTS-facing assertions in `src/tests/unit/dj-engine.test.ts`

- [ ] **Step 3: Review and integrate sequentially on the controller branch**

Pull back one worktree result at a time, verify it, then integrate without reverting unrelated edits.

### Task 5: Full verification and cleanup

**Files:**
- No planned code changes; verification and cleanup only

- [ ] **Step 1: Run lint**

Run: `npm run lint`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run production build**

Run: `npm run build`

- [ ] **Step 4: Capture final evidence**

Record:
- final duck target used during speech
- final default natural provider order
- final default DJ voice preset

- [ ] **Step 5: Close accepted agents and remove temporary worktrees**

Once each worktree's output is merged and verified, close the corresponding agent and delete the corresponding verification worktree.
