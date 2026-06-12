# PROGRESS.md — Running Build Log

Newest entries on top. Builder appends; never rewrites history.

---

## 2026-06-12 (evening run ~6 PM ET) — M3 / T3.4 Sample test labels

**Slice built:** T3.4 — sample test labels. Strict-next TODO on freshly-cloned `main`
(HEAD was PR #19, M3 T3.1/T3.2/T3.3 all DONE; the connected-folder planning copies lag
several PRs, as the run contract warns — they still showed T3.1–T3.3 as TODO). No open
BLOCKER/MAJOR/compliance-FAIL on entry, so picked the strict-next TODO. One slice only.

**What was built (pure assets + docs — no `src/` change)**
- `samples/generate_samples.py` — deterministic, **Pillow-only** generator (a pure-
  Python 8×8 Gaussian-elimination solver replaces numpy for the perspective warp, so
  the script is truly dependency-light and reproducible). Renders the 5 labels +
  `EXPECTED.csv`. The canonical Government Warning string is kept byte-identical to
  `src/lib/governmentWarning.ts` (with a header note to re-sync if that constant moves).
- `samples/` PNGs (1000×1400, the bad-photo larger after warp):
  1. `01-old-tom-bourbon-compliant.png` — clean spirits, the CONTEXT §5 sample
     (Old Tom Distillery / Kentucky Straight Bourbon / 45% Alc./Vol. (90 Proof) /
     750 mL / canonical warning, bold caps prefix). Expect **pass**.
  2. `02-old-tom-bourbon-bad-warning.png` — title-case `Government Warning:` prefix +
     reworded/shortened clauses → strict warning **fail** + word diff.
  3. `03-cascade-summit-pale-ale-beer-no-abv.png` — beer, **no ABV** statement,
     12 FL OZ → ABV optional, not failed. Expect **pass**.
  4. `04-stones-throw-table-wine.png` — label brand ALL-CAPS `STONE'S THROW` vs
     expected `Stone's Throw` → tolerant-brand **review** (the Dave case); `Table
     Wine` in lieu of numeric ABV (7–14% class) → ABV not "missing". Expect **review**.
  5. `05-old-tom-bourbon-angled-glare.png` — #1 perspective-tilted + glare + slight
     blur on a dark desk (Jenny bad-photo). Same values as #1. Expect **pass** (read
     by the vision model; low-confidence reads escalate to the deep tier).
- `samples/EXPECTED.csv` — expected COLA values + target overall verdict per label
  (also a ready M4 batch fixture). `samples/README.md` — per-label table + a
  numbered "How to demo" walkthrough. Top-level `README.md` — new "Try it with the
  sample labels" section linking the folder, the CSV, and the per-label README.

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `next lint` clean;
`vitest run` **226/226** (unchanged — no testable code added; the extractor is not
involved); `next build` succeeds. Generator re-run **with numpy uninstalled** to prove
the Pillow-only claim; all 5 PNGs + CSV regenerate; the warp + glare render correctly
(spot-checked visually).

**Reviews:** code auditor — content sound; **canonical warning byte-identical** to the
source constant (programmatically compared); bad-warning genuinely non-compliant on
both axes; EXPECTED.csv verdicts cross-checked against the actual pure engine. The one
substantive flag was "samples/ not yet `git add`ed" — that is just this run's pending
commit (resolved by the push below), not a code defect. NIT: generator claimed
"Pillow only" but imported numpy → **FIXED in-run** (pure-Python solver; numpy removed;
docstring/README accurate). Compliance — **PASS** on all 6 criteria (non-compliant
warning + angled/glare present; conditional-ABV beer/table-wine not failed; STONE'S
THROW review; canonical verbatim; committed + README-referenced; CSV verdicts
consistent).

**Self-triage:** fixed the numpy NIT in-run (removed the dependency) and added a
one-line honesty note to `samples/README.md` re: label 4's ABV row depending on which
field the extractor routes "Table Wine" into (overall verdict unaffected — brand drives
the review). Label 5's pass is model-dependent by nature (a real photo read) and is
framed as a manual/E2E expectation in the CSV + README, not a deterministic guarantee.

**Open finding for Steve (carried, not this slice):** `next@14.2.5` security advisory —
still recommend a small standalone "bump Next" PR before submission.

**Next task:** M5 / T5.1 — README + approach/assumptions doc (the last critical-path
doc before deploy), OR M4 batch mode (the slip-line, see schedule status in the report).

