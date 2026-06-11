# PROGRESS.md — Running Build Log

Newest entries on top. Builder appends; never rewrites history.

---

## 2026-06-11 (evening run) — M1 / T1.3 `/api/verify` route

**Slice built:** T1.3 — single-label verification API route. This was the strict-next
TODO after all of M2 (T2.1–T2.5) merged; the comparison engine it depends on now
exists, so the route was unblocked and is the next critical-path slice.

**What was built**
- `src/app/api/verify/handler.ts` — transport-agnostic core, split out so it is unit
  testable with a MOCKED extractor:
  - `parseVerifyForm(formData)` — validates the multipart form (brand, classType,
    netContents, beverageType, image required; **abv intentionally optional** so the
    §5 conditional-by-beverage-type rules apply downstream), enforces a MIME allow-list
    (derived from `SUPPORTED_MIME_TYPES`) and a 10 MB cap, reads the image into memory
    (base64) and never persists it. Throws `VerifyValidationError` (friendly 400s).
  - `runVerification(parsed, extractor)` — times `extractor.extractRouted` +
    `compareLabel`, returns `VerificationResult { fields, warning, overall, latencyMs,
    escalated }`. Verdict comes only from the pure engine, never the model.
- `src/app/api/verify/route.ts` — thin Next.js `POST` adapter (Node runtime). Lazily
  builds `RoutingExtractor(new GeminiExtractor(), new SonnetExtractor())`; maps errors
  to friendly JSON: 400 validation / 400 non-multipart / 503 missing-key (no key name
  leaked) / 502 ExtractionError (input vs transient split) / 500 unknown / 405 non-POST.
  No stack trace ever reaches the client.
- `src/app/api/verify/handler.test.ts` — 12 tests, extractor MOCKED (in-memory fake,
  no network): validation matrix (empty form, missing fields, bad beverage type, no
  image, unsupported MIME, oversize, blank-ABV-for-beer) + assembly (matching label →
  pass, escalation flag propagation, altered warning → fail, in-memory image passthrough).

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `next lint` on the new
files clean; `vitest run` **183/183 passing** (12 new). No live API calls.

**Reviews:** code auditor = **no BLOCKER/MAJOR**; 1 MINOR (MIME error message said
"PNG, JPEG, or WebP" while the allow-list also accepts HEIC/HEIF) + 2 NITs (a redundant
defensive image re-check; `imageBytes` diagnostic-only). Compliance = **PASS on all 6
in-scope criteria** (multipart+validation, conditional-ABV boundary, 5s SLA seam /
escalation propagation, stateless/no-PII, firewall seam preserved, friendly errors).

**Self-triage:** fixed the MINOR in-run — `SUPPORTED_TYPES_LABEL` is now derived from
`SUPPORTED_MIME_TYPES` (single source of truth), so messages list every accepted type;
re-ran tsc + tests green. NITs left as-is per the auditor ("no action required"); not
gold-plated.

**Open finding for Steve (pre-existing, repo-wide — NOT this slice):** `next@14.2.5`
carries a security advisory (npm deprecation warning on install; patched in a later
14.2.x). Bumping Next is a dependency-hygiene task best done as its own small PR before
submission — logged here so it isn't lost. Not a T1.3 blocker.

**Next task:** M3 / T3.1 — single-label UI screen (form + dropzone + results card,
latency display, "running a closer check…" on escalation), consuming this route.

**Blockers:** none. **Status: READY FOR STEVE TO REVIEW + MERGE (PR opened against main).**

---

## 2026-06-11 (overnight run ~1 AM ET) — M2/T2.5 Aggregate verdict

**Slice built:** M2 / T2.5 — aggregate verdict. This closes the M2 comparison engine
(T2.1–T2.5 all done); the correctness core is complete.

**State on entry:** freshly-cloned `main` was several PRs ahead of the connected-folder
planning copies (as the brief warned). Merged on `main`: M0, T1.1, T1.2, T2.1, T2.2,
T2.3, T2.4. Built off `main`. Strict-next TODO in the repo backlog was T2.5 (T1.3 sits
above it in file order but T2.5 is the last unbuilt M2 piece and has no unbuilt
dependency — it combines results from the already-merged comparators).

