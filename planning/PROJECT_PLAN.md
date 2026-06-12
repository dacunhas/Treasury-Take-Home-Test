# PROJECT PLAN — TTB Label Verification Prototype

Companion to `CONTEXT.md`. This file is the build plan: architecture, the
comparison-engine spec, the timeline to Monday 6/15, and the pre-submission
compliance audit.

## 1. Scope (locked)

**In scope**
- Single-label verification: form (expected values) + image upload → field-by-field
  verdict + overall status, < 5s.
- Government Warning strict check with readable diff.
- Batch mode: CSV of expected values + multiple images → results table, export.
- Accessible, minimal UI ("73-year-old benchmark").
- Robust error handling (unreadable image, wrong file type, model failure,
  partial extraction).
- README + approach/assumptions doc.

**Out of scope** (state in README)
- COLA / system integration.
- Auth, accounts, persistence, databases.
- Fully implemented offline OCR fallback (seam + docs only).
- Production PII / retention handling (prototype is stateless).

## 2. Architecture

```
Browser (Next.js UI, accessible)
   │  multipart: expected values + image(s)
   ▼
/api/verify (serverless route, TypeScript)
   │  1. validate input (type, size, presence)
   │  2. LabelExtractor.extract(image) ──► Gemini Flash (vision)  ── returns structured JSON
   │  3. ComparisonEngine.compare(expected, extracted)  ── pure TS, deterministic
   │  4. return per-field results + overall + latency
   ▼
Browser renders verdict (icons + text + color, warning diff)
```

- **`LabelExtractor` interface:** `extract(image): Promise<ExtractedLabel>` where
  `ExtractedLabel` includes a `confidence` signal.
  - `GeminiExtractor` — fast primary (~1–3s). One structured-output call; prompt
    asks for a strict JSON schema (brand, classType, abv, proof, netContents,
    warningText, rawText, confidence). Low temperature.
  - `SonnetExtractor` — conditional deep tier (~3–6s). Invoked by the router ONLY
    when Gemini confidence is low / extraction ambiguous. Never run on every label.
  - `LocalOcrExtractor` — documented fallback (Tesseract.js) answering the firewall
    constraint. Stub/optional for the prototype.
- **Router:** `Flash → (if low confidence) Sonnet → human review`. Flash holds the
  5s SLA on the common path; escalated calls may take ~5–7s (acceptable: the
  alternative is human re-review). UI surfaces a "running a closer check…" state on
  escalation.
- **`ComparisonEngine`** — pure functions, no I/O, fully unit-tested. The verdict
  never depends on the model's opinion, only on extracted text.
- **Stateless:** images processed in memory; nothing written to disk/DB.

### Data shapes

```ts
type FieldStatus = 'match' | 'review' | 'mismatch' | 'missing';

interface FieldResult {
  field: string;
  expected: string;
  found: string | null;
  status: FieldStatus;
  detail?: string;        // e.g. similarity score, diff, parse note
}

interface VerificationResult {
  fields: FieldResult[];
  warning: WarningCheckResult;
  overall: 'pass' | 'review' | 'fail';
  latencyMs: number;
}
```

## 3. Comparison-engine spec

