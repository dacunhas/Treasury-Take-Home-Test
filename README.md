# TTB Label Verification — Prototype

Agent-assist web tool that verifies an alcohol beverage label against the expected
COLA application data: brand, class/type, ABV, net contents, and the mandatory
U.S. Government Health Warning. It **flags discrepancies for a human reviewer**;
it does not make compliance decisions.

> Status: scaffold (M0). See `planning/` for the full spec, build backlog, and
> progress log.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel.
- Pure, deterministic, unit-tested comparison engine (the correctness core).
- Two-tier inference behind a `LabelExtractor` interface: Gemini Flash (fast
  primary) → Claude Sonnet (conditional deep tier) → human review.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in keys for live extraction (optional for tests)
npm test                     # unit tests (extractor mocked; no keys needed)
npm run typecheck
npm run dev                  # http://localhost:3000
```

## Posture

- **Stateless / no-PII:** images and form data are processed in memory; nothing is
  persisted to disk or a database.
- **Firewall seam:** inference sits behind a swappable `LabelExtractor`; a
  local/offline OCR fallback (e.g. Tesseract) is documented as the answer to
  outbound-ML network restrictions.
- **Secrets:** API keys are read only from environment variables, never committed
  or logged. See `.env.example`.

Full architecture, trade-offs, assumptions, and out-of-scope items are documented
as the build progresses (see `planning/PROJECT_PLAN.md`).