**What was built**
- `src/lib/comparison/aggregate.ts`:
  - `aggregateOverall(fields, warning)` — pure rollup. Worst severity wins:
    any `fail` -> `fail`; else any `review` -> `review`; else `pass`.
  - Status->severity: `match->pass`, `review->review`, `missing->review`
    (an unread field flags for a human / better image, not an auto-fail — assist
    tool, not adjudicator), `mismatch->fail`.
  - The Government Warning is treated **strictly**: `missing` or `mismatch` -> `fail`
    (an absent or altered mandatory warning is itself a compliance failure, CONTEXT §5),
    only `review->review`, `match->pass`.
  - `compareLabel(expected, extracted)` — single entry point wiring the four real
    comparators (brand, class/type, ABV, net contents) + the warning check + rollup;
    returns `Pick<VerificationResult,'fields'|'warning'|'overall'>`. The /api/verify
    route (T1.3) wraps this with `latencyMs`/`escalated`.
  - `combineAbv(extracted)` helper — joins the extractor's separate `abv` + `proof`
    strings into one value so `compareAbv`'s `proof = 2 x ABV` cross-check can fire;
    returns `null` when neither is present, preserving the conditional-by-beverage-type
    omission path. `beverageType` is threaded through unchanged (no override).
- `aggregate.test.ts` — 16 tests: rollup bands + precedence + empty-list + warning
  strictness; integration via `compareLabel` (clean pass, brand-formatting review,
  net-contents mismatch->fail, reworded warning->fail, spirits-no-ABV->fail,
  beer-no-ABV not failed, proof cross-check wiring).
- Exported both + `Overall`/`LabelComparison` types from `comparison/index.ts`.

**Verification (sandbox clone):** `tsc --noEmit` clean; `next lint` clean;
`vitest run` **171/171 passing** (16 new). Extractor not involved (pure engine; no
live model calls).

**Reviews:** code auditor = CLEAN, no BLOCKER/MAJOR (1 MINOR + 2 NIT, no action
needed). Compliance = PASS on all 5 criteria. Self-triage: applied the one safe NIT
(tightened the spirits-no-ABV test to assert exact `mismatch`/`fail`); re-ran green.

**Open finding (carried, not new):** net-contents is not yet beverage-type aware
(fl-oz-on-beer resolves to `review`, not `match`) — already logged as the T2.3
carry-over; T2.5 is its natural future home since `beverageType` is in scope here.
Conservative `review` over-flags but never wrong-passes, so it stays a PASS, logged to
BACKLOG, not fixed in this slice (no gold-plating).

**Next task:** M1 / T1.3 — `/api/verify` route. With the engine complete it is now
unblocked and is the critical-path next slice (extractor router + `compareLabel` +
input validation + `latencyMs`; extractor MOCKED in unit tests).

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + MERGE PR.**

---

## 2026-06-10 (overnight run) — M2/T2.4 Government Warning strict check + diff

