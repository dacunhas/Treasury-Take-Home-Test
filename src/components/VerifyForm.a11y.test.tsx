// @vitest-environment jsdom
/**
 * T3.3 — automated accessibility check.
 *
 * Renders the form and a representative results view to static HTML, mounts each
 * into a real (jsdom) document, and runs the axe-core rule engine, asserting zero
 * violations. axe validates the structural a11y rules — accessible names/labels,
 * landmark/heading/table semantics, ARIA validity, roles — which is exactly what
 * a "73-year-old benchmark" screen-reader user depends on (CONTEXT §2,
 * PROJECT_PLAN §4/§8). Colour-contrast is verified separately and deterministically
 * in `src/lib/ui/contrast.test.ts` (axe cannot compute contrast under jsdom, which
 * has no layout engine), so between the two checks the a11y surface is covered.
 */
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import VerifyForm, { ResultCard } from './VerifyForm';
import type { VerificationResult } from '@/types';

const SAMPLE_RESULT: VerificationResult = {
  overall: 'review',
  latencyMs: 1820,
  escalated: true,
  fields: [
    {
      field: 'Brand name',
      expected: 'OLD TOM DISTILLERY',
      found: 'Old Tom Distillery',
      status: 'review',
      detail: 'Matches except formatting — please confirm.',
    },
    {
      field: 'Net contents',
      expected: '750 mL',
      found: '750 mL',
      status: 'match',
    },
  ],
  warning: {
    present: true,
    prefixCaps: true,
    textMatch: false,
    status: 'mismatch',
    detail: 'The warning text does not match the required statement.',
    diff: [
      { type: 'equal', text: 'GOVERNMENT WARNING:' },
      { type: 'removed', text: 'Surgeon' },
      { type: 'added', text: 'Surgeons' },
    ],
  },
};

/** Mount HTML in the jsdom document and run axe, returning its violations. */
async function axeViolations(html: string): Promise<axe.Result[]> {
  document.body.innerHTML = `<main>${html}</main>`;
  const results = await axe.run(document.body, {
    // Contrast needs layout/canvas that jsdom lacks; covered by contrast.test.ts.
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('accessibility (axe-core) — no violations', () => {
  it('the verification form passes axe', async () => {
    const violations = await axeViolations(renderToStaticMarkup(<VerifyForm />));
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  });

  it('the results view (banner + field table + warning diff) passes axe', async () => {
    const html = renderToStaticMarkup(
      <ResultCard result={SAMPLE_RESULT} sectionRef={createRef<HTMLElement>()} />,
    );
    const violations = await axeViolations(html);
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  });
});
