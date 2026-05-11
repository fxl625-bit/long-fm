# DJ Voice Naturalness And Ducking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DJ speech clearly audible over music and upgrade the default voice path so Auralia sounds more natural and less mechanical.

**Architecture:** Split the work into two coordinated layers. First, strengthen the playback mix by adding adaptive ducking and speech-priority playback behavior in the radio audio path. Second, improve voice quality by reordering TTS provider preference, adding better default presets, and introducing a runtime ¡°naturalness¡± selection path that prefers higher-quality providers when available without breaking subtitle fallback. The debug surface should expose enough evidence to verify which voice path and ducking profile were used.

**Tech Stack:** Next.js, TypeScript, Vitest, browser Audio API, existing TTS provider stack (Edge/Kokoro/Piper/OpenAI)

---

### Task 1: Fix DJ-over-music audibility in the audio engine

**Files:**
- Modify: `src/lib/radio/audio-engine.ts`
- Modify: `src/lib/radio/dj-engine.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Test: `src/tests/unit/dj-engine.test.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] Add failing tests proving DJ speech playback ducks music to a lower target than today and restores it cleanly after speech.
- [ ] Add a failing test proving repeated speech groups do not stack-restores incorrectly.
- [ ] Replace the fixed `0.35` duck target with a stronger, explicit speech mix profile (`before`, `target`, `restored`) recorded in radio state.
- [ ] Add a short fade-down/fade-up path in `AudioEngine` so speech does not fight a full-volume track on the first syllable.
- [ ] Verify targeted tests pass.

### Task 2: Introduce a natural-voice selection strategy

**Files:**
- Modify: `src/lib/tts/tts-manager.ts`
- Modify: `src/lib/tts/tts-settings.ts`
- Modify: `src/lib/tts/openai-tts-provider.ts`
- Modify: `src/lib/tts/edge-tts-provider.ts`
- Modify: `src/lib/tts/kokoro-tts-provider.ts`
- Modify: `src/lib/tts/piper-tts-provider.ts`
- Test: `src/tests/unit/tts-manager.test.ts`
- Test: `src/tests/unit/dj-engine.test.ts`

- [ ] Add failing tests for a ¡°natural voice first¡± provider order that prefers the most human-sounding available provider.
- [ ] Define a better default DJ voice preset for Chinese speech that avoids the current overly mechanical presentation.
- [ ] Add provider metadata or ranking logic so the runtime can prefer a more natural provider/voice when multiple providers are available.
- [ ] Preserve subtitle-only fallback and existing explicit user provider overrides.
- [ ] Verify targeted tests pass.

### Task 3: Wire naturalness and mix evidence into runtime debug

**Files:**
- Modify: `src/lib/radio/radio-runtime.ts`
- Modify: `src/lib/radio/radio-types.ts`
- Modify: `src/lib/radio/dj-engine.ts`
- Test: `src/tests/unit/radio-runtime.test.ts`

- [ ] Add failing tests proving debug state shows the active TTS provider, active voice, and the ducking profile used for the latest spoken segment.
- [ ] Record latest speech mix telemetry (music volume before duck, duck target, restored volume, TTS provider/voice actually used).
- [ ] Make sure debug state distinguishes prepared opening speech from spoken/played speech, so future voice tuning remains observable.
- [ ] Verify targeted tests pass.

### Task 4: Validate better default behavior end to end

**Files:**
- Modify as needed based on test outcomes in the files above only
- Test: `src/tests/unit/radio-runtime.test.ts`
- Test: `src/tests/unit/radio-session-engine.test.ts`

- [ ] Add an integration-style regression test where a prepared opening is spoken and music is audibly ducked before TTS begins.
- [ ] Add a regression test showing the runtime prefers the better natural provider when it is available, but falls back safely when it is not.
- [ ] Confirm no existing opening/Director tests regress.

### Task 5: Full verification and evidence capture

**Files:**
- No planned code changes; verification only

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Capture the final ducking constants/profile from the code.
- [ ] Capture the final default TTS provider/voice path from tests or debug evidence.
