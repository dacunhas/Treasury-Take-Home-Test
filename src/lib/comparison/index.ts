/** Comparison engine public surface (deterministic, pure). */
export {
  normalizeText,
  levenshtein,
  similarityRatio,
} from './normalize';
export {
  compareTextField,
  compareBrand,
  compareClassType,
  TEXT_MATCH_THRESHOLD,
  TEXT_REVIEW_THRESHOLD,
} from './textMatch';
export { compareAbv, parseAbv } from './abv';
export type { AbvCompareOptions, ParsedAbv } from './abv';
export { compareNetContents, parseNetContents } from './netContents';
export type { NetContentsCompareOptions, ParsedNetContents } from './netContents';
export { checkGovernmentWarning, diffWarningWords } from './warning';
export { aggregateOverall, compareLabel } from './aggregate';
export type { Overall, LabelComparison } from './aggregate';
