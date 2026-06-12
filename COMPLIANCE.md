# COMPLIANCE.md — Compliance Reviewer Findings

Appended per run. Each criterion: PASS / PARTIAL / FAIL + evidence + gap. Items that
belong to a later milestone are DEFERRED (not FAIL). Read-only output.

---

## 2026-06-12 — M3/T3.4 sample test labels

**Overall: PASS** on all 6 criteria. Satisfies PROJECT_PLAN §6 (sample labels incl. a
deliberately non-compliant warning + an angled/glare photo) and the T3.4 acceptance
("committed to samples/; referenced in README demo steps").

1. **Non-compliant warning + angled/glare both present — PASS.**
   `02-...-bad-warning.png` (title-case prefix + reworded clauses → mismatch/fail) and
   `05-...-angled-glare.png` (perspective tilt + glare blob + blur).
2. **Conditional ABV by beverage type represented as compliant-not-failed — PASS.**
   Beer `03` (no ABV statement, expected ABV blank → `match`, optional); wine `04`
   ("Table Wine" in lieu of numeric ABV); spirits `01`/`05` carry real `45% Alc./Vol.
   (90 Proof)`.
3. **Tolerant STONE'S THROW (Dave) → review not fail — PASS.** Label renders all-caps
   `STONE'S THROW`; EXPECTED.csv brand `Stone's Throw`, overall `review`. Matches
   `compareBrand` behavior.
4. **Canonical warning verbatim + bad one genuinely wrong — PASS.** Generator's
   warning string byte-identical to `src/lib/governmentWarning.ts`; #2 wrong on both
   axes (caps prefix + wording).
5. **Committed to samples/ + referenced in README demo steps — PASS.** 5 PNGs + CSV +
   generator + `samples/README.md` under `samples/`; top-level README "Try it with the
   sample labels" section links them.
6. **EXPECTED.csv verdicts consistent with documented engine behavior — PASS.** Per-
   label rollups re-verified against the pure comparison engine; no mis-resolving claim.

### Open items to close before submission (non-blocking)
- Label 4's ABV ROW (not the overall verdict) depends on whether the extractor routes
  "Table Wine" into the `abv` field vs only `classType`; noted in `samples/README.md`.
  Overall verdict is review regardless (brand drives it).
- Label 5's pass is model-dependent (a real vision read of a degraded photo) — framed
  as a manual/E2E demo expectation in the CSV + README, not a deterministic guarantee.


## 2026-06-12 — M3/T3.3 Accessibility pass

**Overall: PASS.** All six T3.3 acceptance criteria and the §8 "UX & error handling"
a11y lines are met and AUTOMATICALLY verified (jsx-a11y lint + axe + contrast,
226/226 green). The sole unprovable clause (keyboard-only run *completes* a
verification) depends on the deferred T3.4 browser E2E and is correctly out of scope.

1. **Labels tied to inputs — PASS.** Every control has `<label htmlFor>`→`id`
   (brand, classType, beverageType, abv, netContents, image); group in
   `<fieldset>`/`<legend>`; help text via `aria-describedby`. axe (accessible-name
   rules) passes.
2. **Keyboard flow + visible focus states — PASS.** `:focus-visible` 3px ring +
   `@supports not` fallback; skip link (first focusable) → focusable `<main>`; focus
   moved to result on success / `role="alert"` on submit error / offending field on a
   fixable validation error. Native controls → logical tab order, no traps.
3. **AA contrast verified automatically — PASS.** `contrast.test.ts` enumerates every
   rendered pair (`colors.ts` + `format.ts` maps) and asserts ≥4.5/≥3.0 with real
   WCAG 2.1 math; this is the deliberate compensating control for axe's color-contrast
   rule being unrunnable under jsdom.
4. **Status by icon+text, not colour alone — PASS.** Banner, every field cell, and the
   warning header render a text glyph (✔/⚠/✖/—, `aria-hidden`) + a plain-language word;
   the diff legend also distinguishes by line-through/underline + a text key.
5. **Automated a11y check exists + clean — PASS.** Three CI-runnable layers: axe-core
   over the form + a representative results view (0 violations), `jsx-a11y/recommended`
   lint (clean), contrast test. All green.
6. **Plain language + large targets — PASS.** "Looks good"/"Please check"/"Doesn't
   match" + friendly errors; 1rem+ fonts, full-width padded inputs, 1.05rem bold submit
   with `minWidth:180` — comfortable for the over-50 / 73-year-old benchmark.

**§8 UX/a11y lines:** "keyboard + screen-reader sane" PASS; "AA contrast" PASS;
"status never color-only" PASS.

