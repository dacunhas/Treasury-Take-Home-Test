# PROGRESS.md — Running Build Log

Newest entries on top. Builder appends; never rewrites history.

---

## 2026-06-09 (evening run) — M0 scaffold & foundations

**Slice built:** M0 (T0.1 + T0.2 + T0.3) — the first-run scaffold per the task brief.
Empty repo on entry (only `planning/` + assignment files present), so this run laid
the foundations.

**What was built**
- Next.js 14 (App Router) + TypeScript app, manually scaffolded (deterministic, no
  network race from `create-next-app`). Minimal accessible placeholder home page +
  root layout with the "flags, does not decide" framing.
- Tooling: Vitest (node env, `@/` alias), ESLint (`next/core-web-vitals` + prettier),
  Prettier, `tsconfig` with `strict` + `noUncheckedIndexedAccess`.
- `.gitignore` covering `.env`, `.env.local`, `.env*` with a `!.env.example`
  re-include; `.env.example` with empty `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` /
  `EXTRACTION_CONFIDENCE_THRESHOLD` placeholders (no real values).
- **Types** (`src/types/index.ts`): `BeverageType`, `FieldStatus` (incl. `review`),
  `FieldResult`, `WarningCheckResult` (+ `WarningDiffSegment`), `ExtractedLabel`
  (incl. `confidence`), `VerificationResult` (incl. `latencyMs`, `escalated`),
  `ExpectedLabel`. Matches PROJECT_PLAN §2 data shapes.
- **Government Warning** (`src/lib/governmentWarning.ts`): canonical constant
  verbatim per CONTEXT §5, `GOVERNMENT_WARNING_PREFIX`, and
  `normalizeWarningWhitespace()`. Pinned by an independent verbatim test.
- **Config loader** (`src/lib/config.ts`): env-only secret access; `MissingConfigError`
  fails loudly with a clear, secret-free message; whitespace-only keys treated as
  missing; `getConfidenceThreshold()` defaults to 0.7 and clamps invalid input.

**Verification (sandbox /tmp/ttb-build):**
- `tsc --noEmit` — clean.
- `vitest run` — **14/14 passing** (6 warning, 8 config). Extractor not involved
  (no live API calls; M0 has no extractor yet).
- `next lint` — no warnings/errors (after dropping the unavailable `next/typescript`
  extends from the eslint config).
- `next build` — succeeds (static `/` + `/_not-found`).

**Decisions / notes**
- Scaffolded by hand rather than `create-next-app` because the sandbox kills
  backgrounded processes on call return (`--die-with-parent`); a single foreground
  `npm install` with warm cache completed in ~29s. Recorded here so future runs use
  the same one-call install pattern.
- Pinned dependency versions (Next 14.2.5, React 18.3.1, Vitest 1.6.0) for
  reproducibility.
- Removed `next/typescript` from `.eslintrc.json` — not resolvable in
  eslint-config-next 14.2.5's classic config; `next/core-web-vitals` + `prettier`
  lint clean.

**Reviews:** code auditor = no BLOCKER/MAJOR (4 minor/nit). Compliance = PASS for M0
foundations; one PARTIAL (the `LabelExtractor` firewall seam is documented in the
README but not yet a TS interface — lands with M1). See AUDIT.md / COMPLIANCE.md.

**Self-triage:** nothing required a fix within M0. Minor/nit/partial items are
logged to BUILD_BACKLOG "Carry-over from review" for their owning milestone — not
gold-plated now.

**Next task:** M1 / T1.1 — `LabelExtractor` interface + `GeminiExtractor` (structured
vision call, strict JSON schema, low temperature), with the extractor MOCKED in unit
tests. Declaring the `LabelExtractor` TS interface there also upgrades the compliance
PARTIAL to PASS.

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + COMMIT + PUSH.**

**Manual git actions for Steve (builder can't delete in the mount):**
- Leftover sandbox test artifacts exist in the repo root from an earlier session and
  should be removed before the first commit (they are not part of the app):
  `__cptest/` (and its contents) and `.__writetest`. Delete them on your machine, or
  add them to `.gitignore` if you prefer. The current `.gitignore` does not exclude
  them.
- The two large reference files (`Assignment.md`, the Gmail PDF) are intentionally
  left in place; decide whether to commit or `.gitignore` them.
