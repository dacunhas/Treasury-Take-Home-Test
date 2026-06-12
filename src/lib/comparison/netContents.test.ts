import { describe, it, expect } from 'vitest';
import { parseNetContents, compareNetContents } from './netContents';

describe('parseNetContents', () => {
  it('parses "750 mL"', () => {
    expect(parseNetContents('750 mL')).toMatchObject({ value: 750, unit: 'mL', system: 'metric', ml: 750 });
  });
  it('parses without a space ("750ml")', () => {
    expect(parseNetContents('750ml')).toMatchObject({ value: 750, unit: 'mL', ml: 750 });
  });
  it('parses litres to mL ("1 L" -> 1000 mL)', () => {
    expect(parseNetContents('1 L')).toMatchObject({ value: 1, unit: 'L', system: 'metric', ml: 1000 });
  });
  it('parses a decimal litre ("0.75 L")', () => {
    expect(parseNetContents('0.75 L')).toMatchObject({ value: 0.75, ml: 750 });
  });
  it('parses a comma decimal ("0,75 L")', () => {
    expect(parseNetContents('0,75 L')).toMatchObject({ value: 0.75, ml: 750 });
  });
  it('parses centilitres ("75 cL" -> 750 mL)', () => {
    expect(parseNetContents('75 cL')).toMatchObject({ value: 75, unit: 'cL', ml: 750 });
  });
  it('parses fluid ounces with punctuation ("12 fl. oz.")', () => {
    const p = parseNetContents('12 fl. oz.');
    expect(p.value).toBe(12);
    expect(p.unit).toBe('fl oz');
    expect(p.system).toBe('us');
    expect(p.ml).toBeCloseTo(354.882, 2);
  });
  it('parses bare "oz" as fluid ounces', () => {
    expect(parseNetContents('12 oz').unit).toBe('fl oz');
  });
  it('returns a unit-less parse for a bare number', () => {
    expect(parseNetContents('750')).toMatchObject({ value: 750, unit: null, ml: null });
  });
  it('returns all-null for non-numeric junk', () => {
    expect(parseNetContents('not a quantity')).toMatchObject({ value: null, ml: null });
  });
  it('returns all-null for null input', () => {
    expect(parseNetContents(null)).toMatchObject({ value: null, ml: null });
  });
  it('ignores a leading lot code and parses the unit-bearing number', () => {
    expect(parseNetContents('Lot 12345 / 750 mL')).toMatchObject({ value: 750, unit: 'mL', ml: 750 });
  });
  it('ignores surrounding words and parses the quantity', () => {
    expect(parseNetContents('Net contents 1 L e')).toMatchObject({ value: 1, unit: 'L', ml: 1000 });
  });
  it('prefers the first number that actually carries a unit', () => {
    expect(parseNetContents('Batch 7 — 375 mL')).toMatchObject({ value: 375, unit: 'mL', ml: 375 });
  });
});

describe('compareNetContents', () => {
  it('exact same string -> match', () => {
    expect(compareNetContents('750 mL', '750 mL').status).toBe('match');
  });
  it('case/spacing difference, same quantity -> match', () => {
    expect(compareNetContents('750 mL', '750ml').status).toBe('match');
  });
  it('1 L vs 1000 mL (same metric system, equal) -> match', () => {
    const r = compareNetContents('1 L', '1000 mL');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/=/);
  });
  it('0.75 L vs 750 mL -> match', () => {
    expect(compareNetContents('0.75 L', '750 mL').status).toBe('match');
  });
  it('comma decimal 1,5 L vs 1.5 L -> match', () => {
    expect(compareNetContents('1,5 L', '1.5 L').status).toBe('match');
  });
  it('different standard fill 750 mL vs 700 mL -> mismatch', () => {
    expect(compareNetContents('750 mL', '700 mL').status).toBe('mismatch');
  });
  it('375 mL vs 750 mL -> mismatch', () => {
    expect(compareNetContents('375 mL', '750 mL').status).toBe('mismatch');
  });
  it('metric expected, equal US quantity on label -> review (different system)', () => {
    const r = compareNetContents('750 mL', '25.4 fl oz');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/measurement system/i);
  });
  it('US expected, equal metric on label -> review (different system)', () => {
    expect(compareNetContents('12 fl oz', '355 mL').status).toBe('review');
  });
  it('same US unit, equal -> match', () => {
    expect(compareNetContents('12 fl oz', '12 fl. oz.').status).toBe('match');
  });
  it('within 1% tolerance -> match (750 vs 750.2 mL)', () => {
    expect(compareNetContents('750 mL', '750.2 mL').status).toBe('match');
  });
  it('empty label value -> missing', () => {
    expect(compareNetContents('750 mL', '').status).toBe('missing');
    expect(compareNetContents('750 mL', null).status).toBe('missing');
  });
  it('label number with no unit -> review', () => {
    const r = compareNetContents('750 mL', '750');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/unit/i);
  });
  it('unreadable label net contents -> missing', () => {
    expect(compareNetContents('750 mL', 'illegible').status).toBe('missing');
  });
  it('unit-less expected but number matches the label -> review', () => {
    const r = compareNetContents('750', '750 mL');
    expect(r.status).toBe('review');
  });
  it('label with a lot code still matches on the real quantity', () => {
    expect(compareNetContents('750 mL', 'LOT A19 750 mL').status).toBe('match');
  });
  it('detail is plain-language and never a stack trace', () => {
    for (const r of [
      compareNetContents('750 mL', '700 mL'),
      compareNetContents('750 mL', '25.4 fl oz'),
      compareNetContents('750 mL', ''),
    ]) {
      expect(r.detail).toBeTruthy();
      expect(r.detail).not.toMatch(/Error:|at \w+\.|undefined/);
    }
  });
});

describe('compareNetContents — conditional by beverage type (T2.5)', () => {
  it('BEER: equal quantity in U.S. fl oz vs expected metric -> match', () => {
    const r = compareNetContents('355 mL', '12 fl oz', 'beer');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/malt beverage/i);
  });
  it('BEER: expected fl oz vs equal metric on label -> match', () => {
    expect(compareNetContents('12 fl oz', '355 mL', 'beer').status).toBe('match');
  });
  it('SPIRITS: equal quantity in U.S. fl oz vs expected metric -> review (metric required)', () => {
    const r = compareNetContents('750 mL', '25.4 fl oz', 'spirits');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/metric/i);
  });
  it('WINE: cross-system equal quantity -> review', () => {
    expect(compareNetContents('750 mL', '25.4 fl oz', 'wine').status).toBe('review');
  });
  it('beverageType omitted -> conservative review on cross-system (unchanged default)', () => {
    expect(compareNetContents('750 mL', '25.4 fl oz').status).toBe('review');
  });
  it('BEER: a genuinely different fill is still a mismatch (allowance is system-only)', () => {
    expect(compareNetContents('355 mL', '16 fl oz', 'beer').status).toBe('mismatch');
  });
  it('BEER: same-system equal quantity is unaffected -> match', () => {
    expect(compareNetContents('355 mL', '355 mL', 'beer').status).toBe('match');
  });
});