### Honest gaps (DEFERRED, not FAIL)
- Keyboard-only END-TO-END completion of a real verification needs a live browser →
  T3.4 sample-label E2E (still TODO). Everything provable without a browser is covered.
- (Resolved this run) `eslint-plugin-jsx-a11y` was transitive-only — now pinned as an
  explicit devDep so the a11y lint rules can't silently disappear.

### Open items to close before submission
- [ ] T3.4 sample labels + a keyboard-only walkthrough in the README demo steps.

## 2026-06-11 (evening) — M3/T3.1 single-label UI

**Overall: PASS.** Maps to CONTEXT §1/§2/§5 and PROJECT_PLAN §4/§8. No spec
contradiction. The only open item (live-browser E2E against a real sample label) is a
human/T3.4 step and is DEFERRED, not a failure.

1. **All five inputs + image picker — PASS.** Brand, class/type, beverage-type
   `<select>` (Spirits/Wine/Beer), alcohol content, net contents, label-image file
   input. Field `name`s exactly match `parseVerifyForm` reads.
2. **Results card — PASS.** Overall banner (glyph + plain word + summary + latency);
   per-field table (Field / Expected / Found / Status with semantic `<th scope>`);
   Government Warning section with the word-level diff + plain-language legend. Diff
   segment shape matches `WarningDiffSegment`.
3. **Latency + escalation surfaced — PASS.** `formatVerifiedLine` shows "Verified in
   N.Ns" and "(a closer check was run)" on escalation; in-flight "running a closer
   check…" copy present; bad/negative/NaN latency floored to 0.0.
4. **"73-year-old benchmark" accessibility (basic) — PASS.** Labels tied to inputs;
   status conveyed by word + glyph (never color alone); large targets/fonts; plain
   wording ("Looks good" / "Please check" / "Doesn't match"); aria-live results,
   role=alert errors, aria-busy submit. Deeper sweep = T3.3 (DEFERRED).
5. **Agent-assist framing — PASS.** "flags discrepancies for a human reviewer; does
   not make compliance decisions" (page.tsx).
6. **Stateless / no-PII — PASS.** No localStorage/sessionStorage/cookies; React-only
   state cleared per submit; image sent in-request only.
7. **ABV optional-by-beverage-type — PASS.** No `required` on any input (`noValidate`);
   ABV labeled "(optional for beer and table wine)"; handler omits abv from required
   set — matches CONTEXT §5 (the most error-prone rule, handled correctly).
8. **End-to-end browser run vs a real sample label — DEFERRED.** Not exercisable in an
   unattended sandbox (no live model/keys); validating a real sample label is the T3.4
   step. Wiring verified consistent component <-> route <-> handler <-> types.

**Open items to close before submission:** none new. ("dropzone" shipped as a file
picker — cosmetic; deeper error UX T3.2, full a11y T3.3, sample labels T3.4, README
T5.1 all remain on the backlog.)

---

## 2026-06-10 — M2/T2.4 Government Warning strict check

**Overall: PASS.** Maps cleanly to CONTEXT §5 and PROJECT_PLAN §3; satisfies the §8
lines "text matches canonical exactly; diff shown on mismatch" and "Caps-prefix and
reworded-warning cases correctly rejected." Honest about the OCR formatting limitation.

1. **Present/missing -> fail (mandatory >= 0.5% ABV) — PASS.** Empty/blank -> `missing`,
   `present:false`, detail cites the rule. Tested for `null,'','   ','\n\t'`.
2. **Title-case "Government Warning:" prefix correctly fails — PASS.** Anchored caps
   detection routes title-case prefix to `mismatch`, detail "all capital letters."
3. **Word-for-word vs canonical (whitespace-normalized) + readable diff — PASS.**
   Canonical constant verified char-for-char vs §5; exact `===` after normalization;
   reworded text yields a coalesced LCS word diff (removed/added/equal).
4. **Honest bold/caps limitation surfaced — PASS.** `FONT_NOTE` on every non-missing
   result states caps+wording are checked but true bold/font-size are not detectable.
5. **Human-in-the-loop framing; body-casing -> review — PASS (deliberate interpretation).**
   All words present + prefix capitalized + only body letter-casing differs -> `review`,
   not hard fail. Recorded as an intentional, honest call (a strict-literalist could read
   body casing as part of "word-for-word"); kept as `review`.
6. **Acceptance matrix coverage — PASS.** exact (pass), title-case prefix (fail),
   reworded (fail+diff), missing (fail), shrunk-but-correct (pass on text + formatting
   note) all present, plus extra-trailing-text and leading-text edge cases.

