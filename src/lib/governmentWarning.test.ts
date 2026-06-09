import { describe, it, expect } from 'vitest';
import {
  GOVERNMENT_WARNING_CANONICAL,
  GOVERNMENT_WARNING_PREFIX,
  normalizeWarningWhitespace,
} from './governmentWarning';

describe('Government Warning canonical constant', () => {
  it('matches the verbatim 27 CFR Part 16 text (CONTEXT §5)', () => {
    const expected =
      'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not ' +
      'drink alcoholic beverages during pregnancy because of the risk of birth ' +
      'defects. (2) Consumption of alcoholic beverages impairs your ability to ' +
      'drive a car or operate machinery, and may cause health problems.';
    expect(GOVERNMENT_WARNING_CANONICAL).toBe(expected);
  });

  it('starts with the all-caps prefix', () => {
    expect(GOVERNMENT_WARNING_CANONICAL.startsWith(GOVERNMENT_WARNING_PREFIX)).toBe(true);
    expect(GOVERNMENT_WARNING_PREFIX).toBe(GOVERNMENT_WARNING_PREFIX.toUpperCase());
  });

  it('contains both numbered clauses', () => {
    expect(GOVERNMENT_WARNING_CANONICAL).toContain('(1) According to the Surgeon General');
    expect(GOVERNMENT_WARNING_CANONICAL).toContain('(2) Consumption of alcoholic beverages');
  });

  it('is a single line with no embedded newlines', () => {
    expect(GOVERNMENT_WARNING_CANONICAL).not.toContain('\n');
  });

  it('normalizeWarningWhitespace collapses runs of whitespace and trims', () => {
    const wrapped =
      '  GOVERNMENT   WARNING:\n(1)\tAccording to the Surgeon General  ';
    expect(normalizeWarningWhitespace(wrapped)).toBe(
      'GOVERNMENT WARNING: (1) According to the Surgeon General',
    );
  });

  it('canonical text is stable under whitespace normalization', () => {
    expect(normalizeWarningWhitespace(GOVERNMENT_WARNING_CANONICAL)).toBe(
      GOVERNMENT_WARNING_CANONICAL,
    );
  });
});
