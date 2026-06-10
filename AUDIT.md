# AUDIT.md — Code Auditor Findings

Appended per run. Severity tags: BLOCKER / MAJOR / MINOR / NIT. Read-only output;
the builder may mark a finding `Resolved` with a back-reference.

---

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
