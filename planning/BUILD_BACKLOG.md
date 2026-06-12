# BUILD_BACKLOG.md — Ordered Build Tasks

The work, broken into discrete tasks an agent can pick up statelessly. Tasks are
ordered; do them top-down unless a dependency says otherwise. Status values:
`TODO / IN_PROGRESS / DONE / DEFERRED`. Builder updates status + date and logs
detail in `PROGRESS.md`. Each task lists acceptance criteria — do not mark `DONE`
until all are met with tests green.

Grouped by the PROJECT_PLAN §7 milestones.

---

## M0 — Scaffold & foundations (Tue 6/9 / Wed 6/10)

### T0.1 — Repo + Next.js scaffold  [DONE 2026-06-09]
- New Next.js (App Router) + TypeScript app; ESLint/Prettier; Vitest (or Jest).
- New personal GitHub repo; initial commit; `.gitignore` covers `.env*`.
- **Accept:** app runs locally; `npm test` runs (even if empty); repo pushed.
- Done: app builds (`next build` clean) + `npm test` runs (14 tests); `.gitignore`
  covers `.env*` with `!.env.example`. Repo push is Steve's manual step (builder
  never runs git). Vitest chosen over Jest.

### T0.2 — Secrets & config  [DONE 2026-06-09]
- `.env.local` with `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`; typed config loader.
- `.env.example` committed (no real values).
- **Accept:** missing-key path fails loudly with a clear message; no secret in git.
- Done: `src/lib/config.ts` typed loader; `MissingConfigError` is loud + secret-free
  (tested); `.env.example` committed with empty placeholders. `.env.local` is Steve's
  to create locally (gitignored). Confidence threshold (0.7 default) pre-wired for M1.

### T0.3 — Types & constants  [DONE 2026-06-09]
- Define `FieldStatus`, `FieldResult`, `WarningCheckResult`, `VerificationResult`,
  `ExtractedLabel` (incl. `confidence`), `BeverageType` (per CONTEXT/PLAN).
- Constant: canonical Government Warning string (CONTEXT §5, verbatim).
- **Accept:** types compile; warning constant matches canonical text exactly.
- Done: `src/types/index.ts` (all shapes incl. `WarningDiffSegment`, `ExpectedLabel`,
  `latencyMs`, `escalated`); `src/lib/governmentWarning.ts` canonical constant
  verbatim + test-pinned; `tsc --noEmit` clean.

---

## M1 — Extraction layer (Wed 6/10)

### T1.1 — `LabelExtractor` interface + Gemini impl  [DONE 2026-06-09]
- Interface `extract(image): Promise<ExtractedLabel>`.
- `GeminiExtractor`: single structured-output vision call; strict JSON schema
  (brand, classType, abv, proof, netContents, warningText, rawText, confidence);
  low temperature.
- **Accept:** returns populated `ExtractedLabel` for a sample label in < ~3s;
  malformed model output handled (no crash).
- Done: `src/lib/extractor/{types,gemini,index}.ts`. `LabelExtractor` interface
  (`extract(image: LabelImage): Promise<ExtractedLabel>`) is the swappable firewall
  seam. `GeminiExtractor`: single `generateContent` vision call, `temperature: 0`,
  `responseMimeType: application/json` + strict `responseSchema` (brand, classType,
  abv, proof, netContents, warningText, rawText, confidence). Malformed/empty/blocked
  output degrades to a confidence-0 label (no crash); transport failures throw a
  secret-free `ExtractionError` (codes: network/http/empty/input/timeout). 4s
  AbortController timeout guards the 5s SLA. 19 mocked unit tests (transport injected
  — no live Gemini). Closes the compliance §3 firewall-seam PARTIAL → PASS.

### T1.2 — Sonnet deep tier + router  [DONE 2026-06-09]
- `SonnetExtractor` (same interface). Router: Flash → if confidence < threshold →
  Sonnet → else return Flash result. Threshold configurable.
- **Accept:** high-confidence label uses Flash only; forced-low-confidence path
  invokes Sonnet; escalation flagged in the result for the UI.
- Done: `src/lib/extractor/sonnet.ts` — `SonnetExtractor implements LabelExtractor`
  (Anthropic Messages vision call; `temperature:0`; JSON-only prompt; key in the
  `x-api-key` header, never the URL; 7s deep-tier timeout; malformed/empty output
  degrades to confidence-0; transport failures → secret-free `ExtractionError`).
  `src/lib/extractor/router.ts` — `RoutingExtractor implements LabelExtractor` with
  `extractRouted()` returning `{label, escalated, tier, extractorName,
  primaryConfidence, threshold, deepTierError?}`. Confident path (`>= threshold`)
  uses Flash ONLY (deep tier never called — protects the 5s SLA); low-confidence
  path invokes Sonnet and flags `escalated`; deep-tier failure falls back to the
  primary result still flagged `escalated` (so work reaches human review).
  Threshold from `getConfidenceThreshold()` (env, 0.7 default), constructor-
  overridable. 21 new mocked unit tests (13 sonnet + 8 router; transport/extractors
  injected — no live Anthropic/Gemini). 54/54 total green; `tsc`/`next lint` clean.