**Open items to close before submission:** none new from this slice. (Prior M1 firewall-
seam interface item already closed by the `LabelExtractor` interface in T1.1.)

## 2026-06-10 — M2 / T2.2 ABV conditional slice

**Overall: PASS.** All five criteria PASS vs CONTEXT §5 / PROJECT_PLAN §3 & §8.

1. **Spirits ABV required; absence flagged — PASS.** `compareAbv` spirits branch with
   no ABV → `mismatch` (aggregates to fail, not a silent pass).
2. **Wine "Table Wine"/"Light Wine" substitute not failed — PASS.** Returns `match`
   with a plain-language note; never `missing`/`mismatch` for the designated case.
3. **Beer ABV optional + format rules — PASS.** Absent → `match`; expected-but-omitted
   → `review` ("not a failure"); disallowed "ABV" abbrev (`/\babv\b/i`, leaves
   "Alc./Vol." alone) and >0.1% precision downgrade match→review.
4. **Numeric compare w/ tolerance + proof≈2×ABV cross-check — PASS.** Default 0.0
   exact, configurable; proof inconsistency → `review`.
5. **Human-readable, agent-assist framing (not adjudication) — PASS.** Full-sentence
   plain language; "Please confirm" on review paths; statuses for a human to act on.

**PROJECT_PLAN §8 line SATISFIED:** "beer-without-ABV and wine 'Table Wine' cases are
NOT failed; spirits-without-ABV IS flagged."

### DEFERRED (not FAIL — later milestone)
- CONTEXT §5 edge: beer ABV becomes *required* when the beer has alcohol from added
  flavors/nonbeverage ingredients, or where state law requires it. T2.2 treats beer
  ABV as unconditionally optional (the form has no ingredient/state input). Out of
  T2.2 scope; add a one-line README limitations note in M5. Logged to BACKLOG.

## 2026-06-09 — M0 scaffold slice

**Overall: PASS for M0 foundations.** Government Warning is verbatim and test-pinned;
the type model, secrets handling, and stateless posture are sound. One foundation
PARTIAL (firewall seam documented but not yet a TS interface — lands with M1).

### 1. Government Warning canonical constant (verbatim vs CONTEXT §5) — **PASS**
`src/lib/governmentWarning.ts` defines `GOVERNMENT_WARNING_CANONICAL`, compared
char-for-char against CONTEXT §5: caps prefix `GOVERNMENT WARNING:` present and
uppercase; clause (1) and clause (2) exact; punctuation, `(1)`/`(2)` markers, spacing,
and terminal period all match; stored as one continuous line. Independently re-pinned
by `governmentWarning.test.ts` plus caps/clauses/no-newline tests.

### 2. Type model supports the required behavior — **PASS**
- `FieldStatus` includes `review` (Match/Review/Mismatch human-in-the-loop) + `missing`
  for the "absent but permitted" conditional-ABV case.
- `BeverageType` (`spirits|wine|beer`) on `ExpectedLabel.beverageType` drives the §5
  conditional ABV rules; `FieldResult.detail` carries the rule note.
- `WarningCheckResult` has `present`, `prefixCaps`, `textMatch`, `diff` (+
  `WarningDiffSegment`), and a `detail` reserved for the honest bold/font limitation.
- `ExtractedLabel.confidence` present (drives Flash→Sonnet escalation per §4).
- `VerificationResult.latencyMs` + `escalated` present (5s SLA surfacing + deep tier).
- No persistence/DB/session types — stateless at the type level.
- Note: `ExtractedLabel.proof` exists but `ExpectedLabel` has no proof field; the
  `proof ≈ 2×ABV` reconciliation is a comparison-engine concern — DEFERRED (M2), not
  an M0 gap.

### 3. Firewall seam / swappable extractor — **PARTIAL**
Documented in README ("Posture → Firewall seam": swappable `LabelExtractor` + Tesseract
OCR fallback) and matches CONTEXT §4 ("the seam must exist and be documented"; full OCR
not required). **Gap:** no `LabelExtractor` TypeScript interface in code yet — the seam
is prose-only. Acceptable for M0; declaring the interface in M1 (T1.1) upgrades this to
PASS cheaply.

