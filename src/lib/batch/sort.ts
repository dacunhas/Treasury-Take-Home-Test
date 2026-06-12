/**
 * T4.2 — pure, stable sorting for the batch results table.
 *
 * Kept out of the React component so the ordering logic is unit-tested with no
 * DOM. The table lets the agent sort by row number, brand, image filename, or
 * the verdict; sorting NEVER mutates the input (returns a new array) and is
 * STABLE (equal keys keep their original relative order), so toggling columns is
 * predictable for a screen-reader user re-reading the table.
 */
import type { BatchRowOutcome, BatchRowStatus } from './types';

/** Columns the results table can be sorted by. */
export type SortKey = 'row' | 'brand' | 'image' | 'status';
export type SortDirection = 'asc' | 'desc';

/**
 * Verdict ordering for a meaningful "sort by result": worst first when ascending
 * is flipped — we define a severity rank so `fail`/`error` cluster together and
 * `pass` sits at the other end. (`asc` = best→worst by default below.)
 */
const STATUS_RANK: Record<BatchRowStatus, number> = {
  pass: 0,
  review: 1,
  fail: 2,
  error: 3,
};

/** The comparable key for one outcome under a given sort column. */
function sortValue(
  outcome: BatchRowOutcome,
  key: SortKey,
): number | string {
  switch (key) {
    case 'row':
      return outcome.rowNumber;
    case 'brand':
      return outcome.row.expected.brand.toLocaleLowerCase();
    case 'image':
      return (
        outcome.row.matchedFileName ?? outcome.row.imageName
      ).toLocaleLowerCase();
    case 'status':
      return STATUS_RANK[outcome.status];
    default:
      return outcome.rowNumber;
  }
}

/** Compare two values of the same kind (number or string). */
function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Return a NEW array of outcomes sorted by `key`/`direction`. Stable: ties are
 * broken by original index so the sort is deterministic and reversible.
 */
export function sortOutcomes(
  outcomes: readonly BatchRowOutcome[],
  key: SortKey,
  direction: SortDirection,
): BatchRowOutcome[] {
  const factor = direction === 'desc' ? -1 : 1;
  return outcomes
    .map((outcome, index) => ({ outcome, index }))
    .sort((x, y) => {
      const primary = compareValues(
        sortValue(x.outcome, key),
        sortValue(y.outcome, key),
      );
      if (primary !== 0) return primary * factor;
      // Stable tie-break on original position (NOT flipped by direction).
      return x.index - y.index;
    })
    .map((entry) => entry.outcome);
}