### T1.3 — `/api/verify` route (single)  [DONE 2026-06-11]
- Accept multipart (expected values + beverage type + image). Validate input.
  Call extractor → comparison engine → return `VerificationResult` with `latencyMs`.
- **Accept:** happy path returns structured result; bad input returns 4xx + message,
  never a stack trace.
- Done: `src/app/api/verify/{route,handler,handler.test}.ts`. Pure `handler.ts`
  (parseVerifyForm + runVerification) is unit-tested with a MOCKED extractor (12
  tests); thin `route.ts` POST adapter wires `RoutingExtractor(Gemini, Sonnet)` and
  maps errors → friendly JSON (400 validation / 502 ExtractionError / 503 missing-key
  / 500 unknown / 405 non-POST), never a stack trace. Measures `latencyMs`, propagates
  `escalated` from the router, blank-ABV passthrough preserves §5 conditional rules,
  10 MB size cap, MIME allow-list, stateless (image in-memory only). tsc + lint clean;
  183/183 tests green.

---

## M2 — Comparison engine (Thu 6/11)  *(the correctness core — heavily tested)*

### T2.1 — Normalization + brand/class-type match  [DONE 2026-06-10]
- Normalize (lowercase, NFKC, strip punctuation/possessives, collapse whitespace);
  similarity scoring; thresholds → match / review / mismatch.
- **Accept:** unit tests incl. "STONE'S THROW" vs "Stone's Throw" → review/match,
  not fail; clearly different brands → mismatch.
- Done: `src/lib/comparison/{normalize,textMatch,index}.ts` — pure/deterministic.
  `normalizeText` (NFKD + diacritic fold, lowercase, possessive/apostrophe strip,
  punctuation→space, whitespace collapse), `levenshtein` two-row DP, `similarityRatio`.
  `compareTextField`/`compareBrand`/`compareClassType` → `FieldResult` with thresholds
  `>=0.95` match / `0.80–0.95` review / `<0.80` mismatch; normalization-equal (case/
  punctuation/possessive/accent/whitespace-only) → **review** "matches except
  formatting" (never silent pass — the STONE'S THROW human-in-the-loop case); empty
  found → `missing`. 29 mocked-free unit tests (no model calls — pure text). Review
  MINORs fixed in-run: diacritic folding (café==cafe) + whitespace-only→review.
  29 new tests; 83/83 total green; slice typechecks clean (strict +
  `noUncheckedIndexedAccess`).

### T2.2 — ABV (conditional by beverage type)  [DONE 2026-06-10]
- Parse numeric %; tolerance compare; proof = 2×ABV cross-check. Conditional rules:
  spirits required; wine "Table Wine"/"Light Wine" substitute allowed (7–14%);
  beer optional + flag "ABV" abbreviation + 0.1% precision.
- **Accept:** unit tests for each beverage type incl. beer-without-ABV (pass) and
  spirits-without-ABV (fail).
- Done: `src/lib/comparison/abv.ts` — pure `parseAbv` (anchored `% Alc./Vol.` regex
  with bare-`%` fallback; proof; Table/Light Wine; disallowed "ABV" abbrev; >0.1%
  precision) + `compareAbv(expected, found, beverageType, {tolerance=0.0})`. Spirits
  ABV-absent → `mismatch`; wine Table/Light Wine substitute → `match`; beer ABV-absent
  → `match` (optional), expected-but-omitted → `review`; numeric compare w/ tolerance;
  proof≈2×ABV inconsistency → `review`; derive-ABV-from-proof. 28 unit tests; 111/111
  total green; `tsc`/`next lint` clean. Exported via `comparison/index.ts`.

### T2.3 — Net contents  [DONE 2026-06-10]
- Parse value+unit; normalize mL/L/fl oz; numeric compare.
- **Accept:** unit tests for unit conversions and mismatches.
- Done: `src/lib/comparison/{netContents.ts,netContents.test.ts}` + index export —
  pure/deterministic. `parseNetContents` reads value+unit, anchoring the number to a
  unit so lot codes / surrounding text don't steal the parse ("Lot 12345 / 750 mL"
  -> 750 mL); tolerant of "750ml", "1 L", "0,75 L", "12 fl. oz.". `UNITS` table
  normalizes to canonical mL (mL/cL/L metric; fl oz/pt/qt/gal US, 1 US fl oz =
  29.5735 mL). `compareNetContents` compares within a 1% relative tolerance: equal
  same-system (1 L vs 1000 mL) -> match; equal cross-system (750 mL vs 25.4 fl oz)
  -> review (never a silent pass — metric is required for spirits/wine); different
  fill (750 vs 700) -> mismatch; unit-less label number -> review; unreadable/empty
  -> missing. 31 unit tests. 142/142 total green; `tsc`/eslint clean.

