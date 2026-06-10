# PROGRESS.md — Running Build Log

Newest entries on top. Builder appends; never rewrites history.

---

## 2026-06-10 (overnight run) — M2 / T2.1 normalization + brand/class-type match (PR)

**Slice built:** M2 / T2.1 — the comparison engine's tolerant text core (normalization
+ similarity + brand/class-type field comparison). One slice only.

**Slice-selection note (ordering):** on entry `main` already had M0, T1.1 (PR #1) and
T1.2 (PR #2) merged, with NO open BLOCKER/MAJOR/FAIL. The next strict-order TODO is
**T1.3 (`/api/verify`)**, but its acceptance is "call extractor → **comparison engine**
→ return `VerificationResult`," and the comparison engine did not exist yet — T1.3 is
**blocked by a dependency**. The backlog rule is "do them top-down *unless a dependency
says otherwise*," and the guardrail favors a fully-tested slice over an unmet
acceptance criterion. So I built **T2.1** (the comparison-engine foundation that
unblocks T1.3) as this run's single slice. This is a dependency-driven pick, not a
guess against the spec.

**Connected-folder drift (FYI for Steve):** the `planning/*` + `PROGRESS/AUDIT/
COMPLIANCE` copies in the connected folder are ~2 PRs behind `main` (they still show
T1.1/T1.2 as TODO). The repo `main` is the source of truth per AGENTS.md §0; I built
off `main`. A `git pull` after merging reconciles your local folder.

**What was built**
- `src/lib/comparison/normalize.ts` — pure helpers: `normalizeText` (NFKD +
  combining-mark strip for diacritic folding, lowercase, strip apostrophes/possessive
  markers, other punctuation→space, collapse+trim whitespace), `levenshtein`
  (two-row DP, O(min(m,n)) memory, safe under `noUncheckedIndexedAccess`),
  `similarityRatio` (`1 − dist/maxLen`, both-empty→1).
- `src/lib/comparison/textMatch.ts` — `compareTextField(field, expected, found)` →
  `FieldResult`. Exact raw (incl. whitespace) → `match`; equal only after
  normalization (case/punctuation/possessive/accent/whitespace) → `review` "matches
  except formatting" (never a silent pass — Dave/STONE'S THROW human-in-the-loop);
  else similarity thresholds `>=0.95` match / `0.80–0.95` review / `<0.80` mismatch;
  empty/null found → `missing`. `compareBrand` / `compareClassType` wrappers.
- `src/lib/comparison/index.ts` — public surface.

**Design notes**
- Verdict depends ONLY on extracted text run through pure functions — no model
  opinion, no I/O, no Date/random/global state (the "correctness is defensible" core
  from CONTEXT §4 / PLAN architecture).
- For typical brand lengths (~15–18 chars) a single-character typo lands at
  ~0.94 similarity → **review**, not match. That is intended: borderline reads are
  flagged for a human glance rather than silently passed.

**Verification (sandbox):**
- `vitest run` — **83/83 passing** (29 new comparison tests + 54 pre-existing). All
  extractor tests remain MOCKED (no live Gemini/Anthropic); the comparison tests call
  no model at all (pure text).
- Slice typecheck (`tsc --noEmit`, strict + `noUncheckedIndexedAccess`) — clean.
- Build-env constraint this run: the sandbox root had only ~400 MB free (leftover
  `node_modules` from prior sessions, owned by `nobody`, could not be removed), so a
  full `npm install` would not fit. Validated the slice with a minimal vitest +
  typescript toolchain instead (the slice is pure TS with no Next runtime deps).
  Full `next lint` / `next build` were not re-run this slice — noted for Steve / the
  next run with a clean sandbox. No production code depends on this.

**Reviews (subagents, this run):**
- Code auditor → **No BLOCKER/MAJOR.** 2 MINOR + NITs. Both MINORs FIXED + re-tested
  in-run: (1) diacritic stripping corrupted accented brands (`café`→`caf`) → now NFKD
  + combining-mark fold (`café`==`cafe`); (2) leading/trailing-whitespace-only diff
  returned "Exact match" → now routes to formatting `review`. See AUDIT.md.
- Compliance → **PASS.** STONE'S THROW → review (test-proven); Match/Review/Mismatch
  three-way + never-silent-pass honored; pure/deterministic. T2.2–T2.5 correctly
  DEFERRED. See COMPLIANCE.md.

**Self-triage:** the two MINORs were safely fixable → fixed + re-tested. Optional
NITs (exact-threshold-boundary pin test; `compareClassType` missing-case test) logged
to BUILD_BACKLOG, not gold-plated.

**Next task:** M2 / T2.2 — ABV (conditional by beverage type). After M2 lands, T1.3
(`/api/verify`) is unblocked.

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + MERGE PR.**

---

## 2026-06-09 (evening run) — M1 / T1.2 Sonnet deep tier + router (PR)

**Slice built:** M1 / T1.2 — `SonnetExtractor` (conditional deep tier) + the
`RoutingExtractor` (Flash → low-confidence → Sonnet → human). One slice only. On
entry, `main` already had T1.1 merged (PR #1) and no open BLOCKER/MAJOR/FAIL, so I
picked the next TODO. (Note: the connected-folder `planning/*` copies were a run
behind `main`; the repo is the source of truth per AGENTS.md §0 — I built off `main`.)

**What was built**
- `src/lib/extractor/sonnet.ts` — `SonnetExtractor implements LabelExtractor`. Single
  Anthropic Messages vision call: `temperature:0`, JSON-only prompt (`SONNET_PROMPT =
  EXTRACTION_PROMPT + JSON-shape instruction`, reusing the Flash transcription prompt),
  base64 image block. Key sent in the `x-api-key` header + `anthropic-version` (never
  in the URL). Pure helpers `buildSonnetRequestBody` / `extractAnthropicText` are
  network-free and unit-tested; constructor takes an injectable `fetchImpl` so tests
  MOCK the transport. Reuses the Flash tier's tolerant `parseExtractedLabel`, so
  malformed/empty/blocked output degrades to a confidence-0 label (no crash). 7s
  `AbortController` timeout (deep tier may run ~5-7s per CONTEXT §4).
- `src/lib/extractor/router.ts` — `RoutingExtractor implements LabelExtractor`.
  `extractRouted(image)` runs the primary (Flash); if `confidence >= threshold` it
  returns the Flash result and NEVER calls the deep tier (protects the 5s SLA); below
  threshold it invokes Sonnet and flags `escalated:true`. Returns routing metadata
  (`label, escalated, tier, extractorName, primaryConfidence, threshold,
  deepTierError?`) for T1.3 to map onto `VerificationResult.escalated`. Threshold from
  `getConfidenceThreshold()` (env, 0.7 default), constructor-overridable.
- `src/lib/extractor/index.ts` — exports the new tier + router surface.

**Resilience design**
- Deep-tier failure (network/timeout/http) does NOT fail the request: the router falls
  back to the primary's low-confidence label, still `escalated:true`, recording the
  `ExtractionError['code']` in `deepTierError` (no secrets) — so work reaches human
  review (the intended terminal state) instead of erroring.
- Primary-tier failure propagates (nothing to fall back to); the deep tier is not
  called in that case.

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `vitest run` **54/54**
(21 new: 13 sonnet + 8 router; transport/extractors injected — no live
Anthropic/Gemini); `next lint` clean. (No app/route wiring in this slice, so
`next build` is unchanged.)

**Reviews (subagents, this run):**
- Code auditor: no BLOCKER/MAJOR. 1 MINOR (the abort timer covers `fetch` but not the
  `response.json()` body read — a carry-over shared with the Flash tier) + 2 NIT
  (gif single-frame note; type the `deepTierError` literal). → BACKLOG (M1/T1.3),
  fixing both tiers together.
- Compliance: PASS — all seven applicable criteria. UI "closer check" state (M3) and
  the `/api/verify` `escalated`/`latencyMs` mapping (T1.3) correctly DEFERRED.

**Self-triage:** the one MINOR is a cross-tier latency-deadline carry-over best fixed
in T1.3 (where the route + both extractors are touched) — logged to BACKLOG rather
than gold-plated here to keep the slice focused. NITs non-actionable.

**Next task:** M1 / T1.3 — `/api/verify` route (single): multipart input + validation
→ router (`extractRouted`) → comparison engine → `VerificationResult` with `latencyMs`
+ `escalated`; bad input → 4xx + friendly message, never a stack trace. Also close the
two T1.3 BACKLOG carry-overs (body-read deadline; MissingConfigError → friendly error).

**Blockers:** none.

**Status: PR pushed — READY FOR STEVE TO REVIEW + MERGE.**

---

## 2026-06-09 (overnight run) — M1 / T1.1 extraction layer (PR)

**Slice built:** M1 / T1.1 — `LabelExtractor` interface + `GeminiExtractor`. One slice
only (no run-ahead). No open BLOCKER/MAJOR/FAIL on entry, so picked the next TODO.

**What was built**
- `src/lib/extractor/types.ts` — `LabelExtractor` interface (`extract(image:
  LabelImage): Promise<ExtractedLabel>`), in-memory `LabelImage` (base64 + mimeType,
  never persisted), and `ExtractionError` (codes: network/http/empty/input/timeout/
  unknown). This interface IS the swappable firewall seam (CONTEXT §4).
- `src/lib/extractor/gemini.ts` — `GeminiExtractor implements LabelExtractor`. Single
  Gemini `generateContent` vision call: `temperature: 0`, `responseMimeType:
  application/json`, strict `responseSchema` (brand, classType, abv, proof,
  netContents, warningText, rawText, confidence). Transcription-only prompt ("do not
  make a compliance judgement"). Exported pure helpers `buildGeminiRequestBody` /
  `extractModelText` / `parseExtractedLabel` are network-free and unit-tested.
  Constructor takes an injectable `fetchImpl` so tests MOCK the transport.
- `src/lib/extractor/index.ts` — public surface.

**Error / robustness design**
- Malformed, partial, array, empty-candidate, or safety-blocked output → degrades to a
  confidence-0 `ExtractedLabel` (no crash) so the T1.2 router can escalate / hand to
  human review. Transport failures throw a secret-free `ExtractionError`.
- 4s `AbortController` timeout guards the hard 5s SLA (added in self-triage).
- API key sent in the `x-goog-api-key` header (never in the URL); provider error
  bodies are never surfaced into messages (both pinned by tests).

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `vitest run` **33/33**
(19 new extractor tests, transport mocked — no live Gemini/Anthropic call); `next lint`
clean. (No app/route wiring in this slice, so `next build` is unchanged from M0.)

**Reviews (subagents, this run):**
- Code auditor: no BLOCKER/MAJOR. Two MINOR (no timeout; misleading MIME message) +
  two NIT (unused `cause`; asymmetric secret-free test) — all FIXED + re-tested this
  run. One NIT (lazy-key `MissingConfigError` vs `ExtractionError` mapping) → BACKLOG
  for T1.3. Also flagged `next@14.2.5` security advisory → BACKLOG for M5.
- Compliance: PASS. **Closes the §3 firewall-seam PARTIAL → PASS.** T1.2/T1.3/M2
  items correctly DEFERRED, not failed.

**Self-triage:** safely-fixable audit items fixed + re-tested in-run; items needing a
future-route decision or a dependency bump logged to BACKLOG (not gold-plated).

**Next task:** M1 / T1.2 — `SonnetExtractor` (same interface) + the Flash→(low
confidence)→Sonnet router, escalation flagged in the result for the UI.

**Blockers:** none.

**Status: PR pushed — READY FOR STEVE TO REVIEW + MERGE.**

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
