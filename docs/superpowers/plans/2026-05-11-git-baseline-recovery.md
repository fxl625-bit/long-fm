# Git Baseline Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current working Auralia FM codebase into a real git baseline so new branches and worktrees inherit the full application instead of the original scaffold.

**Architecture:** Treat this as a repository recovery task, not a feature task. First, confirm the real repository root and audit tracked versus ignored assets. Second, preserve only durable product files in git while keeping runtime residue out. Third, create a baseline commit from the already-built application state and verify that a fresh worktree created from that commit contains the complete source tree.

**Tech Stack:** Git, PowerShell, Next.js, TypeScript, Prisma, Vitest

---

### Task 1: Confirm the real repository and failure mode

**Files:**
- Inspect: `.gitignore`
- Inspect: `src/`
- Inspect: `docs/`
- Inspect: `prisma/`
- Inspect: `public/audio/`

- [ ] Verify the active working repository is `<project-root>` and note that `<legacy-project-copy>` is an empty shell directory, not the real repo.
- [ ] Capture `git log --oneline --decorate --graph --all -n 20` and confirm every existing worktree branch still points at `dfad057 Initial commit from Create Next App`.
- [ ] Capture `git worktree list --porcelain` and confirm all worktrees inherit the wrong baseline.
- [ ] Capture `git status --short --ignored` and verify the product tree is staged while runtime artifacts remain ignored.

### Task 2: Preserve only durable repository assets

**Files:**
- Modify: `.gitignore`
- Inspect: `public/audio/`
- Inspect: `data/`
- Inspect: `tmp/`
- Inspect: `.logs/`
- Inspect: `prisma/`

- [ ] Confirm `.gitignore` excludes runtime-only files and local secrets, including `.env*`, `.next/`, `.logs/`, `tmp/`, `.worktrees/`, `prisma/*.db*`, `public/tts-cache/`, and `data/song-brief-cache/`.
- [ ] Verify `git status --short --ignored` does not stage any ignored runtime residue.
- [ ] Keep `public/audio/` in the baseline because the local demo audio assets are part of the app experience and referenced by the product code.
- [ ] Confirm no local databases, cache folders, or environment files are staged before committing.

### Task 3: Record the repository recovery plan in git

**Files:**
- Create: `docs/superpowers/plans/2026-05-11-git-baseline-recovery.md`

- [ ] Add this plan document to the repository so the recovery itself is tracked.
- [ ] Re-run `git diff --cached --name-only` and confirm the plan file is included alongside the application source.

### Task 4: Create the real application baseline commit

**Files:**
- Commit staged product files only

- [ ] Review `git diff --cached --stat` and confirm the staged set represents the real app: source, tests, docs, scripts, Prisma schema/migrations, and demo audio assets.
- [ ] Create a single baseline commit that replaces the empty scaffold history as the first usable application snapshot.
- [ ] Re-run `git log --oneline --decorate --graph --all -n 20` and confirm `master` now points to the new baseline commit above `dfad057`.

### Task 5: Prove worktrees now inherit the real codebase

**Files:**
- Verify: `.worktrees/`
- Verify: `src/lib/`
- Verify: `src/tests/`

- [ ] Create a disposable verification worktree from the new baseline commit in the ignored `.worktrees/` directory.
- [ ] Confirm the new worktree contains the full `src/lib/`, `src/app/`, and `src/tests/` trees instead of the original scaffold.
- [ ] Remove the disposable verification worktree after inspection so the repository stays tidy.
- [ ] Capture final evidence with `git worktree list --porcelain` and a clean `git status --short --ignored`.

### Task 6: Hand off the repaired foundation

**Files:**
- No planned code changes; reporting only

- [ ] Summarize the exact commit hash of the new baseline.
- [ ] Summarize which paths were intentionally kept out of git.
- [ ] Summarize that future subagent/worktree work can now branch from the real application state.