### T2.4 — Government Warning (strict + diff)  [DONE 2026-06-10]
- Checks: present; "GOVERNMENT WARNING" uppercase; full text == canonical
  (whitespace-normalized); word-level diff on mismatch. Honesty note re: bold/font
  not detectable from text.
- **Accept:** test matrix — exact (pass); title-case prefix (fail); reworded (fail);
  missing (fail); shrunk-but-correct-text (pass on text, note formatting limit).

- Refinement 2026-06-12: body letter-casing made `match` (was `review`) — body case is
  not regulated (only the all-caps "GOVERNMENT WARNING" prefix + wording are). Fixes the
  "warning always shows Needs review" report. Hard-fails (non-caps prefix / reworded /
  missing) unchanged; bold/font-size caveat retained. (auditor APPROVE, compliance PASS.)

### T2.5 — Aggregate verdict  [DONE 2026-06-11]
- Combine field + warning results into overall `pass / review / fail`.
- **Accept:** any FAIL → fail; any REVIEW and no FAIL → review; else pass.

---

## M3 — Single-label UI + errors + accessibility (Fri 6/12)

### T3.1 — Single-label screen  [DONE 2026-06-11]
- Form (brand, class/type, ABV, net contents, beverage-type selector) + image
  dropzone; results card (overall banner + per-field rows + warning diff);
  "Verified in N.Ns" latency display + "running a closer check…" on escalation.
- **Accept:** end-to-end verify works in the browser against a real sample label.
- Done: `src/components/VerifyForm.tsx` (client) + `src/app/page.tsx` shell +
  pure `src/lib/ui/format.ts` presentation helpers (testable under the node vitest
  env — no DOM dep added). Form posts multipart to `/api/verify` (field names match
  `parseVerifyForm`); ABV is NOT hard-required (CONTEXT §5 conditional rule). Results
  card = overall banner (icon+word+summary), per-field table (expected vs found +
  status), Government Warning section with the word-level diff + plain-language
  legend, and the "Verified in N.Ns" latency line ("(a closer check was run)" on
  escalation; in-flight "running a closer check…" copy). Status conveyed by glyph +
  word, never color alone; labels tied to inputs; `aria-live`/`role=alert`/`aria-busy`.
  8 new pure unit tests (format.ts); 191/191 total green; tsc + next lint + next build
  all clean. Reviews: auditor no BLOCKER/MAJOR; compliance PASS. 3 in-run fixes
  (dead ref removed, non-JSON-body response now shows an HTTP-status message, HEIC
  copy drift). Deeper error UX = T3.2; full a11y sweep = T3.3; sample-label browser
  E2E = T3.4 — all left to their own slices (not gold-plated).

### T3.2 — Error handling  [DONE 2026-06-11]
- Wrong type/oversize; empty form/image; model/network failure; unreadable image →
  "request a better image"; partial extraction → mark fields `missing`.
- **Accept:** each path shows a friendly message; no crash/stack trace.
- Done: `src/lib/ui/imageConstraints.ts` (new, client-safe single source for
  `MAX_IMAGE_BYTES` + accepted MIME set + labels; `handler.ts` now imports/re-exports
  the limit so client + server can't drift) + `src/lib/ui/validateForm.ts` (new, pure
  preflight: empty-form, missing/zero-byte image, unsupported type, oversize — returns
  the first friendly problem + which control to focus). `VerifyForm.tsx` runs the
  preflight before the network round-trip and moves focus to the offending control
  (brand/image refs); existing post-submit paths preserved — `data.error` surfacing
  ("request a better image" from the API `ExtractionError`), non-JSON gateway guard,
  network-failure catch. Partial extraction still renders `missing` rows via `format.ts`
  (unchanged). 12 new unit tests incl. an inclusive size boundary + a drift guard
  (client MIME list == extractor `SUPPORTED_MIME_TYPES`). 203/203 green; tsc + lint +
  `next build` clean. Reviews: AUDIT PASS (no BLOCKER/MAJOR/MINOR), COMPLIANCE PASS
  (9/9). Full a11y sweep = T3.3; sample-label browser E2E = T3.4 (not gold-plated).

### T3.3 — Accessibility pass  [DONE 2026-06-12]
- Semantic HTML, labels tied to inputs, keyboard flow, focus states, AA contrast,
  status by icon+text (not color alone), large targets, plain language.
