# AUDIT.md — Code Auditor Findings

Appended per run. Severity tags: BLOCKER / MAJOR / MINOR / NIT. Read-only output;
the builder may mark a finding `Resolved` with a back-reference.

---

## 2026-06-12 — M4/T4.2 Batch results table + export

**Verdict: SHIP-READY. No BLOCKER/MAJOR. 3 MINOR (1 fixed in-run, 2 logged) + NITs.**

Audited the T4.2 diff: `src/lib/batch/export.ts`, `src/lib/batch/sort.ts`,
`src/lib/batch/index.ts`, and the `BatchForm.tsx` changes. Export+sort are
pure/deterministic/I-O-free (no Date/random/global state, no input mutation — sort
decorates a fresh `.map`). RFC-4180 escaping correct (quotes on `" , \r \n`, doubles
embedded quotes, CRLF terminator). No secrets. `colSpan={6}` matches the 6 body columns.
One row expands at a time, so the reused `ResultCard`'s `id="result-heading"` cannot
collide. a11y patterns correct: `aria-sort` on `<th scope=col>`, descriptive sort-button
`aria-label`, glyphs `aria-hidden`, `aria-expanded`/`aria-controls` paired with the
detail `id`, `role="status"` dupe-name notice. `useMemo([outcomes, sort])` deps complete;
`expandedRow` reset on new pick/preview/run avoids a stale index.

### MINOR — FIXED in-run
- **`export.ts` `csvCell`** — assumed a string and called `.replace` directly; a future
  non-string caller would throw and blow up `outcomesToCsv` with no friendly path.
  **Fix applied:** coerce `String(value ?? '')` at the boundary. Re-tested green.

### MINOR — logged to BACKLOG (not fixed in-run; not a correctness bug)
- **`export.ts` CSV formula injection** — a model-extracted cell starting `=`/`+`/`-`/`@`
  could execute on open in Excel/Sheets. Acceptable under the self-to-self threat model
  (the same agent runs and opens the export; no third-party recipient), so shipped as-is
  with a backlog item to add a leading-character guard (prefix `'`) or document the limit
  before the CSV is ever shared/auto-consumed.
- **`sort.ts` `compareValues`** — infers numeric-vs-string from runtime `typeof`. Correct
  for every current `SortKey`; key the strategy explicitly if a future key returns a mixed
  type. → BACKLOG.

### NIT (no action)
- `sortOutcomes` allocates two intermediate arrays (decorate/sort/undecorate) — the right
  call for stability; trivial at realistic batch sizes (no 5s-budget concern).
- `statusWord` default returns the raw token, but `FieldStatus` is a closed union so the
  fallthrough is unreachable.

### Resolution status
csvCell coercion fixed + re-tested (273/273). Formula-injection guard + compare-strategy
keying carried to BUILD_BACKLOG. No BLOCKER/MAJOR.

---


## 2026-06-12 — M4/T4.1 Batch input + processing

**Verdict: SHIP-READY. No BLOCKER/MAJOR.** Pure core (csv/match/process/fields)
deterministic & I/O-free, well-tested; the React glue is thin and reuses the server
boundary correctly. 26/26 batch tests pass; scoped `tsc` clean.

### Verified clean
- **Per-row isolation (T4.1 acceptance):** `process.ts` wraps the injected `verifyRow`
  in try/catch (rejection -> `error` outcome, batch continues); invalid/unmatched rows
  short-circuit to `error` with no model call. Tested.
- **Concurrency pool is order-stable:** outcomes written by index, not push order; pool
  sized `min(limit,total)`; empty input -> `[]`. Tested with shuffled delays. No
  off-by-one.
- **CSV tokenizer:** quotes / embedded commas / `""` escapes / CRLF-LF / blank-line skip /
  any-order alias headers — correct + tested.
