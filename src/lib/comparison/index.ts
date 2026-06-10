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
