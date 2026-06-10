/**
 * Tolerant brand-name & class/type comparison (PROJECT_PLAN.md §3 "Brand name &
 * class/type", CONTEXT.md §6). Produces a `FieldResult` with one of
 * match / review / mismatch / missing and a human-readable detail.
 *
 * Thresholds (tunable with fixtures, per §3):
 *   similarity >= 0.95  -> match
 *   0.80 <= sim < 0.95  -> review   ("looks right, a human should glance")
 *   similarity < 0.80   -> mismatch
 *
 * Special rule (§3): when the strings are EQUAL only after normalization
 * (case / punctuation / possessive differences), the result is REVIEW with a
 * "matches except formatting" note — never a silent pass. This is the
 * Dave / "STONE'S THROW" human-in-the-loop case.
 */
import type { FieldResult } from '@/types';
import { normalizeText, similarityRatio } from './normalize';

export const TEXT_MATCH_THRESHOLD = 0.95;
export const TEXT_REVIEW_THRESHOLD = 0.8;

/**
 * Compare one expected text field against the value read off the label.
 * `field` is the human-facing label (e.g. "Brand", "Class/Type").
 */
export function compareTextField(
  field: string,
  expected: string,
  found: string | null,
): FieldResult {
  const expectedTrim = (expected ?? '').trim();
  const foundTrim = (found ?? '').trim();

  // Nothing read for this field -> missing (a human/better image is needed).
  if (foundTrim === '') {
    return {
      field,
      expected,
      found: found ?? null,
      status: 'missing',
      detail: `No ${field.toLowerCase()} was read from the label.`,
    };
  }

  // Exact raw match (incl. identical whitespace) -> unambiguous pass. Any
  // whitespace-only delta falls through to the formatting-review branch below.
  if (expected === found) {
    return { field, expected, found, status: 'match', detail: 'Exact match.' };
  }

  const ne = normalizeText(expectedTrim);
  const nf = normalizeText(foundTrim);

  // Equal only after normalization -> formatting-only difference -> review.
  if (ne === nf) {
    return {
      field,
      expected,
      found,
      status: 'review',
      detail: 'Matches except for formatting (case/punctuation) — please confirm.',
    };
  }

  const ratio = similarityRatio(ne, nf);
  const pct = Math.round(ratio * 100);

  if (ratio >= TEXT_MATCH_THRESHOLD) {
    return { field, expected, found, status: 'match', detail: `High similarity (${pct}%).` };
  }
  if (ratio >= TEXT_REVIEW_THRESHOLD) {
    return {
      field,
      expected,
      found,
      status: 'review',
      detail: `Similar but not identical (${pct}%) — please check.`,
    };
  }
  return {
    field,
    expected,
    found,
    status: 'mismatch',
    detail: `Does not match (${pct}% similar).`,
  };
}

/** Brand-name comparison (tolerant). */
export function compareBrand(expected: string, found: string | null): FieldResult {
  return compareTextField('Brand', expected, found);
}

/** Class/type designation comparison (tolerant). */
export function compareClassType(expected: string, found: string | null): FieldResult {
  return compareTextField('Class/Type', expected, found);
}