### 4. Stateless / no-PII posture stated — **PASS**
README states images and form data are processed in memory, nothing persisted.
Reinforced by the absence of persistence types and the UI copy ("flags discrepancies …
does not make compliance decisions," satisfying the §7 no-adjudicator guardrail).

### 5. Secrets: env-only, gitignored, .env.example committed — **PASS**
Keys read exclusively from `process.env` via `requireEnv`; `MissingConfigError` uses
the key name only, never the value (tested). `.gitignore` ignores `.env*` with an
`!.env.example` exception; `.env.example` committed with empty placeholders only.

### Deferred (correctly out of M0 scope — not penalized)
- Comparison engine (tolerant brand/class-type, conditional ABV, warning diff
  computation) — DEFERRED (M2). Foundations in place.
- Live extractor + Flash→Sonnet routing + `LabelExtractor` interface — DEFERRED (M1);
  confidence signal + `getConfidenceThreshold` (0.7) pre-wired.
- Single + batch UI, results table, accessibility icon+text status — DEFERRED (M3/M4).
- `/api/verify` + measured latency — DEFERRED (M1/T1.3); `latencyMs` type ready.
- Vercel deploy / public URL — DEFERRED (M5).

### Open items to close before submission
- [ ] Declare `LabelExtractor` interface in code (closes §3 PARTIAL) — M1.

---

## 2026-06-09 — M1/T1.1 extractor slice

**Overall: PASS.** The `LabelExtractor` interface is now declared in code as the
swappable seam; `GeminiExtractor` makes a single low-temperature structured-output
vision call with the required strict JSON schema; malformed output degrades without
crashing; the extractor stays transcription-only. **This closes the prior §3 PARTIAL.**
33/33 mocked unit tests pass (no live inference call).

### 3. Firewall seam / swappable extractor — **PASS** (was PARTIAL)
`src/lib/extractor/types.ts` declares `interface LabelExtractor { name; extract(image:
LabelImage): Promise<ExtractedLabel> }`. The header documents it as the seam that lets
a local/offline OCR impl (Tesseract.js) replace the cloud tiers "without touching the
comparison engine or the API route" (CONTEXT §4). Seam is no longer prose-only.

### T1.1 acceptance — **PASS**
- Single `generateContent` call (test asserts `toHaveBeenCalledOnce`), `temperature: 0`,
  `responseMimeType: application/json`, `responseSchema` with exactly brand/classType/
  abv/proof/netContents/warningText/rawText/confidence.
- Malformed/partial/array JSON, empty candidates, and blocked responses all degrade to
  a confidence-0 `ExtractedLabel` (no crash) — three covered paths.
- Confidence signal present on every path (drives Flash→Sonnet escalation; threshold
  0.7 pre-wired). Router itself is correctly **DEFERRED (T1.2)**.
- Extractor avoids compliance judgement (prompt is transcription-only; verdict stays in
  the deterministic engine — CONTEXT §4 / §7 no-adjudicator).
- Stateless / no-PII: image is in-memory base64, nothing persisted; key sent in
  `x-goog-api-key` header (test confirms it is NOT in the URL); provider error bodies
  never surfaced (test confirms a leaked-key body does not reach the error message).

### Correctly DEFERRED (not penalized)
- `SonnetExtractor` + escalation router — T1.2. `/api/verify` + measured `latencyMs` —
  T1.3. `LocalOcrExtractor` Tesseract impl — documented seam only (CONTEXT §4).
  Comparison engine / warning diff — M2.

### Open items to close before submission
- (carried) Re-verify at the §8 submission audit that the README names the in-code
  `LabelExtractor` interface as the firewall seam.

---

## 2026-06-09 (evening run) — M1/T1.2 Sonnet deep tier + router

**Overall: PASS.** All seven applicable criteria PASS; the UI "closer check" state (M3)
and the `/api/verify` mapping of `escalated`/`latencyMs` (T1.3) are correctly DEFERRED,
not failed. No compliance FAIL on this slice.

### 1. Same `LabelExtractor` interface for the deep tier (escalation = routing) — **PASS**
`SonnetExtractor implements LabelExtractor` with the identical `name`/`extract(image):
Promise<ExtractedLabel>` contract as `GeminiExtractor`. `RoutingExtractor` also
`implements LabelExtractor` and holds `primary`/`deep` both typed as `LabelExtractor`,
so escalation is pure routing — a local-OCR tier could drop into either slot (CONTEXT
§4 firewall seam). Router tests drive both tiers through interface-only fakes.

### 2. Conditional escalation (confident → Flash only; low → deep) — **PASS**
`if (primaryConfidence >= threshold)` returns the primary result and never references
`this.deep`; only the `< threshold` branch awaits the deep tier. Verified: conf 0.92 →
`deep.calls === 0`; conf 0.4 → `deep.calls === 1`. Satisfies CONTEXT §4 / PLAN §8
("fires only on low confidence, not every label") and the 5s common-path SLA.

### 3. Escalation flagged for the UI + "closer check" supportable — **PASS** (mapping deferred)
`RoutedExtraction.escalated:boolean` is set on every return path; the route can map it
directly onto the already-declared `VerificationResult.escalated`. The 7s deep-tier
timeout makes the ~5-7s escalated window real, so the M3 "running a closer check…"
state is supportable. The `/api/verify` mapping is T1.3 and the visible UI state is M3
— DEFERRED, not a gap.

### 4. Threshold configurable (env default 0.7) + sane boundary — **PASS**
Router takes a `threshold` option, else resolves `getConfidenceThreshold()` lazily (env
`EXTRACTION_CONFIDENCE_THRESHOLD`, 0.7 default, clamped on NaN/out-of-range). Boundary is
`>=` (exactly-at-threshold = confident). Covered by the 0.7-no-escalation and
0.65-escalates(env-default) tests.

### 5. Confidence signal drives the decision (not guessed) — **PASS**
Decision uses `primaryLabel.confidence` directly; `primaryConfidence` is recorded for
auditability. Degrade paths emit a real 0-confidence label (rather than throwing), which
correctly funnels malformed Flash output into escalation.

### 6. Stateless / no-PII + no-adjudicator framing — **PASS**
`LabelImage` is in-memory base64, never persisted; no DB/session types. Both prompts are
transcription-only ("Do not make a compliance judgement"); the module header states "no
verdict logic lives here — the deterministic comparison engine owns every verdict."

### 7. Secrets: env-only, nothing persisted/echoed — **PASS**
`getAnthropicApiKey()` reads from env via `requireEnv`; key in `x-api-key` header (not
URL — test-pinned); provider error bodies never surfaced; `deepTierError` carries only a
code, no secret.

### Correctly DEFERRED (not FAIL)
- `/api/verify` mapping of `escalated` + measured `latencyMs` → T1.3.
- Visible "running a closer check…" UI state → M3.
- `LocalOcrExtractor` (Tesseract) firewall fallback → documented seam only.

---

## 2026-06-10 — M2/T2.1 comparison engine (brand/class-type tolerant matching)

**Overall: PASS.** T2.1 faithfully implements the brand/class-type requirements
(CONTEXT §3/§6, PROJECT_PLAN §3/§8). The Dave/STONE'S THROW human-in-the-loop
semantics are realized and test-proven; the verdict is pure and deterministic; the
Match/Review/Mismatch three-way distinction honors "never silent pass on formatting."
ABV (T2.2), net contents (T2.3), Government Warning diff (T2.4) and aggregate verdict
(T2.5) are correctly DEFERRED (not FAIL).

### 1. Tolerant normalization (case/punctuation/possessive/whitespace) — **PASS**
`normalizeText` applies NFKD + diacritic fold → lowercase → strip apostrophes/
possessive markers → punctuation→space → collapse/trim. Matches PLAN §3. Tests cover
possessive (incl. curly apostrophe), punctuation/hyphen, whitespace, full-width NFKC,
diacritics, idempotency.

### 2. STONE'S THROW → Match/Review, not Fail (test-proven) — **PASS**
Normalization-equal strings return `review` "matches except formatting." Proven by
`compareBrand("STONE'S THROW","Stone's Throw") → review`. Satisfies PLAN §8
("STONE'S THROW resolve to Match/Review, not false Fail") and CONTEXT §3.

### 3. Match/Review/Mismatch three-way + never-silent-pass — **PASS**
All four `FieldStatus` values produced; formatting-only (case/punctuation/possessive/
accent/whitespace) routes to **review**, not match; thresholds 0.95/0.80 per §3.
Plain-language details ("please confirm"/"please check"). Human-in-the-loop framing
intact (the tool flags; a human decides).

### 4. Deterministic / pure — no model opinion in the verdict — **PASS**
`normalize.ts`/`textMatch.ts` are I/O-free, no randomness/LLM — verdict derives solely
from extracted text via pure functions. Consistent with the "defensible correctness"
posture (CONTEXT §4).

### 5. Clearly-different → mismatch — **PASS**
Below 0.80 → mismatch; proven (OLD TOM DISTILLERY vs JACK DANIELS; reworded
class/type). Class/type parity via `compareClassType`.

### Correctly DEFERRED (not FAIL)
- ABV conditional-by-beverage-type (T2.2), net contents (T2.3), Government Warning
  strict+diff (T2.4), aggregate verdict (T2.5), `/api/verify` wiring (T1.3),
  single/batch UI (M3/M4).

### Open items to close before submission
- [ ] Optional: pin exact 0.80/0.95 similarity boundary in a regression test (NIT).

---

## 2026-06-10 — M2/T2.3 net-contents comparison

**Overall: PASS.** T2.3 implements the net-contents requirement (CONTEXT §5/§6,
PROJECT_PLAN §3/§8, BACKLOG T2.3 acceptance) faithfully: value+unit parsing, mL/L/fl-oz
normalization, numeric compare, and the Match/Review/Mismatch human-in-the-loop
distinction. Pure/deterministic/no-PII. ABV (T2.2 DONE), Government Warning diff (T2.4)
and aggregate verdict (T2.5) remain correctly DEFERRED, not FAIL.

### 1. Value + unit parsing — **PASS**
`parseNetContents` extracts value+unit, tolerant of "750 mL", "750ml", "1 L", "0,75 L"
(comma decimal), "12 fl. oz." (periods/spaces folded), and of surrounding text / lot
codes ("Lot 12345 / 750 mL" -> 750 mL, after the M1 audit fix). Bare number -> unit-less
parse, no crash.

### 2. mL/L/fl-oz normalization + numeric compare (BACKLOG T2.3 acceptance) — **PASS**
`UNITS` normalizes to canonical mL (mL/cL/L metric; fl oz/pt/qt/gal U.S., 1 US fl oz =
29.5735 mL); compare within a 1% relative tolerance. Conversions (1 L = 1000 mL, 0.75 L
= 750 mL, 75 cL = 750 mL) -> match; genuine fill differences (750 vs 700, 375 vs 750)
-> mismatch. "Unit conversions and mismatches" criterion met directly.

### 3. Match/Review/Mismatch — never a silent pass — **PASS**
Equal quantity in a different measurement system (750 mL vs 25.4 fl oz; 12 fl oz vs 355
mL) -> `review` with a "different measurement system… confirm" detail — surfaced, not
swallowed. Same-system equal-but-different-unit (1 L vs 1000 mL) -> clean match.
Unit-less label number -> review; unreadable/empty -> missing.

### 4. Metric-required (spirits/wine) vs fl-oz-allowed (beer) nuance (CONTEXT §5) — **PASS (as scoped)**
The module does not hard-fail a cross-system equal quantity; it routes to `review` so a
human judges acceptability for the beverage type — never wrongly failing a compliant
label. Binding `beverageType` so a beer fl-oz quantity becomes an outright `match` is
correctly DEFERRED to the aggregate verdict (T2.5), consistent with how T2.2 consumes
`beverageType`.

### 5. Sample label "750 mL" — **PASS**
`parseNetContents('750 mL')` -> {value:750, unit:'mL', system:'metric', ml:750};
`compareNetContents('750 mL','750 mL')` and `'750 mL' vs '750ml'` -> match (test-pinned).

### 6. Stateless / pure / no-PII — **PASS**
No I/O, no model calls, no globals, no persistence; deterministic. Error details are
plain-language and test-asserted free of stack traces.

### Correctly DEFERRED (not FAIL)
- Beverage-type-aware net-contents verdict (metric mandatory for spirits/wine) — T2.5.
- Government Warning strict + diff (T2.4); aggregate verdict (T2.5); `/api/verify`
  wiring (T1.3); single/batch UI (M3/M4).

### Open items to close before submission
- [ ] Thread `beverageType` into the net-contents verdict at T2.5 (BACKLOG carry-over).

---

## 2026-06-11 — M2/T2.5 Aggregate verdict slice

**Overall: PASS on all 5 criteria. Zero FAIL. One MINOR (already-tracked) for BACKLOG.**
This closes the M2 comparison engine (T2.1–T2.5).

### 1. Aggregate rule implemented exactly as specified — **PASS**
`aggregateOverall` returns `fail` if any field/warning severity is `fail`, else `review`
if any `review`, else `pass` — verbatim to T2.5 accept + PROJECT_PLAN §3. Tests cover all
three bands, fail>review precedence, and the empty-field-list case.

### 2. Government Warning treated strictly — **PASS**
`warningSeverity` maps warning `missing`/`mismatch` -> `fail` independently of the lenient
field mapping, so an absent or reworded mandatory warning rolls up to overall `fail` even
when every field matches (CONTEXT §5 highest-value check). Locked by two tests.

### 3. Conditional ABV by beverage type honored through `compareLabel` — **PASS**
`compareLabel` threads `expected.beverageType` into `compareAbv` unchanged and does not
post-process the returned status. `combineAbv` returns `null` when neither abv nor proof
present, preserving the conditional-omission path. Integration tests: spirits-no-ABV->fail,
beer-no-ABV not failed. (Table-wine allowance lives in compareAbv's own T2.2 coverage.)

### 4. Match vs Review vs Mismatch human-in-the-loop preserved — **PASS**
Ordinary `missing` -> `review` (flag for a human / better image), not a silent pass or an
auto-fail — the "assist tool, not adjudicator" posture (CONTEXT §1/§7). The asymmetry vs
the warning's strict `missing->fail` is deliberate and documented in the file header.

### 5. Pure / deterministic / stateless — **PASS**
Pure functions only; no I/O, persistence, or PII capture. Latency/escalation deferred to
the API route (T1.3), keeping the engine clean (CONTEXT §4, §8).

### BACKLOG note (MINOR, already tracked — not a blocker)
- Net-contents is not yet beverage-type aware (fl-oz-on-beer -> `review`, not `match`).
  Pre-existing T2.3 carry-over; T2.5 is its natural future home (beverageType in scope).
  Conservative `review` over-flags, never wrong-passes -> stays PASS.

---

## 2026-06-11 — M1 / T1.3 `/api/verify` route

**Overall: PASS** on all six in-scope criteria. UI surfacing, deploy/live-latency, and
batch are correctly DEFERRED (M3/M5), not FAIL.

### 1. Multipart accept + input validation — PASS
`route.ts` reads `request.formData()` (non-multipart → friendly 400). `parseVerifyForm`
reads the expected values + beverage-type selector + image, validates presence/type/
size, returns the `VerificationResult` shape at 200, and every bad-input path is a 4xx
with a message — never a stack trace (T1.3 acceptance met). Tests cover the matrix.

### 2. Conditional ABV at the route boundary — PASS
`abv` is excluded from required fields; a blank value passes through as `ExpectedLabel.abv
= ''` for all beverage types, delegating §5 to `compareAbv(..., beverageType)`. The route
cannot wrongly fail compliant beer/table-wine. Test: blank ABV + beer parses cleanly.

### 3. 5s SLA seam — PASS
`runVerification` measures `latencyMs` around extraction + comparison and returns it for
the UI's "Verified in N s". `escalated` is propagated straight from `RoutedExtraction`;
the route adds no escalation logic and calls `extractRouted` once — the deep (Sonnet)
tier fires only inside the router on low confidence, so the common path stays single-shot
Flash. No hard timeout/abort, which is consistent with the spec (escalated cases may run
~5–7s); surfacing measured latency is the required behavior here.

### 4. Stateless / no-PII — PASS
Image held in memory only (Buffer → base64), nothing persisted; no `fs`/DB anywhere.
`runtime='nodejs'`, `dynamic='force-dynamic'`. Matches CONTEXT §3.

### 5. Firewall seam preserved — PASS
Route depends only on the `RoutedExtractor` interface; the concrete
`RoutingExtractor(Gemini, Sonnet)` is built behind `getExtractor()`. Handler is generic
over the seam (tests inject a fake), so a local OCR tier could drop in without touching
`handler.ts`. No direct provider SDK calls.

### 6. Friendly error paths — PASS
`VerifyValidationError`→400; `MissingConfigError`→503 (no key name leaked);
`ExtractionError`→502 with input-vs-transient split (the unreadable-label branch mirrors
Jenny's "request a better image"); unknown→500. Matches PROJECT_PLAN §5.

### Correctly DEFERRED (not FAIL)
- UI surfacing of `latencyMs`/`escalated`/warning diff — M3.
- Deploy + live <5s latency measurement on the Vercel URL — M5.
- Batch mode (CSV + multi-image) — later slice, out of single-label scope.
- Hard 5s timeout/abort enforcement — not required by T1.3 (could be a hardening
  nice-to-have on the backlog).

### Open items to close before submission
- [ ] UI consumes `/api/verify` and surfaces latency + escalation (M3).
- [ ] Live latency check on the deployed URL (M5).

---

## 2026-06-11 (overnight) — M3 / T3.2 error handling

**Verdict: PASS — 9/9 criteria satisfied or correctly deferred. 203/203 green; no regressions.**

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Wrong image type → friendly msg | PASS | `validateForm.isAcceptedImageType` → "That image type is not supported…"; wired into preflight; tested. |
| 2 | Oversize image → friendly msg | PASS | `size > MAX_IMAGE_BYTES` → "…too large…under 10 MB"; limit single-sourced via `imageConstraints.ts`; inclusive-boundary test. |
| 3 | Empty form / missing image → friendly msg | PASS | `hasAnyExpected` guard + `image===null||size===0`; ordering tested. |
| 4 | Model/network failure → friendly (T3.1 intact) | PASS | `VerifyForm` try/catch unchanged: network catch + non-JSON gateway guard; full suite green. |
| 5 | Unreadable image → "request a better image" | PASS | Client still surfaces `data.error` (API `ExtractionError` body); help text also primes a sharper image. |
| 6 | Partial extraction → `missing` fields | PASS | Untouched; `format.ts` `missing` presentation + `aggregate` intact. |
| 7 | No crash / no stack trace | PASS | Preflight returns a string; all API errors friendly strings. |
| 8 | Accessibility — focus + announce | PASS (slice boundary) | New refs + `target.current?.focus()`; error container `role=alert`+`aria-live`; `aria-describedby` on image input. Full a11y sweep = T3.3 (deferred, not fail). |
| 9 | Statelessness / no-PII | PASS | New modules pure/I-O-free; no persistence introduced. |

**Correctly deferred (not failures):** T3.3 full a11y sweep, T3.4 sample-label browser E2E.
**Strengths:** single source of truth for size + MIME across client/server with a drift-guard test; preflight wording mirrors the server; defense-in-depth (server re-validates).


---

## 2026-06-11 (interactive) — M5 / T5.2 5s SLA

**Verdict: 5s SLA — PASS (measured on the deployed URL).**

- **~5s response ceiling (Sarah's hard requirement):** common-path server `latencyMs`
  now ~1.4s with `gemini-3.1-flash-lite` (benchmarked 3 runs on the live URL), vs ~2.9s
  for gemini-3.5-flash — both well under 5s. Two-tier design preserved: low-confidence/
  blurry → Sonnet deep tier (spec tolerates 5–7s on that escalated path). Earlier the
  path was failing outright (retired model 404, then >5s before tuning); now PASS.
- **Government Warning exact-match:** verified present + correct in the benchmark runs
  (status=match) on a clear label — the highest-value check survives the faster model.
- **Accessibility/"73-year-old":** observed that strict expected-value parsing (bare
  `13`, `750`) confuses real input → flagged for an engine-tuning slice (BACKLOG); this
  is a USABILITY gap, not a latency/SLA failure.
- **Open before submission:** blurry-image escalation validation; deploy smoke-test
  (T5.3); README/approach doc (T5.1).


---

## 2026-06-11 (interactive) — escalation path validated (flash-lite)

**Two-tier inference (Flash → conditional Sonnet → human): PASS (validated live).**
Degraded-image probe: a blur+low-contrast label escalated to the Sonnet deep tier
(`escalated=true`) while clear/moderately-blurred labels stayed on flash-lite — the
conditional escalation fires on low confidence as specified. All cases stayed ~2s
(escalated included), well inside the 5s SLA. Government Warning exact-match held across
all blur levels. Open tuning item (BACKLOG): a heavy-blur case returned `fail` without
escalating (possible confidently-wrong) — consider a slightly more eager confidence
threshold; safe direction, not a failure.

---

## 2026-06-12 (evening) — M2/T2.5 net-contents beverage-type conditional — PASS

Reviewed the slice threading `beverageType` into `compareNetContents` against
CONTEXT §5 (measurement-system rule) + PROJECT_PLAN §3/§8.

- Encodes CONTEXT §5: spirits & wine MUST state metric (mL/L); beer/malt MAY use U.S.
  fluid measures (fl oz). Cross-system equal quantity -> `match` for beer, `review`
  otherwise. **PASS**
- Never silently passes a spirits/wine label stated in U.S. units: those stay
  `review`, detail now names the rule ("Spirits and wine must state metric…"). **PASS**
- Unknown/omitted beverage type defaults to the conservative `review` (closed union
  has no 'unknown'; `=== 'beer'` guard fails safe). **PASS**
- Beer becomes a clean `match` (removes false-review noise) but allowance is
  SYSTEM-ONLY — a different fill still `mismatch`. **PASS**
- Assist-not-adjudicate / human-in-the-loop posture + plain-language detail preserved;
  stateless / no-PII unaffected (pure engine; `aggregate.ts` wires an already-collected
  form field). **PASS**

**RESOLVES the carried net-contents beverage-type item** (BUILD_BACKLOG "Carry-over",
T2.3 AUDIT MAJOR M2). Upgrades the prior conservative `review` default to the full
conditional with no regression in the assist-not-adjudicate guarantee. **Overall: PASS.**
