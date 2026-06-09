# CONTEXT — TTB Label Verification Prototype

> Read this first. It is the single source of truth for any agent or contributor
> working on this project. It captures the domain, the requirements (including the
> ones hidden inside stakeholder interviews), the locked decisions, and the facts
> you must not get wrong.

## 1. What we are building

A standalone web prototype for the U.S. Treasury / Alcohol and Tobacco Tax and
Trade Bureau (TTB) that helps a compliance agent **verify an alcohol beverage
label against the expected application data**.

Workflow (single label):
1. Agent enters the expected field values (brand name, class/type, ABV, net
   contents) — the data that would come from a COLA application.
2. Agent uploads the label artwork (image).
3. App extracts what is actually printed on the label and **compares** it field
   by field, plus checks the mandatory Government Health Warning.
4. App returns a clear per-field verdict (Match / Mismatch / Needs Review) and an
   overall status, in well under 5 seconds.

This is an **agent-assist tool, not an adjudicator**. It flags; a human decides.
Frame every output that way.

## 2. Who it's for (and why that shapes the build)

- TTB reviews ~150,000 label applications/year with ~47 agents. Most of the work
  is rote matching ("is the number on the form the same as the number on the
  label").
- Users span a huge tech-comfort range. Design benchmark from the stakeholder:
  **"something my 73-year-old mother could figure out."** Clean, obvious, large
  targets, no hunting for buttons.
- Half the team is over 50. Accessibility is a graded requirement, not polish.

## 3. Requirements — including the seeded ones

The assignment's "interview notes" are the rubric in disguise. Each bullet below
maps to a real evaluation criterion. Treat them as requirements.

| Requirement | Source | Why it matters |
|---|---|---|
| **~5 second response ceiling** | Sarah: prior vendor took 30–40s, agents abandoned it. "If we can't get results back in about 5 seconds, nobody's going to use it." | Hard non-functional requirement. Single-shot model call, structured output, show measured latency. |
| **Exact Government Warning check** | Jenny: must be word-for-word; "GOVERNMENT WARNING:" must be ALL CAPS and bold. People shrink it, reword it, bury it. | Highest-value correctness check. Strict, not fuzzy. See §5. |
| **Tolerant brand-name matching** | Dave: "STONE'S THROW" on label vs "Stone's Throw" in app is the same thing — "you need judgment." | Brand/class/type matching must normalize case, punctuation, possessives, whitespace and flag borderline cases as **Needs Review**, not hard-reject. |
| **Batch uploads** | Sarah + Janet (Seattle): importers dump 200–300 applications at once; processed one at a time today. | Build a batch mode: CSV of expected values + multiple images, results table. |
| **Accessibility / simplicity** | Sarah ("my mother"), Dave (low tech comfort) | Large fonts, high contrast, keyboard navigable, status conveyed by icon+text not color alone. |
| **Bad-photo tolerance** (nice-to-have) | Jenny: labels shot at angles, glare, poor lighting | A vision model handles much of this for free. Don't over-invest; note as handled-by-model. |
| **Firewall / no reliance on blocked cloud ML** (design concern) | Marcus: network blocks outbound ML endpoints; killed the last vendor pilot | Put inference behind a swappable interface; document a local fallback path. See §4. |
| **Don't store sensitive data** | Marcus: PII/retention concerns; "we're not storing anything sensitive for this exercise" | Stateless: process in memory, don't persist uploaded images or application data. Say so in the README. |
| **No COLA integration** | Marcus: out of scope; standalone proof-of-concept | Don't attempt system integration. Standalone app only. |

## 4. Locked technical decisions

- **Stack:** Next.js (App Router) + TypeScript, deployed on **Vercel** → public URL.
  One codebase, serverless API route for the model call, easy accessible UI.
- **Inference (two tiers + human):** **Gemini Flash** (vision) is the fast primary
  extractor — ~1–3s, good for the 5s budget and bad photos. **Claude Sonnet**
  (vision) is a conditional deep tier, invoked ONLY when Flash returns low
  confidence / ambiguous extraction (NOT on every label — sequential-always would
  blow the 5s budget). Anything still uncertain after Sonnet → human review.
  Routing pipeline: **Flash → (conditional) Sonnet → human**. Flash carries the 5s
  SLA on the common path; escalated cases may run ~5–7s and that is acceptable
  because the alternative is human re-review. UI shows a "running a closer check…"
  state when escalating.
- **Swappable extractor:** a `LabelExtractor` interface with both the Gemini and
  Sonnet impls behind it (escalation is just routing). README documents a
  local/offline OCR fallback (e.g. Tesseract) as the answer to Marcus's firewall
  constraint. We are NOT required to fully implement the OCR fallback for the
  prototype, but the seam must exist and be documented.
- **Extractor must return a confidence signal** so the Flash→Sonnet escalation
  trigger is explicit, not guessed.
- **Comparison logic is pure, deterministic, unit-tested TypeScript.** The model
  only extracts text → the verdict logic does not depend on model judgment. This is
  what makes correctness defensible.
- **Stateless / no DB.** Nothing persisted. Files held in memory for the request.
- **Input model:** single = form + image; batch = CSV + multiple images.
- **Beverage type drives ABV validation.** Form has a beverage-type selector
  (Spirits / Wine / Beer). The ABV check is conditional — see §5. The Government
  Warning check is universal across all three types.
- **Repo / accounts:** Steve's personal GitHub account, new repo. Gemini API key
  available (Steve has it). Sonnet via Anthropic API key.

## 5. Facts you must not get wrong

### The Government Health Warning (27 CFR Part 16)

Exact required text (one continuous statement):

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink
alcoholic beverages during pregnancy because of the risk of birth defects.
(2) Consumption of alcoholic beverages impairs your ability to drive a car or
operate machinery, and may cause health problems.
```

Formatting rule (verified against eCFR / TTB):
- The words **"GOVERNMENT WARNING"** (and the colon in practice) must appear in
  **capital letters and bold**.
- The **remainder must NOT be bold**.
- Required on all alcohol beverages ≥ 0.5% ABV for U.S. sale/distribution.

Store the canonical string as a constant. The warning check should:
1. Detect the "GOVERNMENT WARNING:" prefix and that it is uppercase.
2. Compare the full statement to the canonical text (normalize whitespace; the
   text itself must match word-for-word).
3. Surface a readable **diff** when it doesn't match, so the agent sees exactly
   what's wrong.
4. Note the bold/caps requirement; caps is detectable from extracted text, true
   bold/font-size generally is not from OCR — state this limitation honestly.

### Alcohol-content (ABV) statement — rules differ by beverage type

This is the "some exceptions" line in the assignment. The ABV check MUST be
conditional on beverage type, or we will wrongly fail compliant beer/wine labels.

- **Distilled spirits:** ABV ("% Alc./Vol.") is **always required**. Proof
  optional, shown in parentheses, and should equal 2 × ABV when present.
- **Wine:** numeric ABV required, **except** table wine (7–14% ABV) may state
  **"Table Wine"** or **"Light Wine"** *in lieu of* a numeric ABV. So a wine label
  with no number can still be compliant — treat as Match/Review, not Missing.
- **Beer / malt beverages:** ABV statement is **generally optional** (unless state
  law requires/prohibits it, or the beer contains alcohol from added
  flavors/nonbeverage ingredients, in which case it's required). Must be to the
  nearest 0.1%, and the abbreviation **"ABV" is NOT allowed** — must be spelled out
  (e.g. "Alcohol by Volume" / "Alc. by Vol."). A missing ABV on beer is not, by
  itself, a failure.

Engine behavior: if the expected value is blank/absent and the beverage type
permits omission (beer, or wine labeled "Table Wine"), do not fail the field.

### TTB label elements (common across beer/wine/spirits)

Brand name; class/type designation; alcohol content (some wine/beer exceptions);
net contents; name & address of bottler/producer; country of origin (imports);
the Government Warning (mandatory on all). The prototype focuses on brand,
class/type, ABV, net contents, and the warning.

### Sample label fields (from the assignment)

- Brand: "OLD TOM DISTILLERY"
- Class/Type: "Kentucky Straight Bourbon Whiskey"
- Alcohol Content: "45% Alc./Vol. (90 Proof)"
- Net Contents: "750 mL"
- Government Warning: [standard text above]

## 6. Field comparison rules (summary — full spec in PROJECT_PLAN.md)

- **Brand name / class-type:** normalize (lowercase, strip punctuation &
  possessives, collapse whitespace) → similarity score → Match / Needs Review /
  Mismatch by threshold.
- **ABV:** parse the numeric percentage; compare with small tolerance; cross-check
  proof = 2 × ABV when present.
- **Net contents:** normalize units (mL/L, fl oz), compare numeric value.
- **Government Warning:** strict, per §5.

## 7. Guardrails

- This is a prototype / proof-of-concept. Prefer a **clean working core over
  ambitious-but-incomplete** features (the assignment says so explicitly).
- Don't claim the tool makes compliance decisions. It assists.
- Don't persist user data. Don't add auth, accounts, or a database.
- Every limitation/trade-off goes in the README honestly — that's graded.

## 8. Deliverables (what "done" means)

1. GitHub repo: all source, README (setup + run), approach/tools/assumptions doc.
2. Deployed, testable URL (Vercel).
3. Submit via the Treasury form linked in the application email by **Mon 6/15 PM**.

## Sources

- [eCFR 27 CFR Part 16 — Alcoholic Beverage Health Warning Statement](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16)
- [TTB — Distilled Spirits Labeling: Health Warning Statement](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning)