- **Accept:** keyboard-only run completes a verification; automated a11y check clean.
- Done: `src/app/globals.css` (visible `:focus-visible` ring + `@supports` fallback,
  `.sr-only`, focus-revealed skip link, `prefers-reduced-motion` guard); skip link +
  focusable `<main id="main-content">` landmark; `VerifyForm` focus management
  (focus → result on success, → `role="alert"` on submit error, → offending field on a
  fixable validation error) + `aria-describedby` wiring + palette tokens. New
  `src/lib/ui/colors.ts` (single-source palette) + pure `contrast.ts` (WCAG 2.1 math).
  AUTOMATED a11y check = three layers: `contrast.test.ts` (asserts every rendered
  fg/bg pair clears AA — back-fills the one rule axe cannot run under jsdom),
  `VerifyForm.a11y.test.tsx` (axe-core, 0 violations on the form + a representative
  results view), and `plugin:jsx-a11y/recommended` lint (jsx-a11y pinned as an explicit
  devDep). 226/226 green; tsc + `next lint` + `next build` clean. Status conveyed by
  glyph+word everywhere (never colour alone). Keyboard-only END-TO-END *completion* of a
  verification is exercised by the T3.4 sample-label browser run (DEFERRED), not this slice.

### T3.4 — Test labels  [DONE 2026-06-12]
- Generate/source sample labels (CONTEXT §5 fields) incl. one non-compliant warning,
  one angled/glare photo, one beer (no ABV), one table wine.
