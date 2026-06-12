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
 * Formatting-only rule (Steve decision 2026-06-12, BACKLOG D1): when the strings
 * are EQUAL after normalization — i.e. they differ ONLY in case, punctuation,
 * possessives, accents (é -> e), or whitespace — brand and class/type resolve to
 * a clean `match` (not `review`). The "STONE'S THROW" vs "Stone's Throw" and
 * "Café" vs "Cafe" cases are the same product, so flagging them for human review
 * was noise. Genuinely uncertain cases (similarity 0.80–0.95) still go to
 * `review`; only an exact-after-normalization equality is auto-matched here.
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

  // Exact raw match (incl. identical whitespace) -> unambiguous pass.
  if (expected === found) {
    return { field, expected, found, status: 'match', detail: 'Exact match.' };
  }

  const ne = normalizeText(expectedTrim);
  const nf = normalizeText(foundTrim);

  // Equal after normalization -> the difference is ONLY case / punctuation /
  // possessive / accent / whitespace. Per the D1 decision these are the same
  // value, so resolve to a clean match (with a note on what was ignored).
  if (ne === nf) {
    return {
      field,
      expected,
      found,
      status: 'match',
      detail: 'Matches (ignoring case, punctuation, and accents).',
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
