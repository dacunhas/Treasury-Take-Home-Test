import { describe, it, expect } from 'vitest';
import { normalizeText, levenshtein, similarityRatio } from './normalize';

describe('normalizeText', () => {
  it('lowercases', () => {
    expect(normalizeText('OLD TOM DISTILLERY')).toBe('old tom distillery');
  });

  it('removes possessive apostrophes so "Stone\'s" == "Stones"', () => {
    expect(normalizeText("Stone's Throw")).toBe('stones throw');
    expect(normalizeText('STONE’S THROW')).toBe('stones throw'); // curly apostrophe
    expect(normalizeText('Stones Throw')).toBe('stones throw');
  });

  it('replaces other punctuation with a space and collapses whitespace', () => {
    expect(normalizeText('Old   Tom, Distillery.')).toBe('old tom distillery');
    expect(normalizeText('Rock-n-Roll')).toBe('rock n roll');
  });

  it('trims and collapses leading/trailing/internal whitespace', () => {
    expect(normalizeText('  Kentucky   Straight  ')).toBe('kentucky straight');
  });

  it('NFKC-folds compatibility forms (full-width)', () => {
    expect(normalizeText('ＡＢＣ')).toBe('abc');
  });

  it('folds diacritics to base letters (café -> cafe, Schön -> schon)', () => {
    expect(normalizeText('Café')).toBe('cafe');
    expect(normalizeText('Schön')).toBe('schon');
    expect(normalizeText('Crème')).toBe('creme');
  });

  it('keeps digits', () => {
    expect(normalizeText('Barrel 12')).toBe('barrel 12');
  });

  it('is idempotent', () => {
    const once = normalizeText("STONE'S  THROW!");
    expect(normalizeText(once)).toBe(once);
  });
});

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('equals length when the other is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
  it('counts single edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });
});

describe('similarityRatio', () => {
  it('is 1 for identical (incl. both empty)', () => {
    expect(similarityRatio('abc', 'abc')).toBe(1);
    expect(similarityRatio('', '')).toBe(1);
  });
  it('is between 0 and 1 for near matches', () => {
    const r = similarityRatio('old tom distillery', 'old tom distlery');
    expect(r).toBeGreaterThan(0.8);
    expect(r).toBeLessThan(1);
  });
  it('is low for clearly different strings', () => {
    expect(similarityRatio('old tom distillery', 'jack daniels')).toBeLessThan(0.5);
  });
});
