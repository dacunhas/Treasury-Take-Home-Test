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

## Carry-over from review (from AUDIT.md / COMPLIANCE.md — address in owning milestone)
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
- [M5] `next@14.2.5` has a security advisory — bump before deploy. (Carried from T1.1.)
- [M2/T2.5] Thread `beverageType` into the net-contents verdict so an equal quantity
  in U.S. fl oz on a BEER label resolves to `match` (currently `review`); spirits/wine
  stated in fl oz stays a flag. Conservative `review` ships now; the full conditional
  belongs with the aggregate verdict (mirror `abv.ts`). (T2.3 AUDIT MAJOR M2;
  compliance ruled the conservative default a PASS, not a FAIL.)
- [M3/T3.2 NIT] The client preflight MIME list (drift-guarded against the GEMINI
  `SUPPORTED_MIME_TYPES`) differs from `SONNET_SUPPORTED_MIME_TYPES` (Sonnet adds
  `image/gif`, omits `heic`/`heif`). Harmless today (Gemini is the documented
  primary/authority and the form mirrors it); revisit only if provider routing ever
  becomes user-selectable. (T3.2 AUDIT NIT.)
- [M3/T3.2 NIT] An image with an empty `type` (browser couldn't infer a MIME) falls
  into the "type not supported" preflight branch rather than a presence message;
  acceptable UX, flagged for completeness. (T3.2 AUDIT NIT.)
- [M2 NIT] Net-contents `gal` factor is 3785.41 vs 3785.411784 (~5e-7 relative,
  harmless under the 1% tolerance); tighten only if tolerance is ever reduced.
