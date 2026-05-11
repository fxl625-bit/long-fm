# DJ Template Chain Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all template-generated DJ host copy derived from music-analysis fields and ensure spoken output comes only from the live Director `speech`.

**Architecture:** The live Director remains the only source of spoken copy. Program planning is reduced to queue structure only, while legacy spoken fields, hint-to-copy builders, and local fallback host-copy generation are removed or bypassed. Runtime keeps debug visibility, but when Director is offline or returns no speech, it records the failure instead of synthesizing template lines.

**Tech Stack:** Next.js, TypeScript, Vitest

---

### Task 1: Lock in regression tests for the new speech contract

**Files:**
- Modify: `src/tests/unit/dj-director.test.ts`
- Modify: `src/tests/unit/radio-session-engine.test.ts`

- [ ] Add a failing test that proves banned template phrases do not survive the Director speech path.
- [ ] Add a failing test that proves `ProgramPlan.hostingMoments` is ignored by the DJ speak pipeline.
- [ ] Add a failing test that proves TTS input equals Director `speech` with no template append/rewrite.

### Task 2: Remove template speech builders from the active Director path

**Files:**
- Modify: `src/lib/dj/dj-style-guide.ts`
- Modify: `src/lib/dj/dj-director.ts`
- Modify: `src/lib/radio/radio-session-engine.ts`

- [ ] Remove hint-based spoken line generation from `dj-style-guide.ts`.
- [ ] Stop `DJDirector` from using local fallback host-copy as speech output.
- [ ] Ensure runtime does not inject `safe-fallback-lines` or other local host-copy into normal DJ speech attempts.

### Task 3: Prune spoken fields from ProgramPlan and old planner prompts

**Files:**
- Modify: `src/lib/dj/dj-types.ts`
- Modify: `src/lib/dj/program-planner.ts`
- Modify: `src/lib/dj/llm-program-planner.ts`
- Modify: `src/lib/dj/dj-prompt-builder.ts`
- Modify: `src/lib/llm/dj-json-schema.ts`
- Modify: `src/lib/dj/dj-hosting-scheduler.ts`
- Modify: `src/lib/radio/timeline-engine.ts`
- Modify: `src/lib/radio/radio-runtime.ts`

- [ ] Reduce active `DJProgramPlan` usage to structural playlist planning fields only.
- [ ] Stop generating or consuming `openingLines`, `hostingMoments`, and `djMoments` for runtime speech.
- [ ] Remove `soundHints` and `knownContext` from Director-facing prompt payloads and planner payloads that can leak into spoken copy.

### Task 4: Verify template phrases are gone from the host pipeline

**Files:**
- Modify only as needed based on search results in `src/lib/dj/`, `src/lib/radio/`, `src/lib/engines/`, `src/lib/prompts/`

- [ ] Search for `下一首接`, `中文旋律线`, `咬字更近`, `带出来`, `soundHints`, and `knownContext`.
- [ ] Remove or isolate any remaining host-pipeline usage that can surface in visible speech or subtitles.
- [ ] Keep non-hosting historical/test fixtures only where they do not affect runtime, or update them to the new contract.

### Task 5: Full verification and evidence capture

**Files:**
- No planned code changes; verification only

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Capture search evidence for `下一首接` and host-pipeline `中文旋律线`.
- [ ] Capture the latest DJ speak attempt fields showing `speech === ttsInput`.
