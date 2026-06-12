/**
 * Batch CSV template (Steve request 2026-06-12): a downloadable, correctly-shaped
 * starter CSV so an importer never has to guess the column format. Mirrors the
 * single-label form fields and is intentionally consumable by `parseBatchCsv`
 * unchanged — the header names are accepted aliases and the example rows pass
 * per-row validation (proven in template.test.ts).
 *
 * Pure & I/O-free (returns the CSV TEXT): the React `BatchForm` wraps it in a
 * Blob and triggers the download, consistent with `outcomesToCsv` (export.ts).
 *
 * `image` is the filename the row maps to (matched case-insensitively, with or
 * without extension). `abv` is intentionally LEFT BLANK on the beer example to
 * show it is optional for beer / table wine (CONTEXT §5).
 */

/** Header columns, in the order a human reads the single-label form. */
export const TEMPLATE_CSV_HEADER = [
  'image',
  'brand',
  'class/type',
  'abv',
  'net contents',
  'beverage type',
] as const;

/** Two valid example rows: a spirits label (ABV required) + a beer (ABV omitted). */
export const TEMPLATE_EXAMPLE_ROWS: readonly (readonly string[])[] = [
  [
    'old-tom-bourbon.jpg',
    'Old Tom Distillery',
    'Kentucky Straight Bourbon Whiskey',
    '45% Alc./Vol. (90 Proof)',
    '750 mL',
    'spirits',
  ],
  ['cascade-summit-ale.jpg', 'Cascade Summit', 'Pale Ale', '', '12 fl oz', 'beer'],
];

/** RFC-4180 escape: quote a cell when it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  const cell = String(value ?? '');
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Build the batch template CSV (CRLF line endings, the Excel/Sheets default):
 * the header row plus the example rows.
 */
export function buildTemplateCsv(): string {
  const lines = [TEMPLATE_CSV_HEADER.map(csvCell).join(',')];
  for (const row of TEMPLATE_EXAMPLE_ROWS) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\r\n');
}
