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

### T1.3 — `/api/verify` route (single)  [TODO]
- Accept multipart (expected values + beverage type + image). Validate input.
  Call extractor → comparison engine → return `VerificationResult` with `latencyMs`.
- **Accept:** happy path returns structured result; bad input returns 4xx + message,
  never a stack trace.

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

### T2.5 — Aggregate verdict  [DONE 2026-06-11]
- Combine field + warning results into overall `pass / review / fail`.
- **Accept:** any FAIL → fail; any REVIEW and no FAIL → review; else pass.

---

## M3 — Single-label UI + errors + accessibility (Fri 6/12)

### T3.1 — Single-label screen  [TODO]
- Form (brand, class/type, ABV, net contents, beverage-type selector) + image
  dropzone; results card (overall banner + per-field rows + warning diff);
  "Verified in N.Ns" latency display + "running a closer check…" on escalation.
- **Accept:** end-to-end verify works in the browser against a real sample label.

### T3.2 — Error handling  [TODO]
- Wrong type/oversize; empty form/image; model/network failure; unreadable image →
  "request a better image"; partial extraction → mark fields `missing`.
- **Accept:** each path shows a friendly message; no crash/stack trace.

### T3.3 — Accessibility pass  [TODO]
- Semantic HTML, labels tied to inputs, keyboard flow, focus states, AA contrast,
  status by icon+text (not color alone), large targets, plain language.
- **Accept:** keyboard-only run completes a verification; automated a11y check clean.

### T3.4 — Test labels  [TODO]
- Generate/source sample labels (CONTEXT §5 fields) incl. one non-compliant warning,
  one angled/glare photo, one beer (no ABV), one table wine.
- **Accept:** labels committed to `samples/`; referenced in README demo steps.

---

## M4 — Batch mode (Sat 6/13)  *(cut line if behind — see slip rule)*

### T4.1 — Batch input + processing  [TODO]
- CSV of expected values (+ beverage type) + multi-image upload; match by filename
  or column; process with progress; per-row error isolation.
- **Accept:** a multi-row CSV + images produces a results table; one bad row doesn't
  fail the batch.

### T4.2 — Batch results table + export  [TODO]
- Sortable results table; row → detail; CSV export of results.
- **Accept:** export downloads; row detail matches single-label output.

---

## M5 — Polish, docs, deploy (Sun 6/14)

### T5.1 — README + approach/assumptions doc  [TODO]
- Setup/run steps; architecture; **firewall constraint + swappable/local-OCR seam**;
  **stateless/no-PII** posture; two-tier inference rationale; trade-offs, limits,
  assumptions, out-of-scope.
- **Accept:** a new reader can set up and run from the README alone.

### T5.2 — Latency tuning  [TODO]
- Verify common-path single label < 5s on deploy; trim prompt/output if needed.
- **Accept:** measured < 5s common path on the deployed URL; documented.

### T5.3 — Deploy to Vercel  [TODO]  *(human checkpoint)*
- Configure env vars in Vercel; deploy; smoke test from a clean browser.
- **Accept:** public URL live; sample verification works end-to-end

---

## Carry-over from review (from AUDIT.md / COMPLIANCE.md — address in owning milestone)
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
- [M5] `next@14.2.5` has a security advisory — bump before deploy. (Carried from T1.1.)
- [M2/T2.5] Thread `beverageType` into the net-contents verdict so an equal quantity
  in U.S. fl oz on a BEER label resolves to `match` (currently `review`); spirits/wine
  stated in fl oz stays a flag. Conservative `review` ships now; the full conditional
  belongs with the aggregate verdict (mirror `abv.ts`). (T2.3 AUDIT MAJOR M2;
  compliance ruled the conservative default a PASS, not a FAIL.)
- [M2 NIT] Net-contents `gal` factor is 3785.41 vs 3785.411784 (~5e-7 relative,
  harmless under the 1% tolerance); tighten only if tolerance is ever reduced.