- **Accept:** labels committed to `samples/`; referenced in README demo steps.
- Done: `samples/` holds 5 synthetic labels + a deterministic Pillow-only generator
  (`generate_samples.py`, no numpy), `EXPECTED.csv` (expected COLA values + target
  verdict per label, doubles as an M4 batch fixture), and `samples/README.md`
  (per-label table + "How to demo" walkthrough). Coverage: (1) clean compliant
  spirits = CONTEXT §5 sample; (2) non-compliant warning (title-case prefix +
  reworded clauses -> warning FAIL + diff); (3) beer with NO ABV statement (optional
  -> not failed); (4) `STONE'S THROW` table wine (tolerant-brand review + "Table
  Wine" in lieu of numeric ABV); (5) #1 tilted+glare+blurred (Jenny bad-photo).
  Compliant labels render the Government Warning **byte-identical** to
  `src/lib/governmentWarning.ts` (auditor + compliance both re-verified the
  283-char match). Top-level README adds a "Try it with the sample labels" section.
  Pure-asset slice: no `src/` change; 226/226 tests, tsc, lint, `next build` green.

---

## M4 — Batch mode (Sat 6/13)  *(cut line if behind — see slip rule)*

### T4.1 — Batch input + processing  [DONE 2026-06-12]
- CSV of expected values (+ beverage type) + multi-image upload; match by filename
  or column; process with progress; per-row error isolation.
- **Accept:** a multi-row CSV + images produces a results table; one bad row doesn't
  fail the batch.
- Done: pure, unit-tested batch core in `src/lib/batch/` — `csv.ts` (RFC-4180-style
  parser + per-row, non-fatal validation; any-order alias headers; ABV optional per
  §5), `match.ts` (filename/column matching: case-insensitive basename, ext-less stem
  fallback, dir-prefix strip, shared-image + `unusedFiles`), `process.ts`
  (`runBatch` with PER-ROW try/catch isolation — one bad row never fails the batch —
  a bounded concurrency pool that preserves row order, and `onProgress`), `fields.ts`
  (row->`/api/verify` field map, blank-ABV passthrough). UI: `BatchForm.tsx` (CSV +
  multi-image inputs, progress bar, results table; verifier POSTs each row to the
  existing stateless `/api/verify`, reusing the single-label core) + `AppTabs.tsx`
  (accessible WAI-ARIA Single/Batch tab switch). 26 new batch tests; 260/260 total
  green; scoped `tsc --noEmit` clean (degraded env — see PROGRESS). Auditor: no
  BLOCKER/MAJOR (shared color-token + dead-branch nits fixed in-run). Compliance: PASS
  on all 8 in-scope criteria; T4.2 (sort/detail/export) correctly DEFERRED.

### T4.2 — Batch results table + export  [DONE 2026-06-12]
- Sortable results table; row → detail; CSV export of results.
- **Accept:** export downloads; row detail matches single-label output.
- Carry-overs from the T4.1 review (address here): (a) MINOR — `BatchForm` keys the
  upload map by `File.name`, so two different files with the same basename collide;
  surface a gentle "two images share the name X" notice. (b) MINOR — `csv.ts`
  duplicate header columns are first-wins silently; warn or document. (c) MINOR —
  batch concurrency is a fixed 3 with no cancel; consider a Cancel control / tunable
  pool for 200-300-row imports. None is a correctness bug (per-row core is sound).
- Done 2026-06-12 (evening): `src/lib/batch/export.ts` (`outcomesToCsv` +
  `RESULTS_CSV_HEADER`) and `src/lib/batch/sort.ts` (`sortOutcomes`, stable +
  non-mutating) — both pure/unit-tested (13 new tests). `BatchForm` gained
  sortable column headers (real `<button>`s in `<th>` with `aria-sort` + a
  visible ▲/▼), a per-row "Show details" expander that renders the SAME exported
  `ResultCard` as the single-label screen (so the detail matches single-label
  output exactly, no duplicated logic), and a "Download results (CSV)" button
  (client-side Blob, object URL revoked — nothing persisted). RFC-4180 escaping,
  CRLF, header always emitted. Carry-over (a) addressed: duplicate uploaded-image
  basenames now raise a gentle `role="status"` notice. tsc/lint/`next build`
  clean; 273/273 tests. Auditor: no BLOCKER/MAJOR (3 MINOR + NITs — one fixed
  in-run, rest below). Compliance: PASS (one PARTIAL doc sub-point).

---

## M5 — Polish, docs, deploy (Sun 6/14)

### T5.1 — README + approach/assumptions doc  [DONE 2026-06-12]
- Setup/run steps; architecture; **firewall constraint + swappable/local-OCR seam**;
  **stateless/no-PII** posture; two-tier inference rationale; trade-offs, limits,
  assumptions, out-of-scope.
- **Accept:** a new reader can set up and run from the README alone.
- Done: rewrote root `README.md` (was the M0 stub) into a full setup/run + architecture
  + posture doc, and added `docs/APPROACH.md` (approach/tools/assumptions/trade-offs/
  limits/out-of-scope). Covers the firewall + swappable/local-OCR seam, stateless/no-PII,
  two-tier inference rationale, Match/Review/Mismatch human-in-the-loop framing, latency
  + bad-photo handling, the bold/font OCR-limitation honesty note, and the conditional-
  ABV-by-beverage-type rationale (CONTEXT §5) incl. the beer-ABV edge limitation (D4).
  Env table + `.env.example` extended with the optional `GEMINI_MODEL`/`GEMINI_TIMEOUT_MS`/
  `GEMINI_THINKING_LEVEL` overrides. Docs-only slice (no `src/` change). Auditor: no
  BLOCKER; 1 MAJOR (stale 226 test count) + 1 MINOR + 1 NIT all fixed in-run. Compliance:
  PASS on all 8 criteria. Folds D4 (and partially D1–D3) doc items into the README.

### T5.2 — Latency tuning  [DONE 2026-06-11]
- Verify common-path single label < 5s on deploy; trim prompt/output if needed.
- **Accept:** measured < 5s common path on the deployed URL; documented.
- Done: root-caused the live latency on the deployed URL and fixed it in layers,
  all measured on the production URL with a downscaled 1568px label:
  (1) `gemini-2.0-flash` was retired 2026-06-01 → 404; moved to a current model.
  (2) Disabled Gemini 3.x "thinking" (`thinkingLevel='low'`) — default "medium"
      reasoning was the dominant cost (~7.6s → 6.6s).
  (3) Dropped the unused `rawText` full-transcription from the model output (fewer
      output tokens) (6.6s → ~4.5s real photo).
  (4) Benchmarked `gemini-3.5-flash` (~2.9s avg) vs `gemini-3.1-flash-lite` (~1.4s
      avg) over 3 runs each on the live URL — identical field + Government-Warning
      accuracy on a clear label. **Locked `gemini-3.1-flash-lite`** as the primary
      fast tier (env-overridable via `GEMINI_MODEL`); Sonnet remains the
      confidence-triggered deep tier for blurry/low-confidence images (spec allows
      the escalated path 5–7s). Common-path server latency now ~1.4s, well under
      the 5s SLA with headroom for cold starts. Diagnostic per-request model
      benchmark hook removed before locking. Remaining latency TODO: confirm
      flash-lite reports honest low confidence on a genuinely blurry image so
      escalation fires (follow-up validation).

### T5.3 — Deploy to Vercel  [TODO]  *(human checkpoint)*
- Configure env vars in Vercel; deploy; smoke test from a clean browser.
- **Accept:** public URL live; sample verification works end-to-end

---

### T5.4 — Follow-up cleanup & process refinement  [TODO]  *(epic — pick ONE sub-item per run)*

Gathers the open carry-over items below into one ordered, slip-pickable epic so a
single unattended run still takes exactly one vertical slice. Order = priority.
Do these AFTER the critical path (T5.1 doc) and M4 batch, EXCEPT a Priority-A item,
which is a release-blocker and jumps the queue before deploy (T5.3). Each sub-item
has its own acceptance bar; mark sub-items DONE individually in PROGRESS.md.

**Priority A — release-blockers (before T5.3 deploy):**
- A1 — Bump `next` off `14.2.5` to the patched version (security advisory).
  *Accept:* the advisory clears; `tsc`/lint/`next build` + full suite green.
  **DONE 2026-06-12 (evening).** Bumped `next` + `eslint-config-next` 14.2.5 -> **14.2.35**
  (latest patch in the stable 14.2.x line; no source change). Clears CVE-2025-29927
  (middleware auth-bypass; fixed upstream 14.2.25). Full gate green on 14.2.35: 273/273
  vitest, `tsc --noEmit` clean, `next lint` 0 warnings, `next build` clean. Residual
  `npm audit` advisories (4 next + 1 transitive postcss) only fix at `next@16` (breaking
  major) and are non-applicable to this app's surface (no middleware / no next/image / no
  i18n / no websockets; App Router + single `/api/verify` route) -> documented in
  docs/APPROACH.md §10 and deferred to a human-reviewed next@16 upgrade (NOT an unattended
  slice). Auditor APPROVE (no BLOCKER/MAJOR); compliance RELEASABLE (PASS, unblocks T5.3).
