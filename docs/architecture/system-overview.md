# System Overview (MVP)

## High-level Architecture

- Next.js App Router provides pages + API routes in one repo.
- Provider abstraction isolates third-party music APIs from business domain.
- Engine layer keeps recommendation/arrangement logic deterministic and testable.
- Prisma persists users, tracks, profiles, and generated programs.

## Request Flow

1. User enters prompt in `/workspace`
2. `POST /api/radio/generate`
3. Load user profile + candidate tracks
4. Rule engine performs scoring/diversity/section arrangement
5. LLM optional refinement for theme and host copy
6. Persist `RadioProgram` + `RadioProgramTrack`
7. Return full program payload to UI

## Resilience

- Music provider fallback: netease -> mock
- AI fallback: OpenAI -> deterministic local copy
- Third-party failure does not block core demo loop

## Expansion paths

- Add new providers under `src/lib/providers/music`
- Add new host style templates under `src/lib/prompts/host-style-templates.ts`
- Replace local cache with Redis without touching engine logic
