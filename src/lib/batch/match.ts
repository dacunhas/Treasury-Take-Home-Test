/**
 * T4.1 — pair each parsed CSV row with an uploaded image by filename.
 *
 * "Match by filename or column" (BACKLOG T4.1): the CSV's image column names the
 * file; we resolve it against the set of uploaded filenames. Pure + DOM-free
 * (takes a plain `string[]` of filenames), so it is fully unit-testable.
 *
 * Matching is tolerant because spreadsheets and file pickers disagree on case
 * and paths:
 *   1. exact, case-insensitive basename match ("Label_1.PNG" == "label_1.png");
 *   2. else, if the CSV cell omitted the extension, match a file whose basename
 *      without extension equals it ("label_1" matches "label_1.jpg").
 * A row that already failed CSV validation, or that names a file we did not
 * receive, gets `matchedFileName: null` and a friendly per-row error — it never
 * aborts the batch. Two rows may legitimately reference the same image, so a
 * file is not "consumed" on match; `unusedFiles` reports images no row used.
 */
import type { BatchMatch, BatchRow, MatchedBatchRow } from './types';

/** Strip any directory prefix a browser/OS may include, keep the basename. */
function basename(name: string): string {
  const cleaned = name.replace(/\\/g, '/');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] ?? cleaned;
}

/** Lower-cased basename for case-insensitive comparison. */
function normalizeName(name: string): string {
  return basename(name).trim().toLowerCase();
}

/** Remove a single trailing extension (".png", ".jpeg") if present. */
function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Resolve each row's `imageName` to one of `fileNames`. Returns matched rows in
 * the same order plus the list of uploaded files no row referenced.
 */
export function matchRowsToFiles(
  rows: readonly BatchRow[],
  fileNames: readonly string[],
): BatchMatch {
  // Build lookup maps once. Later duplicates do not overwrite earlier files, so
  // matching is deterministic on the first upload with a given (normalized) name.
  const byFullName = new Map<string, string>();
  const byStem = new Map<string, string>();
  for (const original of fileNames) {
    const norm = normalizeName(original);
    if (!byFullName.has(norm)) byFullName.set(norm, original);
    const stem = stripExt(norm);
    if (!byStem.has(stem)) byStem.set(stem, original);
  }

  const usedFiles = new Set<string>();
  const matchedRows: MatchedBatchRow[] = rows.map((row) => {
    if (!row.imageName) {
      // CSV validation already recorded "missing image filename"; just carry it.
      return { ...row, matchedFileName: null };
    }
    const norm = normalizeName(row.imageName);
    let match = byFullName.get(norm);
    if (!match) {
      // The cell may have omitted the extension.
      match = byStem.get(stripExt(norm));
    }
    if (match) {
      usedFiles.add(match);
      return { ...row, matchedFileName: match };
    }
    return {
      ...row,
      matchedFileName: null,
      errors: [
        ...row.errors,
        `no uploaded image named "${row.imageName}" was found`,
      ],
    };
  });

  const unusedFiles = fileNames.filter((name) => !usedFiles.has(name));

  return { rows: matchedRows, unusedFiles };
}
