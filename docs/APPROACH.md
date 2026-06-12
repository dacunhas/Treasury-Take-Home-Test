# Approach, Tools, Assumptions & Limitations

Companion to the [README](../README.md). This is the "why" behind the build: the
design decisions, the trade-offs, what we deliberately left out, and the limitations a
reviewer should know about. The authoritative spec lives in
[`planning/CONTEXT.md`](../planning/CONTEXT.md) and
[`planning/PROJECT_PLAN.md`](../planning/PROJECT_PLAN.md).

## 1. The problem, restated

TTB reviews ~150,000 label applications a year with ~47 agents. Most of the work is
rote matching: *is the value on the form the same as the value on the label?* The
prototype automates that comparison for a single label (and, as a stretch, a batch),
while keeping a human firmly in the loop. The stakeholder interviews in the assignment
are the rubric in disguise; each one shaped a decision below.

## 2. Guiding principles

1. **Assist, don't adjudicate.** The tool flags discrepancies; a human decides. Every
   verdict is phrased that way ("Please check", "Looks good"), and "Needs Review"
   exists precisely so borderline cases go to a person instead of being auto-passed or
   auto-failed.
2. **Correctness must be defensible.** The model is good at *reading* a label and bad
   at being audited. So the model only extracts text; the **comparison logic is pure,
   deterministic, unit-tested TypeScript**. The same inputs always produce the same
   verdict, and every rule has a test.
3. **Speed is a hard requirement.** A prior vendor took 30–40s and agents abandoned it.
   The target is ~5s. We use a single structured vision call on the common path and
   only escalate to a slower, stronger model when the fast one is unsure.
4. **Built for a wide range of users.** The design benchmark from the stakeholder was
   "something my 73-year-old mother could figure out." Large targets, plain language,
   keyboard navigable, status by icon **and** text (not color alone).

## 3. Inference: two tiers behind one seam

The assignment flags a real constraint (Marcus): the network blocks outbound ML
endpoints, which killed the last vendor's pilot. The answer is to put **all** inference
behind a single swappable interface.

- **`LabelExtractor`** (`src/lib/extractor/types.ts`) —
  `extract(image): Promise<ExtractedLabel>`, where `ExtractedLabel` carries a
  `confidence` signal so escalation is explicit, not guessed. This interface **is** the
  firewall seam.
- **`GeminiExtractor`** — fast primary. One structured-output vision call, low
  temperature, strict JSON schema (brand, classType, abv, proof, netContents,
  warningText, confidence). Default model `gemini-3.1-flash-lite` (benchmarked ~1.4s on
  the live URL), "thinking" set to `low`, overridable via `GEMINI_MODEL`.
- **`SonnetExtractor`** — conditional **deep tier** (`claude-3-5-sonnet-20241022`).
  Same interface. Invoked **only** when Flash confidence is below threshold — never on
  every label, because sequential-always would blow the 5s budget.
- **`RoutingExtractor`** — `Flash → (low confidence) Sonnet → human`. The confident
  path uses Flash **only** (the deep tier is never called) so the common path stays
  fast; the escalated path may run ~5–7s, which is acceptable because the alternative
  is full human re-review. Escalation is flagged in the result so the UI can show a
  "running a closer check…" state. If the deep tier itself fails, the router falls back
  to the primary's low-confidence read, still flagged `escalated`, so the work reaches
  human review rather than erroring.
- **`LocalOcrExtractor`** — a **documented fallback** (e.g. Tesseract.js) that would run
  entirely on-box, answering the firewall constraint without any outbound ML call. The
  seam exists and is documented; per the assignment scope, it is intentionally **not
  fully implemented** for the prototype.

Because everything sits behind one interface, swapping cloud inference for local OCR (or
a different provider) is a one-file change with no impact on the comparison engine.

## 4. The comparison engine (the correctness core)

Pure functions in `src/lib/comparison/`, no I/O, no model judgment. Every field returns
one of `match | review | mismatch | missing` with a human-readable detail, and the
overall verdict is a worst-severity roll-up (`aggregate.ts`): any mismatch → **Fail**,
else any review/missing → **Needs Review**, else **Pass**.

- **Brand & class/type (tolerant)** — normalize (NFKD + diacritic fold, lowercase,
  strip apostrophes/possessives, punctuation → space, collapse whitespace), then a
  Levenshtein similarity ratio. Thresholds: `≥ 0.95` match, `0.80–0.95` review,
  `< 0.80` mismatch. A difference that is *only* case/punctuation/possessive resolves to
  **review** ("matches except formatting"), never a silent pass — this is the Dave /
  `STONE'S THROW` case the assignment calls out.
- **ABV (conditional on beverage type)** — the "some exceptions" rule:
  - **Spirits:** ABV always required; absent → mismatch.
  - **Wine:** "Table Wine" / "Light Wine" (7–14%) may stand in for a numeric ABV, so a
    number-less wine label can still be compliant — treated as match, not missing.
  - **Beer:** ABV generally optional; a missing ABV is not, by itself, a failure. The
    disallowed `ABV` abbreviation and non-0.1% precision are flagged.
  - Proof, when present, is cross-checked against `2 × ABV`.
