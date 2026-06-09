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

### T1.2 — Sonnet deep tier + router  [TODO]
- `SonnetExtractor` (same interface). Router: Flash → if confidence < threshold →
  Sonnet → else return Flash result. Threshold configurable.
- **Accept:** high-confidence label uses Flash only; forced-low-confidence path
  invokes Sonnet; escalation flagged in the result for the UI.

### T1.3 — `/api/verify` route (single)  [TODO]
- Accept multipart (expected values + beverage type + image). Validate input.
  Call extractor → comparison engine → return `VerificationResult` with `latencyMs`.
- **Accept:** happy path returns structured result; bad input returns 4xx + message,
  never a stack trace.

---

## M2 — Comparison engine (Thu 6/11)  *(the correctness core — heavily tested)*

### T2.1 — Normalization + brand/class-type match  [TODO]
- Normalize (lowercase, NFKC, strip punctuation/possessives, collapse whitespace);
  similarity scoring; thresholds → match / review / mismatch.
- **Accept:** unit tests incl. "STONE'S THROW" vs "Stone's Throw" → review/match,
  not fail; clearly different brands → mismatch.

### T2.2 — ABV (conditional by beverage type)  [TODO]
- Parse numeric %; tolerance compare; proof = 2×ABV cross-check. Conditional rules:
  spirits required; wine "Table Wine"/"Light Wine" substitute allowed (7–14%);
  beer optional + flag "ABV" abbreviation + 0.1% precision.
- **Accept:** unit tests for each beverage type incl. beer-without-ABV (pass) and
  spirits-without-ABV (fail).

### T2.3 — Net contents  [TODO]
- Parse value+unit; normalize mL/L/fl oz; numeric compare.
- **Accept:** unit tests for unit conversions and mismatches.

### T2.4 — Government Warning (strict + diff)  [TODO]
- Checks: present; "GOVERNMENT WARNING" uppercase; full text == canonical
  (whitespace-normalized); word-level diff on mismatch. Honesty note re: bold/font
  not detectable from text.
- **Accept:** test matrix — exact (pass); title-case prefix (fail); reworded (fail);
  missing (fail); shrunk-but-correct-text (pass on text, note formatting limit).

### T2.5 — Aggregate verdict  [TODO]
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