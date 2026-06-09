# COMPLIANCE.md — Compliance Reviewer Findings

Appended per run. Each criterion: PASS / PARTIAL / FAIL + evidence + gap. Items that
belong to a later milestone are DEFERRED (not FAIL). Read-only output.

---

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