- **Net contents** — parse value + unit, anchoring the number to a unit so lot codes
  can't steal the parse, normalize to millilitres (mL/cL/L; US fl oz/pt/qt/gal),
  compare within a 1% relative tolerance.
- **Government Warning (strict)** — the highest-value check. Verifies the block is
  present, that `GOVERNMENT WARNING` leads it in all caps, and that the full statement
  matches the canonical 27 CFR Part 16 text word-for-word (whitespace-normalized). On a
  mismatch it returns a word-level diff so the agent sees exactly what's wrong. The
  canonical string is a test-pinned constant (`src/lib/governmentWarning.ts`).

## 5. UX & accessibility

- One obvious screen: a four-field form + beverage-type selector + image dropzone on
  the way in; a results card with a big Pass / Needs Review / Fail banner, per-field
  rows, and the warning diff on the way out.
- Latency is surfaced ("Verified in 1.4s") to make the 5s claim visible and honest.
- Status is conveyed by **icon + text**, not color alone; semantic HTML, labels tied to
  inputs, a skip link to a focusable `<main>` landmark, visible focus states, and AA
  contrast (there is a contrast unit test, `src/lib/ui/contrast.test.ts`, plus an
  axe-core a11y test on the form). Plain language throughout: "Looks good" / "Please
  check" / "Doesn't match".

## 6. Error handling

Every failure path returns a friendly message, never a stack trace:

- Wrong file type / oversize (10 MB cap) / missing image / empty form → validated
  before any model call (400 with a readable message).
- Missing inference key → friendly 503 ("not configured… contact support"); the key
  name is never leaked.
- Model/network failure → 502 with "couldn't read the label clearly — please try again
  or upload a better photo," mirroring the current manual fallback.
- Partial extraction → the fields that were read are shown; unread fields are marked
  `missing` (which routes to Needs Review, not an auto-fail).

## 7. Tools & stack

Next.js 14 (App Router) + TypeScript on Vercel; Vitest for unit tests; ESLint + Prettier;
`tsc` in strict mode with `noUncheckedIndexedAccess`. Gemini Flash (primary vision) and
Anthropic Claude Sonnet (deep tier). No database, no state store, no auth library —
deliberately.

## 8. Assumptions

- The expected values come from a COLA application and are typed in by the agent (no
  COLA integration — out of scope).
- A label image is a reasonably legible photo or artwork; the vision model absorbs
  moderate angle/glare for free, and genuinely unreadable images escalate or are sent
  back for a better photo.
- Bold / font-size of the warning **cannot** be reliably confirmed from extracted text;
  we verify caps and wording and state the limitation honestly rather than claim a check
  we can't make.
- For the prototype, no real PII is stored — the stateless posture is sufficient; a
  production deployment would add the usual retention/PII controls.

## 9. Out of scope (stated, not forgotten)

- COLA / system integration.
- Auth, accounts, persistence, databases.
- A fully implemented offline OCR fallback (the seam + docs only).
- Production PII / retention handling (the prototype is stateless).

## 10. Known limitations & trade-offs

- **Bold/font not OCR-detectable.** Caps + wording of the Government Warning are
  verified; true bold and minimum font-size are not — surfaced as an honest note in the
  UI and here.
- **Beer ABV is treated as unconditionally optional.** Under 27 CFR, beer ABV becomes
  *required* when the beer derives alcohol from added flavors / nonbeverage ingredients
  or where state law requires it. The form has no ingredient/state input, so the engine
  cannot know this and does not fail a beer label for a missing ABV. Documented here as
  a known limitation; a production version would take that extra input.
- **Latency depends on model availability.** A retired model id (Google shut down
  `gemini-2.0-flash` on 2026-06-01) shows up as a 404; `GEMINI_MODEL` lets an operator
  swap models without a code change.
- **Next.js dependency / security advisories.** Pinned to `next@14.2.35` (2026-06-12,
  BUILD_BACKLOG T5.4 / Priority A1), which clears CVE-2025-29927 (the middleware
  auth-bypass that drove the release-blocker; patched upstream in 14.2.25). `npm audit`
  still lists a few residual `next` advisories (plus a transitive `postcss` one) whose
  only fix is `next@16`, a breaking major. None applies to this app's surface — there is
  no `middleware`, no `next/image`/Image Optimization API, no i18n config, and no
  WebSocket upgrades; it is App Router with a single stateless `/api/verify` route. The
  major upgrade to `next@16` is intentionally left as a separate, human-reviewed change
  rather than folded into an unattended slice.
- **Tolerant matching is tuned, not perfect.** The 0.80 / 0.95 similarity thresholds
  were chosen so a single-character typo on a typical brand lands in "Needs Review"
  rather than a false "Match" — erring toward a human glance over a silent pass.

## 11. What makes this defensible

The model is the part you can't fully audit, so it does the least decision-making
possible: it transcribes. Everything that determines compliance — the thresholds, the
conditional ABV rules, the strict warning comparison, the roll-up — is pure TypeScript
with a unit test pinning each behavior (220+ tests at the time of writing). That is the
core trade chosen throughout: **a clean, correct, well-tested single-label core over
ambitious-but-incomplete breadth.**