General: every comparison returns one of `match | review | mismatch | missing`
and a human-readable `detail`. `review` = "looks right but a human should glance"
(this is the Dave/STONE'S THROW case).

- **Brand name & class/type (tolerant):**
  - Normalize: lowercase, NFKC, strip punctuation, normalize possessives
    (`'s`/`'s`), collapse whitespace.
  - Score similarity (Levenshtein-ratio / Dice). Thresholds (tune with fixtures):
    `>= 0.95` → match; `0.80–0.95` → review; `< 0.80` → mismatch.
  - Exact-after-normalization differences (case / punctuation / possessive /
    accent / whitespace only) → **match** (Steve decision 2026-06-12, BACKLOG D1):
    "STONE'S THROW" vs "Stone's Throw" and "Café" vs "Cafe" are the same product, so
    they resolve to a clean match (with a note on what was ignored). Genuinely
    uncertain cases (similarity 0.80–0.95) still go to **review**.
- **ABV (conditional on beverage type — see CONTEXT §5):**
  - Form carries a beverage-type selector: Spirits / Wine / Beer.
  - Extract numeric % from both sides (regex for `NN(.N)% Alc./Vol.`).
  - Present on both → equal within tolerance (±0.0 default, configurable) → match;
    else mismatch. If proof present, verify `proof ≈ 2 × abv`; flag inconsistency.
  - **Spirits:** ABV required — absent → mismatch/missing.
  - **Wine:** if numeric absent but label/expected uses "Table Wine"/"Light Wine"
    (7–14%), treat as compliant (match/review), not missing.
  - **Beer:** ABV optional — absent → not a failure (note as "optional, omitted").
    Also flag the disallowed "ABV" abbreviation and non-0.1% precision.
- **Net contents:**
  - Parse value + unit; normalize (mL ↔ L, fl oz). Compare numerically.
- **Government Warning (strict):** see CONTEXT §5.
  - `present`: is there a warning block at all? (missing → fail)
  - `prefixCaps`: is "GOVERNMENT WARNING" uppercase?
  - `textMatch`: full statement equals canonical (whitespace-normalized)?
  - `diff`: word-level diff vs canonical when mismatched.
  - Honesty note in UI: bold/font-size not reliably detectable from extracted
    text; caps + wording are.

## 4. UI plan

- **Two modes**, tab or toggle: **Verify a label** (single) / **Batch**.
- Single: left = simple form (4 fields, large labels, placeholders from the
  sample label) + image dropzone; right = results card after submit.
- Results: big overall banner (Pass / Needs Review / Fail) with icon + word;
  per-field rows with icon + status + expected vs found; warning section shows the
  diff inline.
- Batch: CSV upload + multi-image drop; progress; results table; row click →
  detail; CSV export of results.
- Accessibility: semantic HTML, labels tied to inputs, focus states, keyboard
  flow, contrast ≥ WCAG AA, status never color-only, large hit targets, plain
  language ("Looks good" / "Please check" / "Doesn't match").
- Latency surfaced: show "Verified in 3.2s" to prove the 5s claim.

## 5. Error handling (graded)

- Wrong file type / too large → inline message, no crash.
- No image / empty form → validation before any model call.
- Model/network failure → friendly retry message; never a stack trace.
- Unreadable / low-confidence extraction → "Couldn't read the label clearly —
  request a better image," mirroring the current manual process (Jenny's note).
- Partial extraction → show what was read, mark missing fields `missing`.
- Batch: one bad row/image doesn't fail the batch; per-row error state.

## 6. Testing

- Unit tests on `ComparisonEngine` (the correctness core): brand fuzzy cases incl.
  STONE'S THROW, ABV/proof, net contents units, and the full warning matrix
  (exact, title-case prefix, reworded, missing, shrunk-but-readable).
- A few sample labels: generate with an image tool (sample fields in CONTEXT §5)
  including at least one deliberately non-compliant warning and one angled/glare
  photo.
- Manual latency check against the 5s budget on the deployed URL.

## 7. Timeline → submit Monday evening 6/15

Today is Tue 6/9. Target buffer: finish core by Sat, polish/deploy Sun, audit Mon.

| When | Milestone |
|---|---|
| Tue 6/9 | Plan locked (this doc + CONTEXT). Scaffold Next.js app, repo, Vercel project. Secure Gemini API key. |
| Wed 6/10 | `LabelExtractor` + Gemini integration returning structured JSON. `/api/verify` happy path. |
| Thu 6/11 | `ComparisonEngine` + full unit tests (brand fuzzy, ABV, net contents, warning matrix). |
| Fri 6/12 | Single-label UI end-to-end; error handling; accessibility pass; sample labels generated. |
| Sat 6/13 | Batch mode (CSV + multi-image, results table, export). |
| Sun 6/14 | Polish, latency tuning, README + approach/assumptions doc, deploy to Vercel, smoke test. |
| Mon 6/15 | Run the compliance audit (§8); fix gaps; final deploy; submit via Treasury form by evening. |

Slip rule: if behind, **batch mode is the cut line** — a flawless single-label
core beats a half-working batch. (Assignment: working core > ambitious incomplete.)

## 8. Pre-submission compliance audit (run Monday)

Each item maps to an evaluation criterion. Check every box before submitting.

**Correctness & completeness**
- [ ] Single-label verification works for all 4 fields + warning.
- [ ] Government Warning text matches canonical exactly; diff shown on mismatch.
- [ ] Caps-prefix and reworded-warning cases correctly rejected.
- [ ] Brand fuzzy cases (STONE'S THROW) resolve to Match/Review, not false Fail.
- [ ] ABV/proof and net-contents parsing correct on sample labels.
- [ ] Conditional ABV by beverage type: beer-without-ABV and wine "Table Wine"
      cases are NOT failed; spirits-without-ABV IS flagged.
- [ ] Batch mode processes a multi-row CSV + images and exports results.

**Performance**
- [ ] Typical single-label result returns in < 5s on the deployed URL (measured, shown in UI).
- [ ] Flash → Sonnet escalation fires only on low confidence (not every label);
      escalated path shows the "closer check" state and still beats human review.

**Code quality & organization**
- [ ] Extractor behind interface; comparison logic pure & unit-tested.
- [ ] Tests pass in CI / locally; no dead code; clear module boundaries.
- [ ] No secrets committed; API key via env var.

**UX & error handling**
- [ ] Usable by a non-technical agent; keyboard + screen-reader sane; AA contrast.
- [ ] Every error path returns a friendly message, never a crash/stack trace.
- [ ] Unreadable-image path gives the "request a better image" guidance.

**Attention to requirements**
- [ ] README addresses the firewall constraint + swappable/local-OCR seam.
- [ ] README states stateless / no-PII-persistence posture.
- [ ] README documents trade-offs, assumptions, and out-of-scope items.

**Creative problem-solving**
- [ ] Match vs Review vs Mismatch distinction is explained (human-in-the-loop).
- [ ] Latency surfaced to the user; bad-photo handling noted.

**Deliverables**
- [ ] Repo public/accessible with README + approach doc.
- [ ] Deployed URL live and tested from a clean browser.
- [ ] Submitted via https://forms.osi.office365.us/r/xWrQGduMw7.

## 9. Resolved decisions (was: open questions)

1. **Inference:** Gemini Flash key available. Add Anthropic Sonnet as a conditional
   deep tier (Flash → Sonnet on low confidence → human). Both behind
   `LabelExtractor`. Flash holds the 5s SLA; escalations may run ~5–7s.
2. **Repo:** Steve's personal GitHub account, brand-new repo.
3. **Beverage scope:** support all three (Spirits / Wine / Beer) via a beverage-type
   selector that drives conditional ABV validation per CONTEXT §5. Government
   Warning check is universal. This is treated as an "attention to requirements"
   feature, not scope creep.

### Still to confirm / acquire
- Both API keys in hand: Gemini (Flash tier) and Anthropic (Sonnet tier). ✓
- Vercel account for deployment (free tier fine) — to confirm.
- GitHub push auth + secret storage for whichever execution mode we pick (see
  AGENTS.md once written).
