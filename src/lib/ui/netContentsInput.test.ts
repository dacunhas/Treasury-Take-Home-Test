import { describe, it, expect } from 'vitest';
import {
  NET_CONTENTS_UNITS,
  DEFAULT_NET_CONTENTS_UNIT,
  isNetContentsUnit,
  composeNetContents,
  suggestNetContentsUnit,
} from './netContentsInput';
import { parseNetContents } from '@/lib/comparison/netContents';

describe('NET_CONTENTS_UNITS', () => {
  it('defaults to mL (first option)', () => {
    expect(DEFAULT_NET_CONTENTS_UNIT).toBe('mL');
    expect(NET_CONTENTS_UNITS[0]?.value).toBe('mL');
  });

  it('offers the required common units and the optional US units', () => {
    const values = NET_CONTENTS_UNITS.map((u) => u.value);
    expect(values).toEqual(['mL', 'cL', 'L', 'fl oz', 'pt', 'qt', 'gal']);
  });

  it('every option value is a unit the engine can parse', () => {
    for (const u of NET_CONTENTS_UNITS) {
      const parsed = parseNetContents(`1 ${u.value}`);
      expect(parsed.unit, u.value).not.toBeNull();
      expect(parsed.ml, u.value).not.toBeNull();
    }
  });

  it('isNetContentsUnit recognizes options and rejects others', () => {
    expect(isNetContentsUnit('mL')).toBe(true);
    expect(isNetContentsUnit('fl oz')).toBe(true);
    expect(isNetContentsUnit('barrel')).toBe(false);
    expect(isNetContentsUnit('')).toBe(false);
  });
});

describe('composeNetContents', () => {
  it('pairs a number with its unit', () => {
    expect(composeNetContents('750', 'mL')).toBe('750 mL');
  });

  it('trims surrounding whitespace on the number', () => {
    expect(composeNetContents('  1.5 ', 'L')).toBe('1.5 L');
  });

  it('preserves a comma decimal (engine tolerates it)', () => {
    expect(composeNetContents('0,75', 'L')).toBe('0,75 L');
  });

  it('a blank number yields an empty string (field stays optional)', () => {
    expect(composeNetContents('', 'mL')).toBe('');
    expect(composeNetContents('   ', 'L')).toBe('');
  });

  it('falls back to the default unit when none is given', () => {
    expect(composeNetContents('500', '')).toBe('500 mL');
  });

  it('ALWAYS attaches a unit to a present value (never unit-less)', () => {
    // The engine never receives a bare number from this form, so the unit-less
    // -> review fallback in parseNetContents cannot be triggered by form input.
    for (const raw of ['750', '1', '0.75', '12', '1000']) {
      const composed = composeNetContents(raw, 'mL');
      expect(parseNetContents(composed).unit).not.toBeNull();
    }
  });

  it('composes a string the engine reads back to the right quantity', () => {
    expect(parseNetContents(composeNetContents('750', 'mL')).ml).toBe(750);
    expect(parseNetContents(composeNetContents('1', 'L')).ml).toBe(1000);
    expect(parseNetContents(composeNetContents('25.4', 'fl oz')).ml).toBeCloseTo(751.2, 0);
  });
});

describe('suggestNetContentsUnit (non-silent, overrideable, never auto-flip)', () => {
  it('suggests litres for an implausibly small mL value', () => {
    expect(suggestNetContentsUnit('0.75', 'mL')?.unit).toBe('L');
    expect(suggestNetContentsUnit('1', 'mL')?.unit).toBe('L');
    expect(suggestNetContentsUnit('1.5', 'mL')?.unit).toBe('L');
  });

  it('does NOT suggest for a normal mL fill', () => {
    expect(suggestNetContentsUnit('750', 'mL')).toBeNull();
    expect(suggestNetContentsUnit('50', 'mL')).toBeNull();
    expect(suggestNetContentsUnit('1000', 'mL')).toBeNull();
  });

  it('respects an explicit non-default unit (no second-guessing)', () => {
    expect(suggestNetContentsUnit('0.75', 'L')).toBeNull();
    expect(suggestNetContentsUnit('0.75', 'fl oz')).toBeNull();
  });

  it('no suggestion for blank, junk, or non-positive input', () => {
    expect(suggestNetContentsUnit('', 'mL')).toBeNull();
    expect(suggestNetContentsUnit('abc', 'mL')).toBeNull();
    expect(suggestNetContentsUnit('0', 'mL')).toBeNull();
  });

  it('provides a plain-language reason', () => {
    const s = suggestNetContentsUnit('1', 'mL');
    expect(s?.reason).toMatch(/litres/i);
    expect(s?.reason).not.toMatch(/error|stack|exception/i);
  });
});
