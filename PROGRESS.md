# PROGRESS.md — Running Build Log

Newest entries on top. Builder appends; never rewrites history.

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
