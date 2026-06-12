/**
 * T4.1 — run a matched batch through an injected verifier with per-row error
 * isolation. THIS is the "one bad row doesn't fail the batch" guarantee
 * (T4.1 acceptance).
 *
 * Pure orchestration: the actual verification is injected as `verifyRow`, so:
 *   - unit tests pass a synchronous fake (NO model, NO network);
 *   - the React `BatchForm` passes a real verifier that POSTs the row's expected
 *     values + its image to the existing `/api/verify` route.
 * The processor never imports the extractor, fetch, or any DOM type — it is
 * generic over the per-row image payload `F`.
 *
 * Behaviour:
 *   - A row that failed CSV validation or image matching (non-empty `errors`, or
 *     `matchedFileName === null`) becomes an `error` outcome WITHOUT calling the
 *     verifier — there is nothing valid to send.
 *   - Otherwise `verifyRow` is awaited inside a try/catch; a rejection becomes an
 *     `error` outcome carrying a friendly, secret-free message, and the batch
 *     continues.
 *   - `onProgress` fires once per settled row so the UI can show a progress bar.
 *   - A small concurrency pool (default 3) keeps large imports responsive without
 *     hammering the model tier; outcomes are returned in the original row order
 *     regardless of completion order, so the table is stable.
 */
import type {
  BatchProgress,
  BatchRowOutcome,
  MatchedBatchRow,
  VerificationResult,
} from './types';

/** Resolve the per-row image payload (e.g. a File) for a matched filename. */
export type ImageResolver<F> = (fileName: string) => F | undefined;

/** Verify one row's expected values against its image payload. */
export type RowVerifier<F> = (
  row: MatchedBatchRow,
  image: F,
) => Promise<VerificationResult>;

export interface RunBatchOptions<F> {
  resolveImage: ImageResolver<F>;
  verifyRow: RowVerifier<F>;
  onProgress?: (progress: BatchProgress) => void;
  /** Max rows verified at once. Clamped to >= 1. Default 3. */
  concurrency?: number;
}

/** Turn an unknown thrown value into a friendly, secret-free message. */
function friendlyMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'This row could not be verified. Please try it again on its own.';
}

async function processOne<F>(
  row: MatchedBatchRow,
  opts: RunBatchOptions<F>,
): Promise<BatchRowOutcome> {
  // Skip rows we already know we can't verify — no wasted model call.
  if (row.errors.length > 0 || row.matchedFileName === null) {
    const reason =
      row.errors.length > 0
        ? row.errors.join('; ')
        : 'no image was matched to this row';
    return { rowNumber: row.rowNumber, row, status: 'error', error: reason };
  }

  const image = opts.resolveImage(row.matchedFileName);
  if (image === undefined) {
    return {
      rowNumber: row.rowNumber,
      row,
      status: 'error',
      error: `the image "${row.matchedFileName}" was not available to process`,
    };
  }

  try {
    const result = await opts.verifyRow(row, image);
    return { rowNumber: row.rowNumber, row, status: result.overall, result };
  } catch (err) {
    return {
      rowNumber: row.rowNumber,
      row,
      status: 'error',
      error: friendlyMessage(err),
    };
  }
}

/**
 * Process all rows. Returns outcomes in the SAME order as `rows`. Never rejects:
 * every per-row failure is captured as an `error` outcome.
 */
export async function runBatch<F>(
  rows: readonly MatchedBatchRow[],
  opts: RunBatchOptions<F>,
): Promise<BatchRowOutcome[]> {
  const total = rows.length;
  const outcomes = new Array<BatchRowOutcome>(total);
  let completed = 0;
  let next = 0;
  const limit = Math.max(1, Math.floor(opts.concurrency ?? 3));

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      const row = rows[i];
      if (!row) return;
      outcomes[i] = await processOne(row, opts);
      completed++;
      opts.onProgress?.({ completed, total });
    }
  };

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, total); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return outcomes;
}

/** Count outcomes by status for the results summary line. */
export function summarizeOutcomes(
  outcomes: readonly BatchRowOutcome[],
): Record<'pass' | 'review' | 'fail' | 'error', number> {
  const tally = { pass: 0, review: 0, fail: 0, error: 0 };
  for (const o of outcomes) tally[o.status]++;
  return tally;
}
