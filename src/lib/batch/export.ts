/**
 * T4.2 — serialize batch outcomes to a results CSV the agent can download.
 *
 * Pure and I/O-free (no DOM, no Blob, no `document`): it returns the CSV TEXT so
 * it runs under the fast `node` vitest env and is exhaustively unit-testable. The
 * React `BatchForm` wraps the returned string in a Blob and triggers the download
 * — keeping the load-bearing formatting logic out of the component, consistent
 * with how the rest of the batch core is structured (csv/match/process are pure).
 *
 * The export mirrors the single-label output (T4.2 acceptance "row detail matches
 * single-label output"): one row per processed label carrying the expected
 * values, the overall verdict, the measured latency, the escalation flag, and a
 * compact per-field status breakdown (incl. the Government Warning) so a verdict
 * is auditable from the spreadsheet alone. Error rows carry their friendly,
 * secret-free reason in the Note column.
 */
import type { BatchRowOutcome } from './types';
import type { FieldResult } from '@/types';
import { formatLatencySeconds, overallPresentation } from '@/lib/ui/format';

/** Human-facing header row of the results CSV (stable column order). */
export const RESULTS_CSV_HEADER = [
  'Row',
  'Brand',
  'Class/Type',
  'ABV',
  'Net Contents',
  'Beverage Type',
  'Image',
  'Result',
  'Verified in (s)',
  'Closer check',
  'Field results',
  'Note',
] as const;

/** Plain-language label for an outcome status, reused from the UI presentation. */
function resultLabel(status: BatchRowOutcome['status']): string {
  if (status === 'error') return 'Could not verify';
  // pass/review/fail share the single-label overall wording.
  return overallPresentation(status).label;
}

/**
 * Compact "Brand: Match; Class/Type: Match; …; Government Warning: Match"
 * breakdown for the export's Field results column. Mirrors what the single-label
 * ResultCard shows, flattened to one cell.
 */
function fieldBreakdown(outcome: BatchRowOutcome): string {
  if (!outcome.result) return '';
  const parts = outcome.result.fields.map(
    (f: FieldResult) => `${f.field}: ${statusWord(f.status)}`,
  );
  parts.push(`Government Warning: ${statusWord(outcome.result.warning.status)}`);
  return parts.join('; ');
}

/** Title-case a FieldStatus for the flattened breakdown cell. */
function statusWord(status: FieldResult['status']): string {
  switch (status) {
    case 'match':
      return 'Match';
    case 'review':
      return 'Review';
    case 'mismatch':
      return 'Mismatch';
    case 'missing':
      return 'Not found';
    default:
      return status;
  }
}

/** RFC-4180 escape: quote a cell when it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  // Defensive at the trust boundary: callers always pass strings (tsc-checked),
  // but coercing here means a future caller can never throw on `.replace`.
  const cell = String(value ?? '');
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Build one CSV data row (array of raw, unescaped cell strings). */
function rowCells(outcome: BatchRowOutcome): string[] {
  const e = outcome.row.expected;
  const verifiedIn = outcome.result
    ? formatLatencySeconds(outcome.result.latencyMs)
    : '';
  const closerCheck = outcome.result?.escalated ? 'yes' : '';
  return [
    String(outcome.rowNumber),
    e.brand,
    e.classType,
    e.abv,
    e.netContents,
    e.beverageType,
    outcome.row.matchedFileName ?? outcome.row.imageName,
    resultLabel(outcome.status),
    verifiedIn,
    closerCheck,
    fieldBreakdown(outcome),
    outcome.status === 'error' ? (outcome.error ?? '') : '',
  ];
}

/**
 * Serialize the batch outcomes to a results CSV string (CRLF line endings, the
 * RFC-4180 default Excel/Sheets expect). Always emits the header, even for an
 * empty batch, so a downloaded file is never blank/ambiguous.
 */
export function outcomesToCsv(outcomes: readonly BatchRowOutcome[]): string {
  const lines: string[] = [];
  lines.push(RESULTS_CSV_HEADER.map(csvCell).join(','));
  for (const outcome of outcomes) {
    lines.push(rowCells(outcome).map(csvCell).join(','));
  }
  return lines.join('\r\n');
}
