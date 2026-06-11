# AUDIT.md — Code Auditor Findings

Appended per run. Severity tags: BLOCKER / MAJOR / MINOR / NIT. Read-only output;
the builder may mark a finding `Resolved` with a back-reference.

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
