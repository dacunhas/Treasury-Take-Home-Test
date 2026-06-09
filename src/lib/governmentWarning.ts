/**
 * Canonical U.S. Government Health Warning (27 CFR Part 16), verbatim per
 * planning/CONTEXT.md §5. Stored as one continuous statement.
 *
 * Formatting rule (verified against eCFR / TTB):
 *  - "GOVERNMENT WARNING" (and the colon in practice) must be CAPITAL + BOLD.
 *  - The remainder must NOT be bold.
 *  - Caps + wording are detectable from extracted text; true bold/font-size
 *    generally is not from OCR — the warning check states this honestly.
 */
export const GOVERNMENT_WARNING_CANONICAL =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not ' +
  'drink alcoholic beverages during pregnancy because of the risk of birth ' +
  'defects. (2) Consumption of alcoholic beverages impairs your ability to ' +
  'drive a car or operate machinery, and may cause health problems.';

/** The required all-caps prefix that must appear verbatim and uppercase. */
export const GOVERNMENT_WARNING_PREFIX = 'GOVERNMENT WARNING:';

/**
 * Collapse all runs of whitespace to a single space and trim. Used to compare
 * warning text word-for-word while ignoring line wrapping / spacing artifacts.
 */
export function normalizeWarningWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
