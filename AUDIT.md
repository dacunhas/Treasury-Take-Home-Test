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