- A2 — Map a lazily-resolved `MissingConfigError` (missing key) to a friendly
  `ExtractionError` at the `/api/verify` route boundary so the UI never sees a config
  stack trace. *Accept:* missing-key path returns the friendly 503 JSON; test added.
  **DONE 2026-06-12 (evening run).** Extracted the route's error->HTTP mapping into a pure,
  unit-tested `mapVerifyError` (`src/app/api/verify/errorMap.ts`); `route.ts` is now a
  thin adapter that delegates mapping + logs the secret-free `log` line. A lazily-resolved
  `MissingConfigError` (missing GEMINI/ANTHROPIC key) maps to a friendly **503** JSON
  ("not configured — contact support"), NOT a 502 ExtractionError (a server misconfig is
  not a bad photo); the key NAME never reaches the client body or the server log. 11 new
  tests (284/284 total green; tsc/lint/`next build` clean). Auditor CLEAN (no BLOCKER/MAJOR;
  2 NITs); compliance RELEASABLE (all PASS). Unblocks T5.3 deploy.

**Priority B — correctness/UX from real-label testing (Steve requests 6/11):**
- B1 — Numeric ABV input + bare-number expected-parser tolerance (assume `%` for a
  bare ABV). *Accept:* expected `13` compares to label `13% Alc./Vol.`; tests.
- B2 — Net-contents NUMBER field + UNIT dropdown (default **mL**; mL/cL/L/fl oz; opt
  pt/qt/gal) so the engine never guesses a bare number's unit; OPTIONAL non-silent
  smart-suggest (overrideable, defaults mL when ambiguous — never auto-flip).
  *Accept:* bare `750` + selected unit compares cleanly; suggestion is overrideable;
  a11y preserved. Ship WITH B1 so UI + parser stay consistent.
