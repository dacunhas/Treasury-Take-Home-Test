import { describe, it, expect } from 'vitest';
import { sortOutcomes } from './sort';
import type { BatchRowOutcome, MatchedBatchRow, BatchRowStatus } from './types';

function outcome(
  rowNumber: number,
  brand: string,
  image: string,
  status: BatchRowStatus,
): BatchRowOutcome {
  const row: MatchedBatchRow = {
    rowNumber,
    expected: {
      brand,
      classType: 'x',
      abv: '',
      netContents: '750 mL',
      beverageType: 'beer',
    },
    imageName: image,
    matchedFileName: image,
    errors: [],
  };
  return { rowNumber, row, status };
}

const data: BatchRowOutcome[] = [
  outcome(3, 'Zebra', 'c.png', 'pass'),
  outcome(1, 'apple', 'a.png', 'fail'),
  outcome(2, 'Mango', 'b.png', 'review'),
];

describe('sortOutcomes', () => {
  it('does not mutate the input array', () => {
    const before = data.map((o) => o.rowNumber);
    sortOutcomes(data, 'brand', 'asc');
    expect(data.map((o) => o.rowNumber)).toEqual(before);
  });

  it('sorts by row number ascending and descending', () => {
    expect(sortOutcomes(data, 'row', 'asc').map((o) => o.rowNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(sortOutcomes(data, 'row', 'desc').map((o) => o.rowNumber)).toEqual([
      3, 2, 1,
    ]);
  });

  it('sorts by brand case-insensitively', () => {
    expect(sortOutcomes(data, 'brand', 'asc').map((o) => o.row.expected.brand)).toEqual(
      ['apple', 'Mango', 'Zebra'],
    );
  });

  it('sorts by image filename', () => {
    expect(sortOutcomes(data, 'image', 'asc').map((o) => o.row.imageName)).toEqual(
      ['a.png', 'b.png', 'c.png'],
    );
  });

  it('sorts by verdict severity (pass < review < fail < error)', () => {
    const withError = [...data, outcome(4, 'Err', 'd.png', 'error')];
    expect(sortOutcomes(withError, 'status', 'asc').map((o) => o.status)).toEqual([
      'pass',
      'review',
      'fail',
      'error',
    ]);
  });

  it('is stable: equal keys keep original order regardless of direction', () => {
    const ties: BatchRowOutcome[] = [
      outcome(1, 'same', 'a.png', 'pass'),
      outcome(2, 'same', 'b.png', 'pass'),
      outcome(3, 'same', 'c.png', 'pass'),
    ];
    expect(sortOutcomes(ties, 'brand', 'asc').map((o) => o.rowNumber)).toEqual([
      1, 2, 3,
    ]);
    // Descending also keeps the stable tie order (tie-break is not flipped).
    expect(sortOutcomes(ties, 'brand', 'desc').map((o) => o.rowNumber)).toEqual([
      1, 2, 3,
    ]);
  });
});