**Blockers:** none.

**Status: READY FOR STEVE TO REVIEW + MERGE PR.**

---

## 2026-06-12 (overnight run ~1 AM ET) — M3 / T3.3 Accessibility pass

**Slice built:** T3.3 — accessibility pass. Strict-next TODO on freshly-cloned `main`
(which was several PRs ahead of the connected-folder copies — main HEAD was PR #18, with
T3.1 + T3.2 already DONE; the folder copies lagged, as the run contract warns). No open
BLOCKER/MAJOR/compliance-FAIL on entry, so picked the strict-next TODO. One slice only.

**What was built**
- `src/app/globals.css` (new) — the few a11y concerns that need real CSS (not inline
  styles): a single visible `:focus-visible` ring (3px, deep-blue, with a `@supports not`
  `:focus` fallback) so the keyboard focus indicator is consistent across the form fields
  AND the dark "Verify" button (browser default was easy to lose on the blue button); a
  `.sr-only` utility; a focus-revealed **skip link**; and a `prefers-reduced-motion` guard.
- `src/app/layout.tsx` / `page.tsx` — imports the stylesheet; renders the skip link as the
  first focusable element targeting a focusable `<main id="main-content" tabIndex={-1}>`
  landmark; bumped a borderline grey to an AA token.
- `src/components/VerifyForm.tsx` — **focus management** (move focus to the result
  `<section tabIndex={-1}>` on success, to the `role="alert"` region on a submit-time
  failure, and to the offending field on a fixable validation error); `aria-describedby`
  wiring (beverage-type rule + image help); palette tokens; `ResultCard` exported for the
  a11y test. Status was already conveyed by glyph + word (kept).
- `src/lib/ui/colors.ts` (new) — single-source UI palette (previously inline literals).
- `src/lib/ui/contrast.ts` (new) — **pure WCAG 2.1 contrast math** (relative luminance +
  ratio + AA thresholds), I/O-free, runs under the existing `node` vitest env.

**Automated a11y check (the T3.3 acceptance) = three CI-runnable layers**
- `src/lib/ui/contrast.test.ts` (new, 13 tests) — enumerates EVERY rendered fg/bg pair
  (the `format.ts` verdict/field presentation maps + the `colors.ts` palette) and asserts
  ≥4.5 (text) / ≥3.0 (borders, focus ring). This deliberately back-fills the one rule axe
  can't run under jsdom (color-contrast needs a layout engine).
- `src/components/VerifyForm.a11y.test.tsx` (new, 2 tests) — renders the form AND a
  representative results view to static markup, mounts each in jsdom, runs **axe-core**,
  asserts **0 violations** (structural rules: names/labels, landmarks, table/heading
  semantics, ARIA validity).
