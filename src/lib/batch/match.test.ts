import { describe, it, expect } from 'vitest';
import { matchRowsToFiles } from './match';
import type { BatchRow } from './types';

function row(rowNumber: number, imageName: string, errors: string[] = []): BatchRow {
  return {
    rowNumber,
    imageName,
    errors,
    expected: { brand: 'B', classType: 'C', abv: '', netContents: '750 mL', beverageType: 'spirits' },
  };
}

describe('matchRowsToFiles', () => {
  it('matches by exact, case-insensitive basename', () => {
    const { rows } = matchRowsToFiles([row(1, 'Label_1.PNG')], ['label_1.png']);
    expect(rows[0]?.matchedFileName).toBe('label_1.png');
    expect(rows[0]?.errors).toEqual([]);
  });

  it('matches when the CSV cell omits the extension', () => {
    const { rows } = matchRowsToFiles([row(1, 'oldtom')], ['oldtom.jpg']);
    expect(rows[0]?.matchedFileName).toBe('oldtom.jpg');
  });

  it('strips a directory prefix from either side', () => {
    const { rows } = matchRowsToFiles([row(1, 'images/oldtom.png')], ['C:\\labels\\oldtom.png']);
    expect(rows[0]?.matchedFileName).toBe('C:\\labels\\oldtom.png');
  });

  it('reports an unmatched row with a friendly error, without throwing', () => {
    const { rows } = matchRowsToFiles([row(1, 'missing.png')], ['other.png']);
    expect(rows[0]?.matchedFileName).toBeNull();
    expect(rows[0]?.errors.join(' ')).toMatch(/no uploaded image named "missing.png"/);
  });

  it('lets two rows share the same image and reports unused files', () => {
    const { rows, unusedFiles } = matchRowsToFiles(
      [row(1, 'a.png'), row(2, 'a.png')],
      ['a.png', 'unused.png'],
    );
    expect(rows[0]?.matchedFileName).toBe('a.png');
    expect(rows[1]?.matchedFileName).toBe('a.png');
    expect(unusedFiles).toEqual(['unused.png']);
  });

  it('carries an empty imageName row through as unmatched (no duplicate error)', () => {
    const { rows } = matchRowsToFiles([row(1, '', ['missing image filename'])], ['a.png']);
    expect(rows[0]?.matchedFileName).toBeNull();
    expect(rows[0]?.errors).toEqual(['missing image filename']);
  });

  it('preserves pre-existing validation errors when also unmatched', () => {
    const { rows } = matchRowsToFiles([row(1, 'x.png', ['missing brand name'])], []);
    expect(rows[0]?.errors[0]).toBe('missing brand name');
    expect(rows[0]?.errors.join(' ')).toMatch(/no uploaded image named "x.png"/);
  });
});
