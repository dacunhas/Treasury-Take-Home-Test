/**
 * Strict Government Warning check (PROJECT_PLAN.md §3 "Government Warning",
 * CONTEXT.md §5). Pure / deterministic / I-O-free — the verdict never depends on
 * the model's opinion, only on the extracted warning text.
 *
 * The check answers four things and folds them into one FieldStatus:
 *   present     — is there a warning block at all?            (missing -> fail)
 *   prefixCaps  — is "GOVERNMENT WARNING" present and UPPERCASE?
 *   textMatch   — does the full statement equal the canonical text EXACTLY
 *                 (whitespace-normalized, case-sensitive)? Note: this strict flag
 *                 stays false when only BODY letter-casing differs, yet the verdict
 *                 is still `match` — body case is not regulated; only the all-caps
 *                 "GOVERNMENT WARNING" prefix and the wording are required.
 *   diff        — a readable word-level diff vs canonical when it doesn't match.
 *
 * Honesty note (CONTEXT §5): caps + wording ARE detectable from extracted text;
 * true bold / font-size generally is NOT from OCR. Every result says so, so the
 * agent is never misled into thinking the tool verified formatting it cannot see.
 */
import type { WarningCheckResult, WarningDiffSegment } from '@/types';
import {
  GOVERNMENT_WARNING_CANONICAL,
  normalizeWarningWhitespace,
} from '@/lib/governmentWarning';

/** Honest limitation appended to passing/near results (see module header). */
const FONT_NOTE =
  'Caps and wording are verified from the text; true bold/font-size cannot be ' +
  'confirmed from an extracted-text check and should be eyeballed.';

/**
 * Word-level diff between the canonical warning (expected) and the found text,
 * using a longest-common-subsequence walk over whitespace-split tokens.
 * `removed` = present in canonical but missing from the label;
 * `added`   = present on the label but not in canonical (extra/reworded).
 * Segments coalesce consecutive tokens of the same type for readability.
 */
export function diffWarningWords(
  canonical: string,
  found: string,
): WarningDiffSegment[] {
  const a = canonical.split(' ').filter((t) => t.length > 0);
  const b = found.split(' ').filter((t) => t.length > 0);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const raw: WarningDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      raw.push({ type: 'removed', text: a[i]! });
      i++;
    } else {
      raw.push({ type: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < n) raw.push({ type: 'removed', text: a[i++]! });
  while (j < m) raw.push({ type: 'added', text: b[j++]! });

  // Coalesce runs of the same type into space-joined segments.
  const out: WarningDiffSegment[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) {
      last.text += ' ' + seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Is the "GOVERNMENT WARNING" prefix present, at the START of the block, and in
 * all capital letters? Anchored to the start: the mandatory prefix must lead the
 * statement, so a caps occurrence buried elsewhere in the text does not count.
 */
function detectPrefixCaps(normalized: string): boolean {
  const m = normalized.match(/^government\s+warning/i);
  if (!m) return false;
  return m[0] === m[0].toUpperCase();
}

/**
 * Run the strict Government Warning check against the warning text read off the
 * label. Returns a `WarningCheckResult` with present / prefixCaps / textMatch,
 * an overall FieldStatus, an optional word-level diff, and an honest detail note.
 */
export function checkGovernmentWarning(
  warningText: string | null,
): WarningCheckResult {
  const found = normalizeWarningWhitespace(warningText ?? '');

  // No warning block at all -> a hard miss (the highest-value failure mode).
  if (found === '') {
    return {
      present: false,
      prefixCaps: false,
      textMatch: false,
      status: 'missing',
      detail:
        'No Government Warning was found on the label. It is mandatory on all ' +
        'alcohol beverages at or above 0.5% ABV.',
    };
  }

  const canonical = GOVERNMENT_WARNING_CANONICAL; // already single-spaced
  const prefixCaps = detectPrefixCaps(found);
  const textMatch = found === canonical;

  // Exact, word-for-word, with the all-caps prefix -> pass.
  if (textMatch && prefixCaps) {
    return {
      present: true,
      prefixCaps: true,
      textMatch: true,
      status: 'match',
      detail: `Exact match to the required Government Warning. ${FONT_NOTE}`,
    };
  }

  // Wording is identical except for letter-casing somewhere.
  const caseInsensitiveEqual = found.toLowerCase() === canonical.toLowerCase();

  if (caseInsensitiveEqual && !prefixCaps) {
    // The classic "people reword/shrink it" sibling: right words, but the
    // mandatory "GOVERNMENT WARNING" prefix is not in all capitals -> fail.
    return {
      present: true,
      prefixCaps: false,
      textMatch: false,
      status: 'mismatch',
      detail:
        'Wording matches, but "GOVERNMENT WARNING" must appear in all capital ' +
        `letters (and bold). ${FONT_NOTE}`,
    };
  }

  if (caseInsensitiveEqual && prefixCaps) {
    // Prefix is uppercase and every word matches; only body letter-casing differs
    // (e.g. a label that prints the whole statement in ALL CAPS). Body case is NOT
    // regulated — 27 CFR Part 16 mandates only that "GOVERNMENT WARNING" be in
    // capital letters (and bold); the statement itself need only appear
    // word-for-word and legibly. So this is a clean PASS, not a review — gating on
    // body case made the check fire "needs review" on virtually every real label.
    // The standing honest caveat (bold / font-size unverifiable from text) remains.
    return {
      present: true,
      prefixCaps: true,
      textMatch: false,
      status: 'match',
      detail:
        'Matches the required Government Warning word-for-word, with ' +
        '"GOVERNMENT WARNING" capitalized. Body letter-casing differs from the ' +
        'reference text, which is acceptable (only the "GOVERNMENT WARNING" ' +
        `prefix must be capitalized). ${FONT_NOTE}`,
    };
  }

  // Genuinely different wording (reworded / shortened / extra text) -> fail,
  // with a word-level diff so the agent sees exactly what is wrong.
  return {
    present: true,
    prefixCaps,
    textMatch: false,
    status: 'mismatch',
    diff: diffWarningWords(canonical, found),
    detail: prefixCaps
      ? `The warning text does not match the required statement word-for-word. ${FONT_NOTE}`
      : `The warning text does not match, and "GOVERNMENT WARNING" is not in all ` +
        `capital letters. ${FONT_NOTE}`,
  };
}
