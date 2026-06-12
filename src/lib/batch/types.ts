/**
 * T4.1 — shared types for batch-mode label verification.
 *
 * Batch mode lets an importer drop a CSV of expected values (one row per label,
 * Seattle/Janet's "200-300 at once" case in CONTEXT §3) plus the matching label
 * images, and get a per-row verdict. The pieces are deliberately split into
 * small, pure modules so the batch core is unit-testable with NO model call and
 * NO DOM:
 *   - `csv.ts`     parse + per-row validate the expected-values CSV
 *   - `match.ts`   pair each row with an uploaded image by filename
 *   - `process.ts` run each row through an injected verifier with per-row error
 *                  isolation (one bad row never fails the batch)
 *
 * The React `BatchForm` is thin glue over these: it supplies a verifier that
 * POSTs to the existing, already-tested `/api/verify` route (so the server stays
 * stateless and the single-label correctness core is reused unchanged).
 */
import type { BeverageType, VerificationResult } from '@/types';

/**
 * The expected values for one label, as raw strings read from a CSV cell.
 * Mirrors `ExpectedLabel` but every field is the unparsed string so the row can
 * be surfaced verbatim in the results table even when it failed validation.
 * `abv` is optional/conditional by beverage type (CONTEXT §5), exactly as the
 * single-label form treats it.
 */
export interface BatchExpectedInput {
  brand: string;
  classType: string;
  abv: string;
  netContents: string;
  /** Lower-cased + validated against `BeverageType`; '' when absent/invalid. */
  beverageType: string;
}

/** One parsed CSV data row (header excluded). */
export interface BatchRow {
  /** 1-based data-row number (the header is not counted), for the table + errors. */
  rowNumber: number;
  expected: BatchExpectedInput;
  /** The image filename this row references (from the image/filename column). */
  imageName: string;
  /**
   * Per-row validation problems (missing required field, bad beverage type).
   * Empty means the row is well-formed and ready to be matched + verified. A row
   * with errors is still returned so the table can show it — it is NOT dropped.
   */
  errors: string[];
}

/** Result of parsing the whole CSV. */
export interface ParsedBatchCsv {
  rows: BatchRow[];
  /**
   * A fatal, whole-file problem (empty file, no header, no recognizable columns,
   * no data rows). When set, `rows` is empty and the UI shows this single message
   * instead of an empty table.
   */
  headerError?: string;
}

/** A row after image matching: carries the resolved uploaded filename (or null). */
export interface MatchedBatchRow extends BatchRow {
  /** The uploaded file's name this row resolved to, or null when unmatched. */
  matchedFileName: string | null;
}

/** Outcome of matching parsed rows against the set of uploaded image filenames. */
export interface BatchMatch {
  rows: MatchedBatchRow[];
  /** Uploaded filenames not referenced by any row (surfaced as a gentle notice). */
  unusedFiles: string[];
}

/** Per-row terminal status in the results table. `error` = could not verify. */
export type BatchRowStatus = 'pass' | 'review' | 'fail' | 'error';

/** The verdict (or error) for one processed row. */
export interface BatchRowOutcome {
  rowNumber: number;
  row: MatchedBatchRow;
  status: BatchRowStatus;
  /** The full verification result when the row was verified (status != 'error'). */
  result?: VerificationResult;
  /** A friendly, secret-free message when the row could not be verified. */
  error?: string;
}

/** Progress tick emitted after each row settles. */
export interface BatchProgress {
  completed: number;
  total: number;
}

/** Re-export for convenience so callers can `import type { BeverageType }`. */
export type { BeverageType, VerificationResult };
