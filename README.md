# TTB Label Verification — Prototype

An agent-assist web tool for the U.S. Treasury / Alcohol and Tobacco Tax and Trade
Bureau (TTB). It verifies an alcohol-beverage label against the expected COLA
application data — **brand**, **class/type**, **ABV**, **net contents**, and the
mandatory **U.S. Government Health Warning** — and returns a clear per-field verdict
(Match / Needs Review / Mismatch) plus an overall status in well under five seconds.

> **It flags discrepancies for a human reviewer; it does not make compliance
> decisions.** Every output is framed that way. The hard correctness checks are pure,
> deterministic, unit-tested TypeScript — the model only *reads* the label, it never
> renders the verdict.

For the design rationale, trade-offs, assumptions, and known limitations, see
[`docs/APPROACH.md`](./docs/APPROACH.md).

---

## What it does

1. The agent enters the expected values from the application (brand, class/type, ABV,
   net contents) and picks the **beverage type** (Spirits / Wine / Beer).
2. The agent uploads the label artwork (PNG / JPEG / WebP).
3. The app extracts what is actually printed, compares it field by field, and runs a
   strict check of the Government Warning.
4. It returns per-field results with an overall **Pass / Needs Review / Fail** banner,
   a word-level diff on the warning, and the measured latency ("Verified in 1.4s").

