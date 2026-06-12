import { describe, it, expect } from 'vitest';
import { outcomesToCsv, RESULTS_CSV_HEADER } from './export';
import type { BatchRowOutcome, MatchedBatchRow } from './types';
import type { VerificationResult, FieldResult } from '@/types';

function row(over: Partial<MatchedBatchRow['expected']> = {}): MatchedBatchRow {
  return {
    rowNumber: 1,
    expected: {
      brand: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      abv: '45% Alc./Vol.',
      netContents: '750 mL',
      beverageType: 'spirits',
      ...over,
    },
    imageName: 'old-tom.png',
    matchedFileName: 'old-tom.png',
    errors: [],
  };
}

function field(f: string, status: FieldResult['status']): FieldResult {
  return { field: f, expected: 'e', found: 'f', status };
}

function result(over: Partial<VerificationResult> = {}): VerificationResult {
  return {
    fields: [field('Brand', 'match'), field('Alcohol Content', 'review')],
    warning: {
      present: true,
      prefixCaps: true,
      textMatch: true,
      status: 'match',
      detail: 'ok',
    },
    overall: 'review',
    latencyMs: 1500,
    escalated: false,
    ...over,
  };
}

function ok(over: Partial<BatchRowOutcome> = {}): BatchRowOutcome {
  return {
    rowNumber: 1,
    row: row(),
    status: 'review',
    result: result(),
    ...over,
  };
}

describe('outcomesToCsv', () => {
  it('always emits the header, even for an empty batch', () => {
    const csv = outcomesToCsv([]);
    expect(csv).toBe(RESULTS_CSV_HEADER.join(','));
  });

  it('writes one data row per outcome with the expected values + verdict', () => {
    const csv = outcomesToCsv([ok()]);
    const [header, line] = csv.split('\r\n');
    expect(header).toBe(RESULTS_CSV_HEADER.join(','));
    expect(line).toContain('OLD TOM DISTILLERY');
    expect(line).toContain('Please check'); // review -> single-label wording
    expect(line).toContain('1.5'); // latency seconds
  });

  it('flattens the per-field breakdown incl. the Government Warning', () => {
    const csv = outcomesToCsv([ok()]);
    expect(csv).toContain('Brand: Match');
    expect(csv).toContain('Alcohol Content: Review');
    expect(csv).toContain('Government Warning: Match');
  });

  it('marks an escalated row with "yes" in the Closer check column', () => {
    const csv = outcomesToCsv([
      ok({ result: result({ escalated: true }) }),
    ]);
    const line = csv.split('\r\n')[1] ?? '';
    // Column 10 (0-based 9) is Closer check.
    expect(line.split(',')[9]).toBe('yes');
  });

  it('puts the friendly reason in Note for an error row and leaves result cols blank', () => {
    const csv = outcomesToCsv([
      {
        rowNumber: 2,
        row: row(),
        status: 'error',
        error: 'no image was matched to this row',
      },
    ]);
    const line = csv.split('\r\n')[1] ?? '';
    expect(line).toContain('Could not verify');
    expect(line).toContain('no image was matched to this row');
  });

  it('RFC-4180 escapes commas, quotes, and newlines', () => {
    const csv = outcomesToCsv([
      ok({
        row: row({ classType: 'Whiskey, Straight' }),
        result: result(),
        status: 'error',
        error: 'she said "fix the photo"\nand retry',
      }),
    ]);
    expect(csv).toContain('"Whiskey, Straight"');
    expect(csv).toContain('"she said ""fix the photo""\nand retry"');
  });

  it('is deterministic for the same input', () => {
    const a = outcomesToCsv([ok(), ok({ rowNumber: 2 })]);
    const b = outcomesToCsv([ok(), ok({ rowNumber: 2 })]);
    expect(a).toBe(b);
  });
});
