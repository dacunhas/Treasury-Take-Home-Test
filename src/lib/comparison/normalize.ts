/**
 * Text normalization + similarity scoring for the comparison engine
 * (PROJECT_PLAN.md §3, CONTEXT.md §6).
 *
 * These are PURE, deterministic, I/O-free helpers. The verdict logic never
 * depends on the model's opinion — only on extracted text run through here.
 * Brand name and class/type matching must tolerate case, punctuation,
 * possessives and whitespace differences (Dave's "STONE'S THROW" == "Stone's
 * Throw" judgment case) while still flagging genuinely different text.
 */

/**
 * Canonicalize a label string for tolerant comparison:
 *  - NFKD + combining-mark strip (fold compatibility forms, full-width,
 *    ligatures, and diacritics so "café" == "cafe")
 *  - lowercase
 *  - remove apostrophes / possessive markers so "Stone's" == "Stones"
 *    (straight ', curly ' ', modifier-letter apostrophe, backtick)
 *  - replace every other punctuation/symbol run with a space
 *  - collapse whitespace and trim
 *
 * Diacritic folding IS applied (real TTB brands use Crème / Forêt / Köstritzer);
 * an accented letter is folded to its base form rather than dropped to a space.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // fold diacritics: café -> cafe, Schön -> schon
    .toLowerCase()
    .replace(/['‘’ʼ`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein edit distance (two-row DP, O(min(m,n)) memory). Deterministic.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  let curr: number[] = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n] ?? 0;
}

/**
 * Similarity ratio in [0, 1]: 1 = identical, 0 = nothing in common.
 * ratio = 1 - distance / max(len). Two empty strings score 1.
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