Three-way verdicts are deliberate: **Match** (looks right), **Needs Review** (looks
right but a human should glance — e.g. `STONE'S THROW` vs `Stone's Throw`), and
**Mismatch** (doesn't match). Borderline reads are surfaced for a human, never
silently passed. See [`docs/APPROACH.md`](./docs/APPROACH.md) for why.

---

## Quick start

Requirements: Node 18+ (Node 20 recommended).

```bash
npm install
npm test          # full unit suite (220+ tests) — extractor MOCKED, NO API keys needed
npm run typecheck # tsc --noEmit
npm run lint
```

The full comparison engine (the correctness core) and its tests run with **no API
keys** — extraction is mocked in unit tests. Keys are only needed to read a real image
end to end:

```bash
cp .env.example .env.local   # then fill in the keys below
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | for live extraction | — | Gemini Flash — fast primary vision extractor. |
| `ANTHROPIC_API_KEY` | for the deep tier | — | Claude Sonnet — conditional deep-tier extractor (escalation). |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | no | `0.7` | Flash confidence below which we escalate to Sonnet. |
| `GEMINI_MODEL` | no | `gemini-3.1-flash-lite` | Override the Flash model id (e.g. if a model is retired). |
| `GEMINI_TIMEOUT_MS` | no | `9000` | Abort budget (ms) for the Flash call; headroom for heavy images. |
| `GEMINI_THINKING_LEVEL` | no | `low` | Gemini reasoning level; `low` keeps latency down. |

Keys are read only from environment variables, never logged, and never committed
(`.env.local` is gitignored; only `.env.example` — with empty placeholders — is in the
repo). A missing key fails loudly with a clear, secret-free message and surfaces to the
UI as a friendly 503, never a stack trace.

---

## Try it with the sample labels

Five ready-made labels live in [`samples/`](./samples/), covering the cases the
assignment cares about:

| File | Case | Expected verdict |
|---|---|---|
| `01-old-tom-bourbon-compliant.png` | Clean spirits (the CONTEXT §5 sample) | Pass |
| `02-old-tom-bourbon-bad-warning.png` | Title-case + reworded Government Warning | Fail (+ diff) |
| `03-cascade-summit-pale-ale-beer-no-abv.png` | Beer with no ABV statement | Pass (ABV optional) |
| `04-stones-throw-table-wine.png` | `STONE'S THROW` brand + "Table Wine" in lieu of numeric ABV | Needs Review |
| `05-old-tom-bourbon-angled-glare.png` | Tilted / glare bad photo of #1 | Pass (model-read) |

Expected values and target verdicts are in
[`samples/EXPECTED.csv`](./samples/EXPECTED.csv); the per-label walkthrough is in
[`samples/README.md`](./samples/README.md). With `npm run dev` running, enter a row's
values, upload its PNG, and confirm the verdict. The labels are also a ready batch
fixture for M4.

---

## Architecture (at a glance)

```
Browser (Next.js UI, accessible)
   │  multipart: expected values + beverage type + image
   ▼
/api/verify  (serverless route, Node runtime — route.ts + handler.ts)
   │  1. parseVerifyForm  → validate type/size/presence, read image into memory
   │  2. RoutingExtractor → Gemini Flash → (low confidence) Claude Sonnet → human
   │  3. compareLabel     → PURE, deterministic comparison engine
   │  4. return VerificationResult { fields, warning, overall, latencyMs, escalated }
   ▼
Browser renders verdict (icon + text + color, warning diff, latency)
```

- **`LabelExtractor` interface** (`src/lib/extractor/`) — the swappable inference seam.
  `GeminiExtractor` (fast primary), `SonnetExtractor` (conditional deep tier), and a
  documented `LocalOcrExtractor` fallback path answer Marcus's firewall constraint. The
  `RoutingExtractor` runs Flash, and only escalates to Sonnet when confidence is below
  threshold — protecting the 5s SLA on the common path.
- **Comparison engine** (`src/lib/comparison/`) — pure functions, no I/O, no model
  judgment: `normalize` + `textMatch` (tolerant brand/class-type), `abv` (conditional
  by beverage type), `netContents` (unit-normalized), `warning` (strict + word diff),
  `aggregate` (roll-up to pass/review/fail). This is the heavily-tested correctness core.
- **Stateless:** images and form data are held in memory for the request only —
  nothing is written to disk or a database.

A fuller walkthrough — including the firewall/local-OCR seam, the two-tier inference
rationale, accessibility approach, trade-offs, and limitations — is in
[`docs/APPROACH.md`](./docs/APPROACH.md).

---

## Project layout

```
src/
  app/
    page.tsx                 # single-label screen (server shell)
    layout.tsx, globals.css
    api/verify/
      route.ts               # POST adapter: friendly error mapping, no stack traces
      handler.ts             # transport-agnostic core (unit-tested, extractor mocked)
  components/
    VerifyForm.tsx           # client form + results card (accessible)
  lib/
    extractor/               # LabelExtractor seam: gemini, sonnet, router, types
    comparison/              # PURE engine: normalize, textMatch, abv, netContents,
                             #   warning, aggregate
    ui/                      # validateForm, imageResize/constraints, contrast, format
    config.ts                # typed, secret-free env loader
    governmentWarning.ts     # canonical 27 CFR Part 16 warning constant (test-pinned)
  types/                     # shared data shapes
samples/                     # 5 sample labels + EXPECTED.csv + generator
planning/                    # spec: CONTEXT, PROJECT_PLAN, BUILD_BACKLOG, AGENTS
PROGRESS.md / AUDIT.md / COMPLIANCE.md   # running build + review logs
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm test` | Run the unit suite once (`vitest run`) — no keys needed |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | `next lint` |
| `npm run build` | Production build |

## Deploy

Deployed on Vercel. Set `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` (and optionally
`EXTRACTION_CONFIDENCE_THRESHOLD` / `GEMINI_MODEL`) as project environment variables,
then deploy. The route uses the Node runtime (the extractors use `Buffer`/base64 and a
fetch timeout, and this keeps requests off the Edge body-size limit).

## Posture (what we do and don't do)

- **Stateless / no-PII** — images and application data are processed in memory and
  never persisted. No database, no accounts, no auth.
- **No COLA / system integration** — standalone proof-of-concept only.
- **Correctness is defensible** — the verdict comes from pure, unit-tested functions;
  the model only transcribes the label.
- **Honest about limits** — caps and wording of the warning are checked from text;
  true bold/font-size cannot be confirmed from OCR, and we say so in the UI and docs.

See [`docs/APPROACH.md`](./docs/APPROACH.md) for the full assumptions, trade-offs,
out-of-scope list, and known limitations.
