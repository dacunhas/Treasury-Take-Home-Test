import { describe, it, expect } from 'vitest';
import { parseBatchCsv } from './csv';

const HEADER = 'brand,class/type,abv,net contents,beverage type,image';

describe('parseBatchCsv — happy path', () => {
  it('parses a multi-row CSV into rows (header excluded)', () => {
    const csv = [
      HEADER,
      'OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,Spirits,oldtom.png',
      'STONE\'S THROW,Table Wine,,750 mL,Wine,stone.jpg',
    ].join('\n');
    const { rows, headerError } = parseBatchCsv(csv);
    expect(headerError).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      imageName: 'oldtom.png',
      errors: [],
      expected: {
        brand: 'OLD TOM DISTILLERY',
        classType: 'Kentucky Straight Bourbon Whiskey',
        abv: '45% Alc./Vol.',
        netContents: '750 mL',
        beverageType: 'spirits',
      },
    });
    // ABV blank on a wine row is allowed (conditional by beverage type).
    expect(rows[1]?.errors).toEqual([]);
    expect(rows[1]?.expected.abv).toBe('');
    expect(rows[1]?.expected.beverageType).toBe('wine');
  });

  it('accepts columns in any order and alias spellings', () => {
    const csv = [
      'Image,Brand Name,Beverage,Net Contents,Class',
      'a.png,Acme,Beer,355 mL,Lager',
    ].join('\n');
    const { rows, headerError } = parseBatchCsv(csv);
    expect(headerError).toBeUndefined();
    expect(rows[0]).toMatchObject({
      imageName: 'a.png',
      expected: { brand: 'Acme', beverageType: 'beer', netContents: '355 mL', classType: 'Lager' },
    });
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const csv = [
      HEADER,
      '"Smith, Jr.","Whisky, Blended",40% Alc./Vol.,"1 L","Spirits","a,b.png"',
      '"She said ""hi""",Vodka,40% Alc./Vol.,750 mL,Spirits,b.png',
    ].join('\n');
    const { rows } = parseBatchCsv(csv);
    expect(rows[0]?.expected.brand).toBe('Smith, Jr.');
    expect(rows[0]?.expected.classType).toBe('Whisky, Blended');
    expect(rows[0]?.imageName).toBe('a,b.png');
    expect(rows[1]?.expected.brand).toBe('She said "hi"');
  });

  it('handles CRLF line endings and skips blank lines', () => {
    const csv = `${HEADER}\r\nAcme,Lager,,355 mL,Beer,a.png\r\n\r\nBravo,IPA,,355 mL,Beer,b.png\r\n`;
    const { rows } = parseBatchCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.rowNumber).toBe(1);
    expect(rows[1]?.rowNumber).toBe(2);
    expect(rows[1]?.expected.brand).toBe('Bravo');
  });
});

describe('parseBatchCsv — per-row validation (non-fatal)', () => {
  it('flags missing required fields but still returns the row', () => {
    const csv = [HEADER, ',Bourbon,45% Alc./Vol.,,Spirits,'].join('\n');
    const { rows, headerError } = parseBatchCsv(csv);
    expect(headerError).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.errors).toEqual(
      expect.arrayContaining([
        'missing brand name',
        'missing net contents',
        'missing image filename',
      ]),
    );
  });

  it('flags an unrecognized beverage type', () => {
    const csv = [HEADER, 'Acme,Lager,,355 mL,Soda,a.png'].join('\n');
    const { rows } = parseBatchCsv(csv);
    expect(rows[0]?.expected.beverageType).toBe('');
    expect(rows[0]?.errors.join(' ')).toMatch(/unrecognized beverage type "Soda"/);
  });

  it('one bad row does not stop later valid rows from parsing', () => {
    const csv = [
      HEADER,
      ',,,,,', // entirely empty cells across the required set
      'Acme,Lager,,355 mL,Beer,a.png',
    ].join('\n');
    const { rows } = parseBatchCsv(csv);
    // The all-empty record is a blank line -> skipped; only the valid row remains.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.expected.brand).toBe('Acme');
    expect(rows[0]?.errors).toEqual([]);
  });
});

describe('parseBatchCsv — whole-file (fatal) errors', () => {
  it('empty file', () => {
    expect(parseBatchCsv('')).toEqual({ rows: [], headerError: 'The CSV file is empty.' });
    expect(parseBatchCsv('   \n  ')).toMatchObject({ headerError: 'The CSV file is empty.' });
  });

  it('missing required columns', () => {
    const { rows, headerError } = parseBatchCsv('brand,abv\nAcme,40%');
    expect(rows).toHaveLength(0);
    expect(headerError).toMatch(/missing required column/i);
    expect(headerError).toMatch(/class\/type/);
    expect(headerError).toMatch(/image/);
  });

  it('header present but no data rows', () => {
    const { headerError } = parseBatchCsv(`${HEADER}\n`);
    expect(headerError).toMatch(/no data rows/i);
  });
});