- `plugin:jsx-a11y/recommended` added to `.eslintrc.json`; `eslint-plugin-jsx-a11y` pinned
  as an explicit devDep (so the rules can't silently vanish on a future Next bump).

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `next lint` clean (now incl.
jsx-a11y recommended); `vitest run` **226/226** (15 new: 13 contrast + 2 axe — no live model
calls; the extractor is not involved in a UI slice); `next build` succeeds. New devDeps
(`jsdom`, `axe-core`, explicit `eslint-plugin-jsx-a11y`) are dev-only.

**Reviews:** code auditor = **no BLOCKER/MAJOR** (3 NIT; WCAG math + focus-effect deps +
no-secrets all verified). Compliance = **PASS** on all 6 T3.3 criteria + the §8 "keyboard +
screen-reader sane / AA contrast / status never color-only" lines. Self-triage: applied 2
safe NITs in-run — reuse the `--focus-ring` CSS var in `.skip-link`; pin jsx-a11y as an
explicit devDep — re-ran lint + tests green. Remaining NITs (index keys on a static diff;
a comment) need no action.

**Honest gap (DEFERRED, not a fail):** keyboard-only END-TO-END *completion* of a real
verification can't be proven from static tests — that needs a live browser and is the
T3.4 sample-label E2E (still TODO). Everything provable without a browser is covered and
automatically gated.

**Next task:** M3 / T3.4 — sample/test labels (CONTEXT §5 fields incl. one non-compliant
warning, one angled/glare photo, one beer-no-ABV, one table wine) committed to `samples/`
and referenced in the README demo steps; this also exercises the keyboard-only E2E clause.

**Blockers:** none. **Status: READY FOR STEVE TO REVIEW + MERGE PR.**

---

## 2026-06-11 (interactive) — flash-lite blurry-escalation validation (de-risk model lock)

Probed the live URL (now `gemini-3.1-flash-lite` default) with progressively degraded
synthetic labels to confirm the confidence→escalation path:

| Image | escalated | server latency | Gov Warning |
|---|---|---|---|
| clear              | no  | 1.9s | match |
| mild blur (2px)    | no  | 1.8s | match |
| heavy blur (4px)   | no  | 1.8s | match |
| blur + low contrast| **yes → Sonnet** | 2.0s | match |

**Result: escalation works.** The worst image crossed the threshold and escalated to the
Sonnet deep tier, still completing in ~2s (huge SLA headroom). flash-lite read the
Government Warning correctly even at heavy blur. Caveat: heavy-blur returned `fail`
WITHOUT escalating — a possible "confidently wrong" lite-model case (safe direction, but
a candidate to lower the confidence threshold slightly). Logged to BACKLOG. Model lock on
flash-lite is de-risked for now; Steve will also try a real hard photo and can flip
`GEMINI_MODEL` back to `gemini-3.5-flash` (zero code change) if a real case warrants it.

## 2026-06-11 (interactive, w/ Steve) — M5 / T5.2 latency: model lock = gemini-3.1-flash-lite

**Context:** first live extraction calls after deploy failed; diagnosed end-to-end on
the production URL (logging added in a prior PR surfaced the provider status).

**Root-cause chain (each fixed + redeployed):**
1. `gemini-2.0-flash` was RETIRED by Google 2026-06-01 → every call 404'd with a valid
   key. (The friendly UI message had hidden this; route diagnostics exposed `status 404`.)
2. Gemini 3.x default "thinking" (level "medium") dominated latency → pinned
   `thinkingLevel='low'` (env `GEMINI_THINKING_LEVEL`). ~7.6s → 6.6s.
3. `rawText` (full-label transcription) was requested but consumed by nothing → removed
   from the response schema + Sonnet prompt. 6.6s → ~4.5s on a real photo.
4. Client-side image downscaling to ~1568px (`imageResize.ts`) — free on accuracy
   (model downsamples internally), trims upload + processing, kills heavy-image timeouts.
5. Raised the Flash abort 4s → 9s (env `GEMINI_TIMEOUT_MS`) so legitimate dense photos
   aren't aborted mid-read.

**Benchmark (live URL, 1568px label, 3 runs each, server `latencyMs`):**
- gemini-3.5-flash:      3.28 / 2.69 / 2.68 s  (avg ~2.9s)
- gemini-3.1-flash-lite: 1.45 / 1.28 / 1.53 s  (avg ~1.4s)
Both: brand match, ABV match, **Government Warning exact-match** — identical accuracy on a
clear label. **Decision (Steve): lock `gemini-3.1-flash-lite`** as the primary fast tier
(~1.4s, ~3.5s SLA headroom for cold starts); Sonnet stays the confidence-triggered deep
tier for blurry/low-confidence images (spec tolerates 5–7s on the escalated path).

**This slice:** default model → `gemini-3.1-flash-lite` (env-overridable); removed the
diagnostic per-request `__model` benchmark hook (not for prod). 211/211 green; tsc + lint
clean. T5.2 marked DONE.

**Observed accuracy findings (logged to BACKLOG, not blocking):** extraction was 100%
correct on a real Kendall-Jackson photo; the "Needs review" flags came from strict
EXPECTED-value parsing (`13`, `750` without units) + the intentional case-only→review
rule — an engine-tuning slice, not extraction error.

**Next on critical path:** validate flash-lite confidence on a blurry image (escalation
fires), M3 T3.3 accessibility + T3.4 sample labels, M5 T5.1 README/approach doc, T5.3
deploy smoke-test. **Blockers:** none.

---

## 2026-06-11 (overnight run) — M3 / T3.2 error handling

**Slice built:** T3.2 — single-label error handling / preflight validation. Strict-next
TODO after T3.1 merged (PR #9). Freshly-cloned `main` was AHEAD of the connected-folder
planning copies (they still showed T3.1 TODO); trusted `main` per AGENTS.md and built
off it. No open BLOCKER / FAIL on entry.

**What was built**
- `src/lib/ui/imageConstraints.ts` (new) — client-safe single source of truth for
  `MAX_IMAGE_BYTES` (10 MB), the accepted image MIME set, `ACCEPT_ATTR`, and the
  human-readable `MAX_IMAGE_LABEL` / `ACCEPTED_TYPES_LABEL`. Imports nothing (no SDK /
  `process.env`), so it is safe in the client bundle. `handler.ts` now imports + re-exports
  `MAX_IMAGE_BYTES` (and uses `MAX_IMAGE_LABEL` in its oversize message) so the API and the
  client preflight enforce an identical limit with no drift.
- `src/lib/ui/validateForm.ts` (new) — pure, framework-free preflight (`validateVerifyForm`):
  empty form (no expected value), missing/zero-byte image, unsupported type (case-insensitive),
  oversize (`> MAX`, so `== MAX` passes). Returns the FIRST friendly problem + which control to
  focus. Mirrors the route's wording.
- `src/components/VerifyForm.tsx` — runs the preflight before the fetch; on failure shows the
  message and moves keyboard focus to the offending control (new `brandRef` / `imageRef`); the
  file input gains `aria-describedby` help text naming accepted types + size limit and nudging
  a sharper image. Existing post-submit paths untouched: `data.error` surfacing (the API's
  "request a better image" ExtractionError body), non-JSON gateway guard, network-failure catch.
  Partial extraction still renders `missing` rows via `format.ts`.
- `src/lib/ui/validateForm.test.ts` (new) — 12 unit tests incl. inclusive size boundary,
  zero-byte=missing, whitespace-only expected=empty, case-insensitive MIME, ordering, and a
  drift guard asserting the client MIME list == extractor `SUPPORTED_MIME_TYPES`.

**Validation:** 203/203 tests green (was 191; +12). `tsc --noEmit`, `next lint`, and
`next build` all clean (route `/` = 3.7 kB First Load, validator stays client-safe).
Extractor remains MOCKED — no live Gemini/Anthropic call this run.

**Reviews:** AUDIT = PASS (no BLOCKER/MAJOR/MINOR; 2 NITs logged to BACKLOG, not gold-plated).
COMPLIANCE = PASS (9/9 criteria; T3.3 full-a11y + T3.4 sample-labels correctly deferred).

**In-run self-fix:** swapped the handler's hard-coded "10 MB" oversize string to derive from
`MAX_IMAGE_LABEL` (compliance NIT b) — re-tested green.

**Decisions / notes:** kept the validator pure + node-testable (no jsdom/testing-library added),
matching the established `format.ts` pattern. Preflight is a UX fast-path; the server route still
re-validates independently (defense in depth).

**Next TODO:** T3.3 — accessibility pass (semantic HTML already strong; needs keyboard-flow +
AA-contrast + automated a11y check), then T3.4 sample labels. Critical path to Mon 6/15: T3.3,
T3.4, then M5 (README/approach doc, latency check, deploy).

**Blockers:** none.

---

## 2026-06-11 (evening run) — M3 / T3.1 single-label UI

**Slice built:** T3.1 — single-label verification screen. Strict-next TODO after
T1.3 (`/api/verify`) merged; the route + comparison engine it consumes are on
`main`, so this is the next critical-path slice (the first user-facing screen).

**State on entry:** freshly-cloned `main` (PR #8 merged) matched the connected-folder
planning copies — M0, M1 (T1.1–T1.3), M2 (T2.1–T2.5) all merged. No open BLOCKER /
FAIL. Built off `main`.

**What was built**
- `src/lib/ui/format.ts` — pure, I/O-free presentation helpers (overall + field
  status -> plain-language label + non-color text glyph; `formatLatencySeconds` /
  `formatVerifiedLine` with NaN/negative flooring; fallback-to-`review` guards for
  unexpected enum values). Kept framework-free so it unit-tests under the existing
  `node` vitest env — no DOM/testing-library dependency added.
- `src/lib/ui/format.test.ts` — 8 tests (latency formatting incl. clock-skew/NaN,
  verified-line escalation note, presentation coverage + fallbacks).
- `src/components/VerifyForm.tsx` — `'use client'` form (brand, class/type,
  beverage-type `<select>`, ABV [labeled optional for beer/table wine], net
  contents, label-image picker) that POSTs multipart to `/api/verify` (field names
  match `parseVerifyForm`). Renders the `VerificationResult`: overall banner
  (glyph+word+summary+latency), per-field table (expected vs found + status +
  detail), Government Warning section with the word-level diff and a plain-language
  legend. In-flight "running a closer check…" copy; "(a closer check was run)" on
  `escalated`. Stateless — no localStorage/persistence; image sent for the request
  only. Friendly inline errors (the API already returns human-readable messages).
- `src/app/page.tsx` — server shell: heading + agent-assist framing ("flags for a
  human reviewer; does not make compliance decisions") + `<VerifyForm/>`.

**Verification (sandbox /tmp clone):** `tsc --noEmit` clean; `next lint` clean;
`next build` succeeds (/ route 3.07 kB, route compiled); `vitest run` **191/191
passing** (8 new). No live API calls (UI work is all post-response; engine + route
already mocked-tested).

**Reviews:** code auditor = **no BLOCKER/MAJOR** (2 MINOR + 3 NIT). Compliance =
**PASS** on all in-scope T3.1 criteria; live-browser E2E against a real sample label
recorded DEFERRED (a human/T3.4 step — no API keys in an unattended run; wiring
verified consistent across component <-> route <-> handler <-> types).

**Self-triage (fixed in-run, all safe / no spec decision):**
- Removed a dead `formRef`/`useRef` (submission uses `e.currentTarget`).
- Non-JSON response body (e.g. an upstream gateway HTML error page) now shows a
  clear "unexpected response (HTTP n)" message instead of the misleading network
  error (still crash-safe before; just better copy).
- Fixed HEIC/HEIF copy drift in the image-picker helper text (made generic).
Re-ran tsc + lint + build + tests after the fixes — all green.

**Logged for later (not gold-plated this slice):**
- Drag-and-drop dropzone (spec says "dropzone"; shipped a standard file picker —
  functionally equivalent) — fold into T3.2/T3.3 if time allows.
- Deeper client error UX (retry affordance, oversize/type pre-check before upload)
  -> T3.2. Full a11y sweep (keyboard focus states, measured AA contrast,
  screen-reader pass) -> T3.3. Sample-label browser E2E -> T3.4.

**Open finding for Steve (pre-existing, repo-wide — NOT this slice):** `next@14.2.5`
security advisory still outstanding (npm deprecation warning on install). Best done as
its own small dependency-bump PR before deploy (M5). Not a T3.1 blocker.

**Next task:** M3 / T3.2 — error handling (wrong type/oversize, empty form/image,
model/network failure, unreadable image -> "request a better image", partial
extraction -> fields `missing`).

**Blockers:** none. **Status: READY FOR STEVE TO REVIEW + MERGE (PR opened against main).**

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

---

## 2026-06-12 (evening run) — M2/T2.5 net-contents beverage-type conditional

**Slice:** Resolved the open T2.3 AUDIT MAJOR (net-contents comparison not
beverage-type-aware). Threaded `beverageType` end-to-end so the measurement-system
rule is conditional per CONTEXT §5.

**What changed:**
- `src/lib/comparison/netContents.ts` — `compareNetContents` gains an optional
  3rd-positional `beverageType?: BeverageType`. In the cross-system (metric vs U.S.)
  equal-quantity branch: `beer` -> `match` ("U.S. fluid measure is acceptable for malt
  beverages"); spirits/wine/undefined -> `review` with a sharpened detail naming the
  metric requirement. Same-system and mismatch paths unchanged; the allowance is
  reachable only after the numeric tolerance check, so it is system-only (a different
  fill still `mismatch`). Module docstring updated.
- `src/lib/comparison/aggregate.ts` — `compareLabel` now passes
  `expected.beverageType` into `compareNetContents`.
- `src/lib/comparison/netContents.test.ts` — +7 tests (beer both directions; beer
  different-fill mismatch; beer same-system; spirits/wine review; omitted-type
  conservative review).

**Verify:** 233/233 tests green; `tsc --noEmit`, `next lint`, `next build` all clean.
Extractor untouched (no live model calls). Pure deterministic engine change.

**Reviews:** code auditor APPROVE (no BLOCKER/MAJOR; 2 NIT, no action); compliance
PASS. Both confirm the T2.3 MAJOR is resolved. No fix-in-run required.

**Status:** PR opened off `main` (branch `agent/m2-netcontents-beveragetype`).
Critical path (M2/T1.3/M3/M5-latency) was already complete; this run cleared the last
open MAJOR before touching batch (M4). Next strict-order TODO is M4/T4.1 (batch) — the
slip-rule cut line — or M5/T5.1 (README/approach doc) on the critical path.

**Blockers:** none.