- B3 — flash-lite confidence-threshold tuning: validate on real hard photos; consider
  raising `EXTRACTION_CONFIDENCE_THRESHOLD` (env, default 0.7) so heavy-blur escalates
  to Sonnet. *Accept:* a heavy-blur sample escalates (or a documented reason it doesn't).

**Priority C — robustness / test hardening:**
- C1 — Extend the abort deadline to cover the response-body read (`response.json()`),
  not just `fetch`, in BOTH `gemini.ts` and `sonnet.ts` (keep the tiers symmetric).
  *Accept:* a slow-body test is bounded by `timeoutMs`.
- C2 — Pin exact-boundary regression tests landing on `ratio === 0.80` / `=== 0.95`
  to lock the `>=` threshold semantics (textMatch). *Accept:* both boundaries tested.
- C3 — Direct `compareClassType` missing/null test for parity with `compareBrand`.
- C4 — `parseNetContents('750ML')` (unit-glued, upper-cased) regression test.
- C5 — Param-table test over ALL `ExtractionError` codes in `mapVerifyError`
  (`network|http|empty|input|timeout|unknown`): only `input` -> the image message, the
  other five -> the retry message. Locks the 502 contract (auditor NIT, T5.4/A2 run; only
  `input`+`http` currently exercised). *Accept:* all six codes asserted.

**Priority D — decisions + doc-only (rationale folds into T5.1 README):**
- D1 — Brand/class case-only difference (`kendall-jackson` vs `KENDALL-JACKSON`):
  stakeholder decision whether a pure case difference should be clean `match` instead
  of the current `review`. *Accept:* decision recorded + behavior matches it.
- D2 — Add a clarifying comment on the ABV proof-only spirits path (proof≈2×ABV
  cross-check can't disagree with a self-derived value).
- D3 — Confirm/surface intent of `finerThanTenthPrecision` (computed for all types,
  consumed only for beer per the 0.1% spec scope).
- D4 — README limitation: beer ABV becomes *required* with added-flavor/nonbeverage
  alcohol or where state law requires it; the engine treats beer ABV as
  unconditionally optional (no ingredient/state input). Document honestly (→ T5.1).
- D5 — Tidy or document the NITs: net-contents `gal` factor precision; client preflight
  MIME list vs Sonnet's; empty-`type` image → "type not supported" preflight branch.

**Process refinement (apply once; not per-run slices):**
- P1 — Treat freshly-cloned `main` as the ONLY authority for `planning/*`. The
  connected-folder copies lagged this week and the folder copy of `AGENTS.md` is
  truncated at §7 — confusing under load. Fix: either (a) have Steve periodically sync
  the connected folder from `main`, or (b) drop the folder `planning/*` from the
  per-run read list and read them from the clone. Update AGENTS.md §3 + the run prompt.
- P2 — `/tmp` disk hygiene: clone to a UNIQUE dir each run (leftover `node_modules`
  owned by `nobody` can't be removed; `/tmp` ran ~88–93% full). Add a free-space check
  and the documented ENOSPC fallback (minimal vitest+typescript scratch toolchain).
- P3 — Slice-selection order once the critical path is complete, stated explicitly:
  Priority-A release-blockers → M4 batch → T5.4 cleanup epic → remaining polish. Avoids
  ambiguity about "the next TODO."
- P4 — Keep token handling inline-URL-only and scrub the scratch token file at run end
  (done this run); never persist it in `.git/config` or any file.

## Carry-over from review (from AUDIT.md / COMPLIANCE.md — address in owning milestone)

*These are now consolidated and prioritized under **T5.4** above; the list below is
the source detail. Resolve via T5.4 sub-items (one per run).*
- [M3/T3.x Net-contents unit dropdown — Steve request 2026-06-11] Replace the free-text
  net-contents entry with a NUMBER field + a UNIT dropdown of common alcohol container
  units (default **mL**; offer mL, cL, L, fl oz; optionally pt/qt/gal). The chosen unit
  is sent explicitly so the engine never has to guess a bare number's unit (closes the
  `750`→"no recognizable unit" gap). Pairs with the numeric-input item above.
  - OPTIONAL smart-suggest (advisable scheme): pre-select the dropdown from the typed
    magnitude, but as a NON-silent suggestion the user can override (assist-not-adjudicate
    + the 73-yo accessibility bar — never silently change their input). Suggested heuristic
    keyed to real container sizes: decimal value <~5 → **L** (e.g. 1.5 → 1.5 L magnum,
    1.75 → handle); whole values ~12/16/22/24/40 → **fl oz** (40 → 40 oz, 12 → 12 oz beer);
    ~50–1500 → **mL** (750 → 750 mL). Show the guess + a one-line "we assumed L — change?"
    affordance; default to mL when ambiguous. Keep it a suggestion, not an auto-flip, so a
    mistyped magnitude can't silently mislabel a fill size on a compliance tool.
- [M1 threshold tuning] flash-lite blurry-image probe (2026-06-11) escalated correctly
  on blur+low-contrast, but a heavy-blur case returned `fail` WITHOUT escalating
  (possible confidently-wrong). Consider raising `EXTRACTION_CONFIDENCE_THRESHOLD`
  (env, default 0.7) so borderline-legible images escalate to Sonnet more eagerly.
  Validate against real hard photos before changing — safe direction as-is.
- [M3/T3.x UI input types — Steve request 2026-06-11] Constrain the form inputs:
  Alcohol content + Net contents should accept NUMERIC entry, Brand/Class-type TEXT.
  NOTE/DEPENDENCY: numeric-only ABV/net-contents means users submit bare numbers
  (`13`, `750`), which the expected-side parsers currently treat as "no value"/"no
  unit" → must ship WITH the expected-value parsing tolerance above (assume `%` for a
  bare ABV; pair a bare net-contents number with a unit selector or default mL).
  Implement the UI constraint and the parser tolerance together so they stay consistent.
- [M2 engine-tuning / observed on a real Kendall-Jackson label 2026-06-11] The
  EXPECTED-side parsers are stricter than real agent input: a bare ABV like `13`
  is treated as "no expected value" (parser wants `13%`/`13% Alc./Vol.`), and a
  bare net contents like `750` (no unit) can't compare to `750ML` → Needs review.
  The 73-year-old-benchmark user will type `13` and `750`. Make expected-value
  parsing tolerant of bare numbers (assume `%` for ABV; for net contents either
  infer no-unit==found-unit or prompt for a unit). Extraction itself is correct.
- [M2 engine-tuning] Net-contents parse of a unit-glued, upper-cased value
  (`750ML`, no space) should resolve cleanly to mL; confirm `parseNetContents`
  handles `750ML` (the message implied "no recognizable unit"). Add a regression.
- [M2/UX decision] Brand/class case-only differences (`kendall-jackson` vs
  `KENDALL-JACKSON`) currently resolve to **review** ("matches except formatting")
  by the T2.1 design decision. Confirm with stakeholder whether a pure case
  difference should instead be a clean **match** (the STONE'S THROW rule was about
  punctuation/possessives + judgment; case-only may warrant match). Currently
  conservative-by-design, not a bug.
- [M2/T2.x or M5 docs] Auditor MINOR: ABV proof-only spirits path skips the explicit
  proof≈2×ABV cross-check (derivation can't disagree with itself) — add a clarifying
  comment / decide if expected-side proof should be cross-checked.
- [M2 or M5 docs] Auditor MINOR: `finerThanTenthPrecision` is computed for all types
  but only consumed for beer (spec scopes 0.1% rule to beer) — confirm intent or
  surface for wine/spirits.
- [M5 README/limitations] Compliance DEFERRED: beer ABV becomes *required* when the
  beer has alcohol from added flavors/nonbeverage ingredients or where state law
  requires it; T2.2 treats beer ABV as unconditionally optional (form has no
  ingredient/state input). Note as a documented limitation.
- [M2] Pin an exact-boundary regression test landing on `ratio === 0.80` / `=== 0.95`
  to lock the `>=` threshold semantics (T2.1 AUDIT NIT). Bands covered mid-range.
- [M2] Add a direct `compareClassType` missing/null test for parity with
  `compareBrand` (T2.1 AUDIT NIT; shared `compareTextField` makes it low-risk).
- [M1/T1.3] Extend the abort deadline to cover the response-body read
  (`response.json()`), not just `fetch`, in BOTH `gemini.ts` and `sonnet.ts` — clear
  the timeout only after the body resolves (or wrap the whole call in one deadline). A
  hung/slow body read is currently unbounded by `timeoutMs`; nearest-the-SLA on the 7s
  deep tier. (AUDIT MINOR, T1.2 run — a Flash-tier carry-over; fix both together so the
  tiers stay symmetric.)
- [M1/T1.3] Map a lazily-resolved `MissingConfigError` (missing key) to a friendly
  `ExtractionError` at the route boundary so the UI never sees a config stack trace.
  (Carried from the T1.1 run.)
- [M5] `next@14.2.5` security advisory — **RESOLVED 2026-06-12 (evening)** via T5.4/A1:
  pinned `next@14.2.35` (clears CVE-2025-29927). Residual next@16-only advisories
  documented as non-applicable known-limitation (docs/APPROACH.md §10).
- [M2/T2.5] **RESOLVED 2026-06-12 (evening).** Threaded `beverageType` into the
  net-contents verdict: a BEER label stated in U.S. fl oz vs an expected metric value
  now resolves to `match` (either system acceptable for malt beverages); spirits/wine
  (and unknown/omitted type) keep the conservative `review` (metric required). Mirrors
  `abv.ts`; wired via `aggregate.ts` (`expected.beverageType`). +7 tests (38 net-
  contents / 233 total green). Closed the T2.3 AUDIT MAJOR M2. (auditor APPROVE,
  compliance PASS this run.)
- [M3/T3.2 NIT] The client preflight MIME list (drift-guarded against the GEMINI
  `SUPPORTED_MIME_TYPES`) differs from `SONNET_SUPPORTED_MIME_TYPES` (Sonnet adds
  `image/gif`, omits `heic`/`heif`). Harmless today (Gemini is the documented
  primary/authority and the form mirrors it); revisit only if provider routing ever
  becomes user-selectable. (T3.2 AUDIT NIT.)
- [M3/T3.2 NIT] An image with an empty `type` (browser couldn't infer a MIME) falls
  into the "type not supported" preflight branch rather than a presence message;
  acceptable UX, flagged for completeness. (T3.2 AUDIT NIT.)
- [M4/T4.2 or M5 docs] Auditor MINOR (T4.2): the results-CSV export does not guard
  against spreadsheet formula injection (a model-extracted cell beginning `=`/`+`/`-`/`@`
  could execute on open in Excel/Sheets). Acceptable under the self-to-self threat model
  (the agent opens their own results), but add a leading-character guard in `csvCell`
  (prefix with `'`) or document the limitation if the CSV is ever shared/auto-consumed.
- [M4/T4.2 NIT] Auditor MINOR (T4.2): `sort.ts` `compareValues` infers numeric-vs-string
  from runtime `typeof`; correct for today's keys but key the compare strategy explicitly
  if a future `SortKey` returns a mixed type.
- [M3/M5 docs] Compliance PARTIAL (T4.2): WCAG 2.5.5/2.5.8 large-target sizing for the new
  sort + show/hide buttons not explicitly measured this slice (likely inherited). Verify or
  note in README limitations. Also: document that the results CSV is generated/downloaded
  entirely client-side (never persisted/logged) and that one-row-expands-at-a-time +
  pass<review<fail<error sort severity are intentional product decisions.
- [M2 NIT] Net-contents `gal` factor is 3785.41 vs 3785.411784 (~5e-7 relative,
  harmless under the 1% tolerance); tighten only if tolerance is ever reduced.