**Slice built:** M2 / T2.4 — strict Government Warning check with word-level diff. The
next strict TODO after T2.3 (net contents); on the single-label critical path. Built on
freshly-cloned `main` (HEAD `7ca3658`, PR #5 merged) — the connected-folder planning
copies lag main by several PRs, so main was the source of truth per the run contract.

**What was built**
- `src/lib/comparison/warning.ts` — `checkGovernmentWarning(warningText)` +
  `diffWarningWords(canonical, found)`, pure / deterministic / I-O-free.
  - `present` (block exists), `prefixCaps` ("GOVERNMENT WARNING" present, **anchored to
    the start**, all-caps), `textMatch` (whitespace-normalized, word-for-word, case-
    sensitive equality vs the canonical constant), and a coalesced LCS word-level `diff`.
  - Status ladder: exact + caps -> **match**; reworded / shortened / extra text ->
    **mismatch** (+ diff); right words but prefix not all-caps -> **mismatch**; all words
    present, prefix capitalized, only body letter-casing differs -> **review**
    (human-in-the-loop, not a hard fail); empty/blank -> **missing**.
  - Every non-missing result carries an honest `FONT_NOTE`: caps + wording are verified
    from text, but true bold/font-size cannot be confirmed from an extracted-text check.
- `src/lib/comparison/warning.test.ts` — 13 tests: the full T2.4 acceptance matrix
  (exact pass, wrapped-but-correct pass, title-case prefix fail, reworded fail+diff,
  missing fail, body-casing review, extra-trailing-text fail) + a `diffWarningWords` suite.
- `src/lib/comparison/index.ts` — exports `checkGovernmentWarning`, `diffWarningWords`.

**Verification (sandbox /tmp clone; node_modules reused from a prior clone via symlink — disk):**
- `tsc --noEmit` — clean.
- `vitest run` — **155/155 passing** (13 in warning.test.ts). No live API calls (the
  comparison engine is pure; extractor not involved). NB: vitest exits non-zero only on a
  benign `EACCES` writing its results cache into the read-only symlinked node_modules —
  the suite itself fully passes (degraded-validation artifact, noted; not a test failure).
- `eslint` on the new files — clean. (Full `next build` not re-run; pure-TS slice, no Next
  runtime deps — consistent with prior disk-constrained M2 runs.)

**Reviews:** code auditor = no BLOCKER; **1 MAJOR** (unanchored prefix regex could read a
caps occurrence anywhere, and a compliant-but-noisy extraction would route to mismatch) —
**FIXED in-run**: anchored `detectPrefixCaps` to `^`, added a leading-text test. **1 MINOR**
(the reworded + lowercase-prefix fallthrough branch was untested) — **FIXED in-run** (added
the test). Compliance = **PASS** on all six T2.4 criteria; recorded the deliberate
body-casing -> `review` interpretation. The OCR-noise downgrade question is logged to
BACKLOG (low-risk; extractor returns an isolated `warningText`) — not guessed.

**Next task:** M2 / T2.5 — aggregate verdict (combine field + warning results into overall
pass/review/fail). After T2.5, the M2 comparison engine is complete and T1.3 `/api/verify`
becomes unblocked.

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + MERGE PR.**

## 2026-06-10 (evening run) — M2/T2.3 net-contents comparison

**Slice built:** M2 / T2.3 — net-contents parse + normalize + compare. Next strict TODO
after T2.2 (ABV); on the single-label critical path. Built on freshly-cloned `main`
(HEAD `8525c14`, PR #4 merged) — the connected-folder planning copies lag main by
several PRs, so main was the source of truth per the run contract.

**What was built**
- `src/lib/comparison/netContents.ts` — `parseNetContents()` + `compareNetContents()`,
  pure/deterministic/I-O-free. Parses value+unit, **anchoring the number to a unit**
  so a lot code or surrounding words can't steal the parse ("Lot 12345 / 750 mL" ->
  750 mL), with a bare-number fallback for a unit-less expected value. `UNITS` table
  normalizes to canonical millilitres (mL/cL/L metric; fl oz/pt/qt/gal U.S., 1 US fl
  oz = 29.5735 mL). Tolerant of "750ml", "1 L", "0,75 L" (comma decimal), "12 fl. oz.".
- Verdict (1% relative tolerance, configurable): equal same-system (1 L vs 1000 mL) ->
  **match**; equal cross-system (750 mL vs 25.4 fl oz) -> **review** (never a silent
  pass — spirits/wine must state metric, a human glances); different fill (750 vs 700,
  375 vs 750) -> **mismatch**; label number with no unit -> review; unreadable/empty
  label -> missing.
- `src/lib/comparison/index.ts` — exports the fn + `parseNetContents` + types.

**Verification (sandbox /tmp clone, node_modules reused from prior clone — disk):**
- `tsc --noEmit` — clean.
- `vitest run` — **142/142 passing** (31 in `netContents.test.ts`). No live API calls
  (comparison engine is pure; extractor not involved).
- `eslint` on the new files — clean. (Full `next build` not re-run; pure-TS slice, no
  Next runtime deps — consistent with prior M2 runs' disk-constrained validation.)

**Reviews:** code auditor = no BLOCKER; 2 MAJOR. **M1** (regex grabbed the first number
in the string, dropping a unit behind a lot code) was a real "compliant label wrongly
flagged" bug — **FIXED in-run** (unit-anchored parse + 4 new surrounding-text tests).
**M2** (net-contents verdict not yet beverage-type-aware, so an equal fl-oz quantity on
a beer label is `review` not `match`) needs the aggregate-verdict wiring — compliance
reviewer ruled the conservative `review` a **PASS** (it never wrongly passes), so M2 is
logged to BACKLOG for T2.5, not gold-plated now. Compliance overall = **PASS**.

**Self-triage:** M1 fixed + re-tested; M2 + MINOR/NIT logged to BACKLOG "Carry-over."

**Next task:** M2 / T2.4 — Government Warning strict check + word-level diff (canonical
constant + `WarningCheckResult` already in place from M0).

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + MERGE PR.**

---

## 2026-06-10 (evening run) — M2 / T2.2 ABV conditional-by-beverage-type (PR)

**Slice built:** M2 / T2.2 — conditional ABV comparison. One slice only.

**Slice selection:** on entry `main` had M0, T1.1 (PR #1), T1.2 (PR #2), T2.1 (PR #3)
merged, no open BLOCKER/MAJOR/FAIL. The strict-next TODO was **T2.2** — also squarely
on the critical path (single-label core). Pure TS, no inference keys needed, so safe
for an unattended run. The connected-folder `planning/*` copies still lag (~3 PRs
behind); built off `main` per AGENTS.md §0.

**What was built**
- `src/lib/comparison/abv.ts` (pure/deterministic):
  - `parseAbv(input)` → `{abv, proof, hasTableWine, hasLightWine, usesAbvAbbrev,
    finerThanTenthPrecision}`. ABV uses an **anchored** `% Alc./Vol.|ABV|alcohol by
    volume` regex with a bare-`%` fallback (so an earlier unrelated percent such as
    "2% added flavors" can't be mistaken for the ABV); proof parsed separately and
    excluded from the `%` search.
  - `compareAbv(expected, found, beverageType, {tolerance=0.0})` → `FieldResult`.
    Spirits: ABV always required → absent = `mismatch`. Wine: "Table Wine"/"Light
    Wine" substitutes for a numeric ABV → `match` (not missing); expected-number but
    none + no designation → `mismatch`. Beer: ABV optional → absent = `match`;
    expected-but-omitted → `review` (explicitly not a failure); "ABV" abbreviation and
    >0.1% precision downgrade a clean match to `review`. Numeric compare honours
    tolerance; proof≈2×ABV inconsistency → `review`; ABV derivable from proof.
    Display values rounded (no float artifacts) for the "73-year-old" UX bar.
- `src/lib/comparison/index.ts` — exports `compareAbv`, `parseAbv`, types.

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `vitest run` **111/111**
green (28 new ABV tests, extractor not involved — pure engine, no live API); `next
lint` clean.

**Reviews:** code auditor — 1 MAJOR (unanchored `%` could grab an earlier percent →
wrongly fail a compliant label) **FIXED + regression-tested** this run; rest MINOR/NIT
logged to BACKLOG. Compliance — **all PASS** vs CONTEXT §5 / PROJECT_PLAN §8 (spirits
required, wine Table Wine substitute, beer optional + format flags); one DEFERRED edge
(conditionally-required beer ABV for added-flavors/state-law) logged for the M5 README
limitations note. See AUDIT.md / COMPLIANCE.md.

**Next task:** M2 / T2.3 — Net contents (parse value+unit; mL/L/fl oz normalize;
numeric compare). T2.4 (Government Warning strict+diff) and T2.5 (aggregate verdict)
follow, then T1.3 (`/api/verify`) is unblocked.

**Blockers:** none. **Status: READY FOR STEVE TO REVIEW + MERGE PR.**

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
