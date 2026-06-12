/**
 * T2.5 — Aggregate verdict.
 *
 * Combines the individual field comparisons and the Government Warning check
 * into a single overall verdict for one label. Pure & deterministic: it takes
 * the expected values (from the COLA application) and the extracted label text
 * and returns the per-field results, the warning result, and the rolled-up
 * `pass | review | fail`. No I/O, no model calls — the /api/verify route
 * (T1.3) wraps this with latency + escalation metadata.
 *
 * Rollup rule (PROJECT_PLAN §3, BUILD_BACKLOG T2.5):
 *   any FAIL  -> overall 'fail'
 *   any REVIEW (and no FAIL) -> overall 'review'
 *   else -> 'pass'
 *
 * Status -> severity mapping:
 *   match    -> pass
 *   review   -> review
 *   missing  -> review   (a field we could not read; a human / better image is
 *                         needed — flag, do not auto-fail; this tool assists)
 *   mismatch -> fail
 *
 * The Government Warning is treated more strictly, because its absence or
 * alteration is itself a compliance failure rather than merely "unread":
 *   warning match    -> pass
 *   warning review   -> review
 *   warning missing  -> fail  (mandatory warning absent — CONTEXT §5)
 *   warning mismatch -> fail  (wording/caps wrong)
 */

import type {
  ExpectedLabel,
  ExtractedLabel,
  FieldResult,
  FieldStatus,
  VerificationResult,
  WarningCheckResult,
} from '@/types';
import { compareBrand, compareClassType } from './textMatch';
import { compareAbv } from './abv';
import { compareNetContents } from './netContents';
import { checkGovernmentWarning } from './warning';

export type Overall = 'pass' | 'review' | 'fail';

/** Severity a single field status contributes to the overall verdict. */
function fieldSeverity(status: FieldStatus): Overall {
  switch (status) {
    case 'mismatch':
      return 'fail';
    case 'review':
    case 'missing':
      return 'review';
    case 'match':
      return 'pass';
  }
}

/**
 * Severity the warning contributes. Stricter than a normal field: a missing or
 * altered mandatory warning is a failure, not just something to glance at.
 */
function warningSeverity(warning: WarningCheckResult): Overall {
  switch (warning.status) {
    case 'mismatch':
    case 'missing':
      return 'fail';
    case 'review':
      return 'review';
    case 'match':
      return 'pass';
  }
}

/**
 * Roll a set of field results plus the warning result into one verdict.
 * Pure: the worst severity present wins (fail > review > pass).
 */
export function aggregateOverall(
  fields: FieldResult[],
  warning: WarningCheckResult,
): Overall {
  const severities: Overall[] = [
    ...fields.map((f) => fieldSeverity(f.status)),
    warningSeverity(warning),
  ];
  if (severities.includes('fail')) return 'fail';
  if (severities.includes('review')) return 'review';
  return 'pass';
}

/**
 * Join the extractor's separate ABV and proof strings into one value for the
 * ABV comparator, so its `proof = 2 x ABV` cross-check can fire (a real label
 * prints e.g. "45% Alc./Vol. (90 Proof)"; the extractor splits them). Returns
 * null when neither is present, so the conditional-by-beverage-type rules
 * (beer-optional / spirits-required) still apply.
 */
function combineAbv(extracted: ExtractedLabel): string | null {
  const parts = [extracted.abv, extracted.proof].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  return parts.length === 0 ? null : parts.join(' ');
}

/** What `compareLabel` returns — the deterministic core of a VerificationResult. */
export type LabelComparison = Pick<
  VerificationResult,
  'fields' | 'warning' | 'overall'
>;

/**
 * Compare a full expected label against the extracted label text and produce
 * the per-field results, warning result, and overall verdict. The single entry
 * point the API route composes around. Pure & deterministic.
 */
export function compareLabel(
  expected: ExpectedLabel,
  extracted: ExtractedLabel,
): LabelComparison {
  const fields: FieldResult[] = [
    compareBrand(expected.brand, extracted.brand),
    compareClassType(expected.classType, extracted.classType),
    compareAbv(expected.abv, combineAbv(extracted), expected.beverageType),
    compareNetContents(expected.netContents, extracted.netContents, expected.beverageType),
  ];
  const warning = checkGovernmentWarning(extracted.warningText);
  const overall = aggregateOverall(fields, warning);
  return { fields, warning, overall };
}