- **Image matching:** case-insensitive basename, dir-prefix strip (`/` and `\`), ext-less
  stem fallback, shared-image (non-consuming) + `unusedFiles`, friendly per-row error.
- **Security / boundary:** no secrets, no stack traces surfaced; verifier POSTs to
  `/api/verify` (server stays the extraction boundary); core never imports extractor/
  fetch/DOM (generic over `F`); no PII persisted (in-memory Files only).
- **Conditional ABV (CONTEXT §5):** blank ABV is not a row error; `toVerifyFields` passes
  `abv` (incl. '') verbatim. Tested.
- **Accessibility glue:** `<label htmlFor>` on every control; `<progress>` + `role=status`;
  table `<caption>`/scoped `<th>`; status = word + glyph (not colour alone); WAI-ARIA tabs
  (roving tabindex, Arrow/Home/End).

### MINOR / NIT — FIXED in-run
- `BatchForm.tsx` hardcoded the AA hex literals (`#0f5d2a`/`#8a1c1c`) instead of importing
  the contrast-test-guarded tokens, so `contrast.test.ts` covered them only by copy. **FIXED:**
  `statusPresentation` now derives from `overallPresentation`/`fieldStatusPresentation`.
- `csv.ts` `sawAnyChar` was a dead branch (the `text.trim()===''` guard already handles
  empty input). **FIXED:** removed; flush simplified.

### MINOR — logged to BACKLOG (T4.2; not gold-plated)
- `BatchForm` keys the upload map by `File.name`, so two different files sharing a basename
  collide — surface a "two images share the name X" notice.
- `csv.ts` duplicate header columns are silently first-wins — warn or document.
- Fixed concurrency (3) with no cancel — consider a Cancel control / tunable pool for
  200-300-row imports. None is a correctness bug; the per-row core is sound.

---

## 2026-06-12 — M5/T5.1 README + approach/assumptions doc

**Verdict: no BLOCKER. 1 MAJOR + 1 MINOR + 1 NIT — all FIXED in-run. Docs-only slice.**

Audited `README.md` + `docs/APPROACH.md` (+ the `.env.example` touch) against the live
code. No secrets in either doc. Every factual claim cross-checked: env var names/defaults
(`config.ts`, `.env.example`), model ids (`gemini-3.1-flash-lite`, `claude-3-5-sonnet-
20241022`), route status codes (400/502/503/500/405), npm scripts, comparison-module list
+ thresholds (0.95/0.80, 1% net-contents tolerance, proof=2×ABV, beer 0.1% + "ABV"
disallowed), the 10 MB cap, Node runtime, and all internal links/paths — all resolve.

### MAJOR — FIXED in-run
- README + APPROACH asserted "226 unit tests"; the static `src/**` test-case count is 234
  and the last logged green on `main` is 226 (later cleanup PRs added tests without a new
  PROGRESS top entry). The suite could not be re-run this session (disk-full sandbox), so
  pinning an exact number would be a guess. **Fix:** softened both to "220+ tests" — true
  under either count and not stale.

### MINOR — FIXED in-run
- The optional `GEMINI_TIMEOUT_MS` and `GEMINI_THINKING_LEVEL` env overrides (real, read by
  `gemini.ts`) were undocumented. **Fix:** added both to the README env table and to
  `.env.example` (commented). Also corrected the documented timeout default to the actual
  **9000 ms** (the code raised it from 4 s for heavy-image headroom) — caught during the fix.

### NIT — FIXED in-run
- `.env.example` lacked a (commented) `GEMINI_MODEL` line despite the README documenting it
  as the model-retirement override. **Fix:** added it alongside the two vars above.

### Confirmed clean
- No secrets/tokens/keys; honest about the bold/font OCR limitation and the `next@14.2.5`
  advisory; required README elements all present (firewall/local-OCR seam, stateless/no-PII,
  two-tier rationale, trade-offs/assumptions/out-of-scope); setup/run runnable from the
  README alone (T5.1 acceptance). No contradictions with CONTEXT/PROJECT_PLAN.

## 2026-06-12 — M3/T3.4 sample test labels

**Verdict: content sound; canonical warning byte-identical. 1 NIT fixed in-run.
No code defect (the "samples not committed" flag was just this run's pending commit).**

Audited `samples/generate_samples.py`, the 5 PNGs, `EXPECTED.csv`, `samples/README.md`,
and the `README.md` demo section. Pure local Pillow rendering — no secrets, no network,
no exec; PNGs synthetic (not real-product photos); CSV well-formed (RFC quoting, 8 cols
× 6 rows).

### Verified clean
- **Government Warning byte-match:** the generator's `CANONICAL_WARNING` is
  character-for-character identical to `GOVERNMENT_WARNING_CANONICAL` in
  `src/lib/governmentWarning.ts` (283 chars; compared programmatically). A real
  verification of labels 1/3/4/5 passes the strict warning check.
- **Bad warning genuinely non-compliant:** prefix `Government Warning:` not all-caps
  AND both clauses reworded/shortened → warning `mismatch` → overall fail.
- **EXPECTED.csv consistent with the real engine:** #1 pass; #2 fail (warning); #3 beer
  blank-ABV → `match` (not failed) + `12 fl oz` vs `12 FL OZ (355 mL)` same-system match;
  #4 `STONE'S THROW` → brand review, Table-Wine ABV not missing → overall review;
  #5 pass (model-dependent, framed as such).
- **Perspective math:** src→dst coefficient convention correct; degenerate-matrix path
  guarded with a rotate fallback.

### NIT — FIXED in-run
- Generator imported `numpy` for the perspective solve while the docstring +
  `samples/README.md` claimed "Pillow only." **Fix:** replaced numpy with a pure-Python
  8×8 Gaussian-elimination solver (`_solve`); removed the import; re-ran the generator
  **with numpy uninstalled** to prove the claim. All 5 PNGs + CSV regenerate; warp +
  glare render correctly.

### Note (not a defect)
- The auditor's "BLOCKER: samples/ untracked" was the pre-commit working-tree state;
  the slice is committed + pushed in this same run, satisfying T3.4's "committed to
  samples/" acceptance.


## 2026-06-12 — M3/T3.3 Accessibility pass

**Verdict: No BLOCKER/MAJOR. Slice is correct, secure, well-scoped. 3 NIT (2 fixed in-run).**

Audited the full diff: `globals.css`, `layout.tsx`, `page.tsx`, `VerifyForm.tsx`,
`colors.ts`, `contrast.ts`, `contrast.test.ts`, `VerifyForm.a11y.test.tsx`,
`.eslintrc.json`, `vitest.config.ts`, `package.json`. `tsc --noEmit` clean; `vitest run`
226/226 (incl. 13 contrast + 2 axe). Secret scan across the diff + new files → none.

### Verified clean (no findings)
- **No secrets/keys** committed anywhere; new devDeps (`jsdom`, `axe-core`, explicit
  `eslint-plugin-jsx-a11y`) are dev-only (absent from runtime `dependencies`).
- **Contrast math correct** — `relativeLuminance`/`contrastRatio` follow WCAG 2.1 exactly
  (0.03928 threshold, 2.4 gamma, correct coefficients, `(L+0.05)` ratio). Black/white
  asserts `toBeCloseTo(21,1)`; the `#777` boundary test confirms the AA threshold logic.
- **Focus `useEffect` — no loop:** the two effects depend only on `[error, errorOrigin]`
  and `[result]`, call `.focus()` only (no state writes) — no re-render cycle.
- **Exported `ResultCard`:** local→export with a required `sectionRef`; the in-file caller
  passes `resultRef`, the a11y test passes `createRef()`. No broken call sites; types check.
- **a11y test genuinely asserts** — mounts real markup in jsdom, runs `axe.run`, asserts
  `violations.toEqual([])`; `color-contrast` correctly disabled under jsdom (no layout) and
  back-filled by `contrast.test.ts`. Not a no-op.
- **5s budget:** pure client UI/CSS; no new network/server work. Unaffected.

### NIT
- `globals.css` `.skip-link` hardcoded `#0b3d91` instead of the `--focus-ring` var.
  **FIXED in-run** (now `var(--focus-ring)`).
- `eslint-plugin-jsx-a11y` resolved only transitively via `next/core-web-vitals` — a future
  Next bump could drop it silently. **FIXED in-run** (pinned as an explicit `^6.10.2`
  devDep). [compliance also flagged this]
- Word-diff spans use `key={i}` over a static, append-only array — acceptable for this
  static render; switch to a stable key only if diffs are ever animated. No action.

### Resolution
2 of 3 NITs fixed + re-tested in-run (lint + 226/226 green); the last is non-actionable.
Slice is safe to merge.

## 2026-06-11 (evening) — M3/T3.1 single-label UI

**Verdict: substantially clean. No BLOCKER, no MAJOR. 2 MINOR + 3 NIT.**

Audited the slice diff vs `main`: `src/components/VerifyForm.tsx` (new),
`src/lib/ui/format.ts` (new), `src/lib/ui/format.test.ts` (new), `src/app/page.tsx`
(rewritten). Verdict comes only from the server engine (UI calls pure presentation
helpers). Diff legend matches `warning.ts` LCS semantics exactly (removed = in
canonical/required, missing from label -> line-through; added = on label, not in
canonical -> underline). No secrets; client sends only multipart to `/api/verify`;
stateless (no localStorage). No perf trap vs the 5s budget (all UI work is
post-response). React keys stable (`f.field`, `o.value`). a11y basics present
(labels tied via htmlFor/id, aria-live/role=alert/role=status/aria-busy, glyphs
aria-hidden with text alongside) — full a11y pass correctly deferred to T3.3.

### MINOR — FIXED in-run
- **`VerifyForm.tsx` fetch handler** — a non-JSON response body (upstream gateway
  HTML error page) was caught by the outer `catch` and surfaced the misleading
  "could not reach the service" (network) message. Crash-safe already, but
  mislabeled. **Fix applied:** `res.json()` wrapped in its own try/catch; an
  unparseable body now shows "unexpected response (HTTP n)."
- **`VerifyForm.tsx`** — dead `formRef`/`useRef` (submission uses `e.currentTarget`).
  **Fix applied:** removed the ref + the `useRef` import.

### NIT
- Image-picker helper text hardcoded "(PNG, JPEG, or WebP)" while the accept list /
  server also allow HEIC/HEIF. **Fixed in-run** (made the helper text generic).
- Diff segments use `key={i}` (array index) — safe: the list is render-only and never
  reordered. No change.
- `bg`/`fg` color tokens are AA-contrast and presentation-only; status is always
  glyph + word too. No change.

### Confirmed clean
- Result rendering matches `VerificationResult` (`fields[]`, `warning{status,diff,
  detail}`, `overall`, `latencyMs`, `escalated`); `found ?? '—'` / `expected || '—'`
  handle null/empty; presentation fallbacks guard unexpected enum values.

---

## 2026-06-10 — M2/T2.4 Government Warning strict check

**Verdict: substantially clean. No BLOCKER. 1 MAJOR + 1 MINOR — both fixed in-run.**

Audited: `src/lib/comparison/warning.ts`, `warning.test.ts`, `comparison/index.ts`,
and the `governmentWarning.ts` dependency. Logic is pure/deterministic/I-O-free; no
secrets, network, fs, or model calls. LCS diff verified correct (off-by-one,
coalescing, empty inputs). Null/blank -> `missing` with a friendly message; no throws.

### MAJOR — FIXED in-run
- **`warning.ts` `detectPrefixCaps`** — the prefix regex was unanchored, so an
  uppercase "GOVERNMENT WARNING" anywhere in the text could set `prefixCaps=true`, and
  a compliant-but-noisy extraction (leading/trailing OCR text) would route to
  `mismatch`. **Fix applied:** anchored to `/^government\s+warning/i` (the mandatory
  prefix must lead the block) + added a leading-text test. The broader "should OCR
  noise downgrade to review vs mismatch" question is logged to BACKLOG (low-risk:
  the extractor returns an isolated `warningText`).

### MINOR — FIXED in-run
- **`warning.test.ts`** — the final fallthrough branch (reworded **and** lower-case
  prefix -> `mismatch`, `prefixCaps:false`, with diff) was untested. **Fix applied:**
  added that case asserting status/prefixCaps/diff/detail.

### NIT (no change)
- `GOVERNMENT_WARNING_PREFIX` is exported but unused by this slice (the check uses an
  anchored inline regex). Harmless; could reuse later. → noted, not gold-plated.

### Confirmed clean
- Determinism/purity (no Date/random/env/fs/async); honest `FONT_NOTE` on every
  non-missing result; type shapes match; diff cost O(n*m) on ~45 bounded tokens (well
  within the 5s budget); clear module boundaries; no dead code in the slice.

## 2026-06-10 — M2 / T2.2 ABV conditional slice

**Verdict: 1 MAJOR (fixed in-run), 3 MINOR, 2 NIT. No BLOCKER. Engine pure, no secrets.**

Audited `src/lib/comparison/abv.ts` + `abv.test.ts` + `index.ts`. Pure/deterministic,
null-safe under `noUncheckedIndexedAccess`, no I/O, no thrown stack traces on bad
input, no perf trap vs the 5s budget.

### MAJOR — RESOLVED this run
- **`abv.ts` ABV percent regex was unanchored** — took the *first* `%` in the string,
  so an OCR blob like "2% added flavors … 45% Alc./Vol." parsed `abv=2` and could
  wrongly **fail a compliant label** (realistic for the beer added-flavors case).
  **Fix applied:** prefer a percent anchored to an alc/vol/ABV phrase, bare-`%`
  fallback only. Regression tests added (4). Re-verified 111/111 green. → Resolved.

### MINOR (logged to BACKLOG)
- Proof-only spirits path skips the explicit proof≈2×ABV cross-check (derivation is
  self-consistent) — add a clarifying comment / decide on expected-side proof check.
- Display rounding: addressed in-run (`fmt()` rounds user-facing values) — was MINOR.
- `finerThanTenthPrecision` computed for all types, consumed only for beer (spec scopes
  the 0.1% rule to beer) — confirm intent.

### NIT (logged to BACKLOG)
- "No expected value" review message is type-agnostic (cosmetic).
- Add a `parseAbv(null)` test — done in-run.

## 2026-06-09 — M0 scaffold slice

**Verdict: No BLOCKER/MAJOR findings. Slice is clean. 4 minor/nit polish items.**

Audited: `src/types/index.ts`, `src/lib/governmentWarning.ts`, `src/lib/config.ts`,
both test files, `src/app/*`, `package.json`, `tsconfig.json`, `vitest.config.ts`,
`.gitignore`, `.env.example`, `.eslintrc.json`. Tests 14/14; typecheck, lint, and
production build all pass.

### Verified clean (no findings)
- **Secrets / .gitignore:** `.gitignore` ignores `.env`, `.env.local`, the
  `.env.*.local` variants and a catch-all `.env*`, then re-allows the example with
  `!.env.example` (negation correctly ordered after the broad ignore). No hardcoded
  secrets anywhere; `.env.example` holds only empty values + the documented `0.7`.
- **Government Warning verbatim:** `GOVERNMENT_WARNING_CANONICAL` is
  character-for-character identical to CONTEXT §5 after whitespace normalization.
  Prefix constant correct and uppercase.
- **Config fails loudly, secret-free:** `MissingConfigError` names the missing key
  only, points to `.env.example`, never echoes the value. Whitespace-only keys
  treated as missing. `getConfidenceThreshold` clamps NaN / out-of-range to 0.7.
- **Module boundaries / dead code:** clean separation (types / warning / config);
  no dead code; pure helpers are I/O-free and deterministic.
- **Types vs PROJECT_PLAN §2:** all data shapes present and matching;
  `noUncheckedIndexedAccess` on — strong strictness for upcoming diff/array work.
- **Test coverage:** warning verbatim + prefix caps + both clauses + no-newline +
  whitespace normalization + stability; config missing/whitespace/present/
  not-echoed/threshold default/valid/out-of-range. Matches what M0 contains.

### MINOR
- **`src/lib/config.ts:62` / `config.test.ts`** — `hasAnthropicApiKey` has no test
  coverage while its Gemini twin is tested. Add a parity assertion, or drop the
  function until the diagnostics UI needs it. → logged to BACKLOG.
- **`src/lib/config.ts:38`** — `getConfidenceThreshold` silently swallows an
  invalid `EXTRACTION_CONFIDENCE_THRESHOLD` (returns default with no signal), which
  could mask a misconfigured deploy. Consider a secret-free `console.warn`. → BACKLOG.

### NIT
- **`src/lib/config.test.ts:48`** — the "never echoes the secret" test sets the key
  to `''`, so it can't actually catch a regression that echoes a real value;
  strengthen to assert no accessor interpolates a `process.env` value into any
  message. Production code is correct; only the test's guarantee is thin. → BACKLOG.
- **`src/app/page.tsx` / `layout.tsx`** — inline styles and a raw `#555` (AA-borderline
  on white). Fine for a placeholder; flag so the UI milestone (§4 "73-year-old"
  accessibility bar) doesn't inherit inline styles or borderline contrast. → BACKLOG.

### Resolution status
No fixes required within M0 (all items are MINOR/NIT and most target later
milestones). Carried to BUILD_BACKLOG "Carry-over from review."

---

## 2026-06-09 — M1/T1.1 extractor slice

**Verdict: No BLOCKER/MAJOR findings.** Module boundaries clean; the extractor only
transcribes (prompt: "Do not make a compliance judgement" — no verdict logic leaks);
API key is header-only, never in the URL/logs; provider error bodies are never
surfaced; malformed/empty content degrades (no crash); confidence clamped; transport
mocked in all tests. Audited `src/lib/extractor/{types,gemini,index}.ts` + tests.

### MINOR — fixed this run
- **`gemini.ts` `extract()`** — no upper bound on the Flash call threatened the hard
  5s SLA. **FIXED:** added an `AbortController` with a configurable `timeoutMs`
  (default 4000) → maps `AbortError` to `ExtractionError('…took too long', 'timeout')`.
  Covered by a new test.
- **`gemini.ts` MIME guard** — rejection message advertised only "PNG, JPEG, or WebP"
  while `SUPPORTED_MIME_TYPES` also allows HEIC/HEIF. **FIXED:** message is now derived
  from `SUPPORTED_MIME_TYPES`, and the guard uses a dedicated `'input'` error code
  (distinct from `'http'`) so the future route can branch user-fixable vs retryable.

### NIT — fixed this run
- Unused `catch (cause)` binding → now used to detect `AbortError`.
- Network-throw test now also asserts the message is secret-free (parity with the
  non-2xx test).

### NIT — logged to BACKLOG (not gold-plated this run)
- Lazy key path: omitting `apiKey` falls through to `getGeminiApiKey()`, which throws
  `MissingConfigError` (not `ExtractionError`). The friendly-error mapping decision
  belongs to the `/api/verify` route (T1.3). → BACKLOG.

### Out-of-slice note
- `next@14.2.5` has a published security advisory (npm flagged it on install).
  Pre-existing M0 pin; logged to BACKLOG for the M5 deploy bump. Not a T1.1 blocker.

### Resolution status
All MINOR/NIT items above were fixed and re-tested within the run, except the two
explicitly logged to BACKLOG. 33/33 tests green; typecheck + lint clean.

---

## 2026-06-09 (evening run) — M1/T1.2 Sonnet deep tier + router

**Verdict: No BLOCKER/MAJOR. Slice is safe to merge. 1 MINOR + 2 NIT.**

Audited: `src/lib/extractor/sonnet.ts`, `src/lib/extractor/router.ts`, their test
files, and the `index.ts` export additions, against `gemini.ts`/`types.ts`/`config.ts`
conventions and PROJECT_PLAN §2/§3. Tests 54/54 green; `tsc --noEmit` and `next lint`
clean. Transport fully mocked (injected `fetchImpl`/fake extractors — no live calls).

### Verified clean (no findings)
- **Secrets:** Anthropic key is header-only (`x-api-key`), never in URL/body/logs.
  Non-2xx maps to a status-only secret-free `ExtractionError('http')`; a test proves a
  leaked-key (`sk-leak`) provider body is never echoed. Key resolved lazily via
  `getAnthropicApiKey()`, consistent with the Flash tier.
- **Module boundaries:** the router escalates through the same `LabelExtractor` seam —
  no provider special-casing. Sonnet transcribes only (reuses `EXTRACTION_PROMPT` +
  `parseExtractedLabel`); no verdict logic leaks in.
- **SLA protection:** deep tier called ONLY when `primaryConfidence < threshold`; the
  confident path never touches Sonnet. Deep-tier timeout bounded at 7000ms.
- **Degradation:** empty/safety-blocked → confidence-0 (no throw); malformed JSON via
  tolerant parser; deep-tier failure falls back to the primary result, still
  `escalated:true`, carrying only an `ExtractionError['code']` in `deepTierError`.
- **Coverage:** escalate / no-escalate / threshold boundary / deep-failure-fallback /
  non-ExtractionError→`unknown` / primary-failure-propagation / env-threshold default.

### MINOR
- **`sonnet.ts` extract() (and `gemini.ts` parity)** — the `AbortController` timer is
  cleared in `finally` right after `fetch` resolves, so a slow `await response.json()`
  is unbounded by `timeoutMs`. Same latent gap as the Flash tier (a consistency
  carry-over, not a regression); nearest the human-review boundary on the 7s deep tier.
  Fix: keep the abort signal alive across the body read, in both tiers together. →
  logged to BACKLOG (M1/T1.3).

### NIT
- **`sonnet.ts:27`** — `image/gif` is advertised as supported; vision treats it as a
  single (first) frame. Harmless; noted, no action.
- **`router.ts` `deepTierError`** — the `'unknown'` literal is correctly a member of
  `ExtractionError['code']`; the dependency on that union is implicit. Optional: type
  the constant. NIT only.

### Resolution status
No fixes required within T1.2 (the one MINOR is a cross-tier carry-over best fixed in
T1.3; NITs are non-actionable). Carried to BUILD_BACKLOG "Carry-over from review."

---

## 2026-06-10 — M2/T2.1 comparison engine (normalize + brand/class-type)

**Verdict: No BLOCKER/MAJOR. Slice is pure, deterministic, ship-ready. 2 MINOR (both
fixed in-run) + NITs.**

Audited `src/lib/comparison/{normalize,textMatch,index}.ts` + tests against
PROJECT_PLAN §3 ("Brand name & class/type") and CONTEXT §6. Pure/I-O-free/no hidden
state (no Date/random/globals); Levenshtein two-row DP correct & safe under
`noUncheckedIndexedAccess`; thresholds use the right boundary operators (`>=0.95`
match / `>=0.80` review / else mismatch); `FieldResult` shape matches
`src/types/index.ts`; details plain-language & secret-free; O(n·m) on short fields —
no 5s-budget perf trap. 83/83 tests green; slice typecheck clean.

### MINOR — fixed this run
- **`normalize.ts` (punctuation pass)** — diacritic letters were dropped to a *space*
  (`café`→`"caf"`, `Schön`→`"sch n"`), corrupting real TTB brands (Crème/Forêt/
  Köstritzer) and splitting tokens. **FIXED:** added `NFKD` + combining-mark strip
  (`/[̀-ͯ]/`) before the punctuation pass, so accents fold to base letters
  (`café`==`cafe`). New tests pin `Café/Schön/Crème` and `Crème de Cassis` vs
  `Creme de Cassis` → review.
- **`textMatch.ts` exact-match branch** — compared *trimmed* strings, so a
  leading/trailing-whitespace-only delta returned `match` "Exact match." — a silent
  pass on a non-identical raw string, contrary to §3 "never silent pass on
  formatting." **FIXED:** the exact branch now gates on raw `expected === found`; any
  whitespace-only delta falls through to the normalization-equal `review` branch. New
  test pins trailing-space → review.

### NIT — logged to BACKLOG (not gold-plated)
- No test constructs an input landing exactly on `ratio === 0.80` / `=== 0.95` to lock
  the `>=` (vs `>`) boundary semantics; bands are covered mid-range. → BACKLOG.
- `compareClassType` has no direct `missing`/null test (shared `compareTextField`
  makes it low-risk; `compareBrand` covers the path). → BACKLOG.

### Out-of-slice note
- Full `next lint` / `next build` not re-run this slice due to the ~400 MB sandbox
  disk constraint (leftover `nobody`-owned `node_modules` unremovable); validated with
  a minimal vitest+typescript toolchain. Re-run on the next clean sandbox. Pure-TS
  slice, no Next runtime deps.

### Resolution status
Both MINORs fixed + re-tested within the run; NITs carried to BUILD_BACKLOG.
83/83 green; slice typecheck clean.

---

## 2026-06-10 — M2/T2.3 net-contents comparison

**Verdict: No BLOCKER. 2 MAJOR found; M1 FIXED in-run, M2 logged for T2.5. 1 MINOR +
NITs. Slice is pure, deterministic, and ship-ready after the M1 fix.**

Audited `src/lib/comparison/{netContents.ts,netContents.test.ts,index.ts}` against
PROJECT_PLAN §3 ("Net contents") + §8 and CONTEXT §5/§6. Pure/I-O-free (no
Date/random/globals, no input mutation); two regex matches + arithmetic, O(n) on short
strings — no 5s-budget perf trap; `FieldResult` shape conforms; details plain-language
and secret-free. Unit factors verified (1 US fl oz = 29.5735 mL; pint/quart/gallon
accurate). 142/142 tests green; slice typecheck + eslint clean.

### MAJOR — M1 (FIXED this run)
- **`netContents.ts` parse** — the original `NET_RE` made the unit OPTIONAL and
  `String.match` returns the leftmost match, so a leading number (lot code, batch no.,
  surrounding words) stole the parse and the real unit was dropped ("Lot 12345 / 750
  mL" -> value 12345, no unit -> `review`/`missing`). A compliant label would be
  wrongly flagged. **FIXED:** split into `NET_WITH_UNIT_RE` (number anchored to a unit,
  tried first) + a bare-number fallback used only when no number-with-unit exists. 4
  new tests pin lot-code/surrounding-text/multi-candidate inputs.

### MAJOR — M2 (open; logged to BACKLOG for T2.5 — NOT a fix-in-run)
- **`compareNetContents` is not beverage-type-aware** — an equal quantity stated in a
  different measurement system always returns `review`. Correct (conservative) for
  spirits/wine, but a beer label legitimately in fl oz against an expected mL value is
  downgraded to `review` instead of `match`. The fix is to thread `beverageType`
  through (mirroring `abv.ts`) at the aggregate-verdict stage. Compliance reviewer
  ruled the conservative `review` a PASS (never wrongly passes a spirits/wine label),
  so per the file-contract conflict rule (compliance outranks audit) this ships as-is
  and is carried to T2.5. → BACKLOG.

### MINOR
- `gal` factor 3785.41 vs true 3785.411784 (~5e-7 relative) — harmless under the 1%
  tolerance; revisit only if tolerance is tightened. → BACKLOG.

### NIT
- Bare `oz` maps unconditionally to fluid ounces (correct for a volume net-contents
  field; a weight "oz" on an alcohol label is implausible). Behavior fine.
- `?? 0` / `expected ?? ''` fallbacks are dead-defensive (value is non-null on those
  branches) but keep output secret-free — consistent with `abv.ts` style; leave.

### Resolution status
M1 fixed + re-tested within the run (142/142 green). M2 + MINOR/NIT carried to
BUILD_BACKLOG "Carry-over from review."

---

## 2026-06-11 — M2/T2.5 Aggregate verdict slice

**Verdict: CLEAN. No BLOCKER/MAJOR. 1 MINOR + 2 NIT (no action required).**

Audited `src/lib/comparison/aggregate.ts` + `aggregate.test.ts` + the `index.ts`
export, against the comparators they call. `tsc --noEmit` clean; `vitest run`
171/171; no secrets.

### Verified clean
- **Pure/deterministic:** no I/O, no model calls, no mutation, no Date/random/global
  state; imports are sibling comparators only. Engine stays the defensible core.
- **Rollup correct:** `aggregateOverall` — any `fail`->fail; else any `review`->review;
  else `pass`. Both severity switches are exhaustive over `FieldStatus`.
- **Warning strictness:** `warningSeverity` maps `missing`/`mismatch`->fail (stricter
  than ordinary fields), so an absent/altered mandatory warning sinks the verdict even
  when all four fields match.
- **`combineAbv`:** joins abv+proof so the proof cross-check fires; returns `null` when
  neither present, preserving conditional-by-beverage-type. `beverageType` passed
  through unchanged.

### MINOR
- **aggregate.test.ts** — the `field()` rollup-test builder hardcodes `field:'X'`; the
  rollup tests assert on status only. Net coverage is fine (integration tests assert
  field identity + order), so no fix required. → noted.

### NIT
- **aggregate.ts `aggregateOverall`** — builds a `severities` array then `.includes()`
  twice (two O(n) passes + an allocation). Trivial at <=5 fields; a single reduce would
  avoid it. Style only. → no action.
- **aggregate.test.ts (spirits-no-ABV)** — was a loose `mismatch||missing` OR.
  **RESOLVED in-run:** tightened to assert exact `mismatch` + overall `fail`.

### Resolution
One NIT fixed in-run (assertion tightened). Remaining MINOR/NIT are non-load-bearing
and need no change. Slice is safe to merge.

---

## 2026-06-11 — M1 / T1.3 `/api/verify` route

**Verdict: No BLOCKER/MAJOR. Slice is clean. 1 MINOR (fixed in-run) + 2 NITs.**

Audited: `src/app/api/verify/{handler,route,handler.test}.ts` against the contracts in
`src/lib/extractor/*` and `src/lib/comparison/aggregate.ts`. Tests 183/183; typecheck +
lint clean. Extractor is properly MOCKED in tests (in-memory fake; no provider import,
no network).

### Verified clean (no findings)
- **No secrets / no logging of env:** no `console`/`process.env`/key references in the
  three files; `MissingConfigError` → generic 503 that does not leak the env-var name.
- **Error paths:** every branch returns `NextResponse.json({error})` — 400 validation,
  400 non-multipart, 503 missing-key, 502 ExtractionError (input vs transient), 500
  unknown, 405 non-POST. No stack trace reaches the client (PROJECT_PLAN §5).
- **Statelessness:** image read into a Buffer for the request only, base64-encoded,
  handed to the extractor, never written to disk/DB. Test-asserted passthrough.
- **Input validation:** presence + Blob/type + MIME allow-list + 10 MB cap (checked
  before `arrayBuffer()`, so no oversized buffer is materialized) + empty-decode guard;
  beverage-type enum (case-insensitive); ABV left to the engine.
- **Perf vs 5s:** size cap before buffering; extractor cached on warm instances; deep
  tier only on low confidence (router). No obvious trap.

### MINOR (RESOLVED 2026-06-11 in-run)
- `handler.ts` — MIME error message said "PNG, JPEG, or WebP" while `SUPPORTED_MIME_TYPES`
  also accepts HEIC/HEIF (message could mislead). **Fix applied:** `SUPPORTED_TYPES_LABEL`
  is now derived from `SUPPORTED_MIME_TYPES`, so user-facing strings can't drift from the
  accepted set. Re-tested green.

### NIT (no action — logged for awareness)
- `handler.ts` — the post-required-fields `imageValue instanceof Blob` re-check is
  slightly redundant with the earlier `hasImage` computation. Correct/defensive; kept.
- `handler.ts` — `imageBytes` on `ParsedVerifyRequest` is diagnostic-only and unused by
  `runVerification` (exercised by a test). Kept for testability/future logging.

### Cross-cutting (NOT this slice — for Steve)
- `next@14.2.5` has a published security advisory (install deprecation warning). Repo-wide
  dependency hygiene; recommend a small standalone "bump Next" PR before submission.

---

## 2026-06-11 (overnight) — M3 / T3.2 error handling / preflight validation

**Verdict: PASS — clean slice. No BLOCKER/MAJOR/MINOR. 2 NITs (logged to BACKLOG, no action).**

Audited the diff: `src/lib/ui/imageConstraints.ts` (new), `src/lib/ui/validateForm.ts`
(new), `src/lib/ui/validateForm.test.ts` (new, 12 tests), `src/components/VerifyForm.tsx`
(wiring), `src/app/api/verify/handler.ts` (single-source import). 203/203 green; tsc + lint
+ `next build` clean.

### Verified clean (no findings)
- **No secrets / no leaks:** no `console`/`process.env`/key refs in new code (only a doc
  comment in `imageConstraints.ts` explaining the module deliberately avoids them).
- **Client-safety:** `imageConstraints.ts` has ZERO imports (pure constants/functions);
  `validateForm.ts` imports only from it. No transitive path to provider SDK/config — safe
  in the client bundle (confirmed: `/` First Load 3.7 kB).
- **Single source of truth:** `MAX_IMAGE_BYTES` (10 MB, unchanged) now lives only in
  `imageConstraints.ts`; `handler.ts` imports + re-exports it (so `handler.test.ts` still
  resolves it) and uses `MAX_IMAGE_LABEL` in its message. Drift-guard test pins the client
  MIME list to the extractor's `SUPPORTED_MIME_TYPES`.
- **Validator correctness:** order expected→presence→type→size; inclusive size boundary
  (`> MAX`); zero-byte = missing; case-insensitive MIME; whitespace-only expected = empty.
- **VerifyForm wiring:** exactly one `new FormData` (inner duplicate removed); fetch body
  unchanged; refs + focus routing correct; preflight returns before `verifying` state, so the
  success path is unregressed.
- **Errors / perf:** friendly strings only, no stack traces, wording matches the server; pure
  synchronous checks pre-network — no 5s-budget concern.

### NIT (logged to BACKLOG, no action this slice)
- Client MIME list is drift-guarded against GEMINI's set only; SONNET's set differs
  (`image/gif` vs `heic`/`heif`). Harmless while Gemini is the documented primary; revisit if
  provider routing becomes user-selectable.
- An empty `image.type` falls into the "type not supported" branch rather than a presence
  message. Acceptable UX.


---

## 2026-06-11 (interactive) — M5 / T5.2 latency + model lock

**Verdict: clean. Latency root-caused and fixed; primary model locked to
gemini-3.1-flash-lite. No BLOCKER/MAJOR.**

- **Secrets:** the per-request `__model` benchmark hook (allow-listed, diagnostic) was
  REMOVED before locking — no request-controlled model selection ships to prod.
- **`thinkingLevel`/`rawText`/model/timeout** are all pure config or schema changes;
  comparison engine untouched; 211/211 green; tsc + lint clean.
- **Diagnostic logging** from the earlier PR retained (secret-free `console.error` of
  ExtractionError code + provider status) — valuable for prod debugging; no key leak.
- **Note:** flash-lite is a lighter model; recommend a one-off blurry-image check that
  confidence falls below threshold so the Sonnet escalation fires (logged to BACKLOG).

---

## 2026-06-12 (evening) — M2/T2.5 net-contents beverage-type conditional

**Verdict: APPROVE. No BLOCKER/MAJOR. 2 NIT (non-blocking, no action).**

Audited the uncommitted slice (`netContents.ts`, `aggregate.ts`, `netContents.test.ts`)
threading `beverageType` into the net-contents verdict. Engine remains pure/
deterministic/I-O-free (no Date/random/globals, no input mutation). Gates green:
`vitest src/lib/comparison/` + `tsc --noEmit` clean; full suite 233/233.

Correctness verified: beer cross-system equal quantity -> `match` in BOTH directions
(symmetric system-inequality check, not direction-coded); a genuinely different fill
still `mismatch` (the beer allowance is reachable only AFTER the `diff > tolerance`
check, so it is system-only, never magnitude); spirits/wine/undefined keep `review`;
same-system paths untouched (new `if` nested inside the existing cross-system block).
Backward-compat: new `beverageType?` is optional 3rd-positional before `options`; no
in-tree 2-arg caller breaks; `aggregate.ts` now passes `expected.beverageType`
(required field, always present). Mirrors the `abv.ts` conditional-by-type idiom.

### NIT (no action)
- `beverageType === 'beer'` single positive check has no exhaustiveness guard (unlike
  `abv.ts` switch). Fine for a single branch; flag only if a 4th `BeverageType` with
  its own net-contents rule is ever added.
- `pe.value ?? 0` / `pf.value ?? 0` fallbacks are dead-defensive on this branch
  (`.ml` non-null => `.value` non-null) — consistent with module style; leave.

### Resolves
**Closes the open T2.3 AUDIT MAJOR (M2)** — "net-contents not beverage-type-aware."
Threaded end-to-end; test-covered; conservative default preserved. → Resolved.

---

## 2026-06-12 (interactive) — M2/T2.4 Government Warning body-casing -> match

**Verdict: APPROVE. No BLOCKER/MAJOR/MINOR. 2 NIT (1 cosmetic header note fixed in-run).**

Audited `warning.ts` + `warning.test.ts`. Engine still pure/deterministic/I-O-free.
The ONLY logic change: the `caseInsensitiveEqual && prefixCaps` branch goes
`review` -> `match` (body letter-casing is unregulated; the old gate fired "needs
review" on virtually every real, often ALL-CAPS, label). All other verdicts byte-
identical: missing -> `missing`; non-caps prefix -> `mismatch`; reworded/extra/clause-
dropped -> `mismatch` + diff; exact -> `match`. The new branch is gated on a WHOLE-
STRING case-insensitive equality, so no reworded/missing-clause/punctuation-altered
text can reach it. `textMatch:false` retained on the relaxed pass; only consumer
(`aggregate.warningSeverity`) switches on `status`, not `textMatch` — rolls up to
`pass` correctly. Honest bold/font-size caveat still appended. 14/14 warning tests
(234/234 total); tsc/lint/build clean. NIT (header "byte-for-byte" wording) fixed
in-run. NIT (`warningSeverity` 'review' arm now unreachable via warnings) left for
switch exhaustiveness. → Resolves the "warning always shows Needs review" report.
