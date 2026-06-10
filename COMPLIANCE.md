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
