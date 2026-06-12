/**
 * T4.1 — pure CSV parsing + per-row validation for batch mode.
 *
 * Reads an expected-values CSV (one label per row) into validated `BatchRow`s.
 * Deliberately I/O-free and framework-free (no DOM, no model) so it runs under
 * the existing `node` vitest environment and is exhaustively unit-testable.
 *
 * Design choices:
 *  - A small RFC-4180-style tokenizer handles quoted fields, embedded commas,
 *    escaped double-quotes (""), and CRLF/LF line endings — importers export
 *    from Excel/Sheets, which quote freely.
 *  - Header columns are matched case-insensitively against an alias table, so a
 *    spreadsheet may say "Brand", "brand name", "Class/Type", "ABV", "Net
 *    Contents", "Beverage Type", "Image" / "filename" in any order.
 *  - Required fields mirror the single-label form: brand, class/type, net
 *    contents, beverage type, and an image filename. ABV is intentionally
 *    optional — it is conditional by beverage type (CONTEXT §5); the comparison
 *    engine applies those rules, so a blank ABV is NOT a row error here.
 *  - Validation is PER ROW and non-fatal: a malformed row carries its own
 *    `errors` and is still returned, so the results table can show it (and one
 *    bad row never aborts the whole import — T4.1 acceptance). Only a whole-file
 *    problem (empty, no header, no usable columns, no data rows) is fatal.
 */
import type {
  BatchExpectedInput,
  BatchRow,
  ParsedBatchCsv,
  BeverageType,
} from './types';

const BEVERAGE_TYPES: readonly BeverageType[] = ['spirits', 'wine', 'beer'];

/** Logical columns we understand, each with the header spellings we accept. */
type ColumnKey =
  | 'brand'
  | 'classType'
  | 'abv'
  | 'netContents'
  | 'beverageType'
  | 'image';

const COLUMN_ALIASES: Record<ColumnKey, readonly string[]> = {
  brand: ['brand', 'brand name', 'brandname'],
  classType: ['class/type', 'class type', 'classtype', 'class', 'type', 'class / type'],
  abv: ['abv', 'alcohol', 'alcohol content', 'alc', 'alc/vol', 'alc./vol.'],
  netContents: ['net contents', 'netcontents', 'net content', 'contents', 'volume', 'size'],
  beverageType: ['beverage type', 'beveragetype', 'beverage', 'product type'],
  image: ['image', 'image name', 'imagename', 'filename', 'file name', 'file', 'photo', 'label', 'label image'],
};

/** Normalize a header cell for alias lookup. */
function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Tokenize a single CSV record's text is insufficient because quoted fields can
 * contain newlines; we therefore tokenize the WHOLE document into records of
 * fields in one pass (a tiny state machine).
 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRecord();
    } else if (ch === '\r') {
      // swallow; the following \n (if any) closes the record
      if (text[i + 1] === '\n') {
        i++;
      }
      pushRecord();
    } else {
      field += ch;
    }
  }
  // Flush a trailing field/record (a final line with no terminating newline).
  // Truly empty input leaves both empty, so nothing is pushed.
  if (field !== '' || record.length > 0) {
    pushRecord();
  }
  return records;
}

/** True when a record is entirely empty cells (a blank line in the CSV). */
function isBlankRecord(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

/**
 * Parse + validate a batch CSV. Never throws on row-level problems; returns a
 * `headerError` only for whole-file failures.
 */
export function parseBatchCsv(text: string): ParsedBatchCsv {
  if (text.trim() === '') {
    return { rows: [], headerError: 'The CSV file is empty.' };
  }

  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows: [], headerError: 'The CSV file is empty.' };
  }

  const headerCells = records[0] ?? [];
  // Map each logical column to its index in the header (or -1 when absent).
  const index: Record<ColumnKey, number> = {
    brand: -1,
    classType: -1,
    abv: -1,
    netContents: -1,
    beverageType: -1,
    image: -1,
  };
  headerCells.forEach((rawHeader, col) => {
    const norm = normalizeHeader(rawHeader);
    (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach((key) => {
      if (index[key] === -1 && COLUMN_ALIASES[key].includes(norm)) {
        index[key] = col;
      }
    });
  });

  const missingColumns: string[] = [];
  if (index.brand === -1) missingColumns.push('brand');
  if (index.classType === -1) missingColumns.push('class/type');
  if (index.netContents === -1) missingColumns.push('net contents');
  if (index.beverageType === -1) missingColumns.push('beverage type');
  if (index.image === -1) missingColumns.push('image');
  if (missingColumns.length > 0) {
    return {
      rows: [],
      headerError: `The CSV is missing required column(s): ${missingColumns.join(
        ', ',
      )}. Expected a header row with brand, class/type, net contents, beverage type, and image (ABV optional).`,
    };
  }

  const cellAt = (cells: string[], col: number): string =>
    col >= 0 && col < cells.length ? (cells[col] ?? '').trim() : '';

  const rows: BatchRow[] = [];
  let dataRowNumber = 0;
  for (let r = 1; r < records.length; r++) {
    const cells = records[r] ?? [];
    if (isBlankRecord(cells)) continue; // skip blank lines silently
    dataRowNumber++;

    const beverageTypeRaw = cellAt(cells, index.beverageType).toLowerCase();
    const expected: BatchExpectedInput = {
      brand: cellAt(cells, index.brand),
      classType: cellAt(cells, index.classType),
      abv: cellAt(cells, index.abv),
      netContents: cellAt(cells, index.netContents),
      beverageType: BEVERAGE_TYPES.includes(beverageTypeRaw as BeverageType)
        ? beverageTypeRaw
        : '',
    };
    const imageName = cellAt(cells, index.image);

    const errors: string[] = [];
    if (!expected.brand) errors.push('missing brand name');
    if (!expected.classType) errors.push('missing class/type');
    if (!expected.netContents) errors.push('missing net contents');
    if (!beverageTypeRaw) {
      errors.push('missing beverage type');
    } else if (expected.beverageType === '') {
      errors.push(
        `unrecognized beverage type "${cellAt(cells, index.beverageType)}" (use Spirits, Wine, or Beer)`,
      );
    }
    if (!imageName) errors.push('missing image filename');

    rows.push({ rowNumber: dataRowNumber, expected, imageName, errors });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      headerError:
        'The CSV has a header row but no data rows. Add one row per label.',
    };
  }

  return { rows };
}
