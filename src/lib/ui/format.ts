/**
 * T3.1 — pure presentation helpers for the single-label verification UI.
 *
 * These are deliberately I/O-free and framework-free so they can be unit-tested
 * under the existing `node` vitest environment (no DOM / testing-library
 * dependency added). The React component in `src/components/VerifyForm.tsx`
 * consumes them; status is always conveyed by BOTH a word and a text glyph (never
 * color alone) to satisfy the accessibility bar (CONTEXT §2, PROJECT_PLAN §4).
 */
import type { FieldStatus } from '@/types';
import type { Overall } from '@/lib/comparison';

/** How an overall verdict is presented: plain language + a non-color cue. */
export interface OverallPresentation {
  /** Plain-language label ("Looks good" / "Please check" / "Doesn't match"). */
  label: string;
  /** Text glyph so the status is not conveyed by color alone. */
  glyph: string;
  /** A short one-line explanation under the banner. */
  summary: string;
  /** Accessible background/foreground tokens (AA contrast pairs). */
  bg: string;
  fg: string;
}

/** Plain-language, color-independent presentation per overall verdict. */
export const OVERALL_PRESENTATION: Record<Overall, OverallPresentation> = {
  pass: {
    label: 'Looks good',
    glyph: '✔', // heavy check mark
    summary: 'Every field matched the expected application data.',
    bg: '#e7f4e8',
    fg: '#0f5d2a',
  },
  review: {
    label: 'Please check',
    glyph: '⚠', // warning sign
    summary: 'One or more fields need a human to take a closer look.',
    bg: '#fdf4e3',
    fg: '#7a4f01',
  },
  fail: {
    label: "Doesn't match",
    glyph: '✖', // heavy multiplication x
    summary:
      'At least one field does not match — please review before approving.',
    bg: '#fbe9e9',
    fg: '#8a1c1c',
  },
};

/** How a single field status is presented. */
export interface FieldStatusPresentation {
  label: string;
  glyph: string;
  fg: string;
}

/** Plain-language, color-independent presentation per field status. */
export const FIELD_STATUS_PRESENTATION: Record<
  FieldStatus,
  FieldStatusPresentation
> = {
  match: { label: 'Match', glyph: '✔', fg: '#0f5d2a' },
  review: { label: 'Needs review', glyph: '⚠', fg: '#7a4f01' },
  mismatch: { label: 'Mismatch', glyph: '✖', fg: '#8a1c1c' },
  missing: { label: 'Not found on label', glyph: '—', fg: '#5a4a00' },
};

/**
 * Format a measured latency (ms) as the "Verified in N.Ns" seconds value the UI
 * surfaces to prove the 5s claim. Always one decimal place; never negative or
 * NaN (a clock skew or bad value floors at 0.0).
 */
export function formatLatencySeconds(latencyMs: number): string {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return '0.0';
  return (latencyMs / 1000).toFixed(1);
}

/** Full "Verified in 3.2s" sentence (with the escalation note when applicable). */
export function formatVerifiedLine(
  latencyMs: number,
  escalated?: boolean,
): string {
  const seconds = formatLatencySeconds(latencyMs);
  const base = `Verified in ${seconds}s`;
  return escalated ? `${base} (a closer check was run)` : base;
}

/** Presentation for an overall verdict, with a safe fallback for bad input. */
export function overallPresentation(overall: Overall): OverallPresentation {
  return OVERALL_PRESENTATION[overall] ?? OVERALL_PRESENTATION.review;
}

/** Presentation for a field status, with a safe fallback for bad input. */
export function fieldStatusPresentation(
  status: FieldStatus,
): FieldStatusPresentation {
  return FIELD_STATUS_PRESENTATION[status] ?? FIELD_STATUS_PRESENTATION.review;
}
