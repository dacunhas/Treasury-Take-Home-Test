/**
 * T4.1 — public surface for the batch-mode core. Keeping the barrel small makes
 * the seam between the pure core (csv/match/process) and the React `BatchForm`
 * explicit: the component imports only from here.
 */
export { parseBatchCsv } from './csv';
export { matchRowsToFiles } from './match';
export {
  runBatch,
  summarizeOutcomes,
  type ImageResolver,
  type RowVerifier,
  type RunBatchOptions,
} from './process';
export { toVerifyFields } from './fields';
export { outcomesToCsv, RESULTS_CSV_HEADER } from './export';
export {
  sortOutcomes,
  type SortKey,
  type SortDirection,
} from './sort';
export type {
  BatchExpectedInput,
  BatchRow,
  ParsedBatchCsv,
  MatchedBatchRow,
  BatchMatch,
  BatchRowStatus,
  BatchRowOutcome,
  BatchProgress,
} from './types';
