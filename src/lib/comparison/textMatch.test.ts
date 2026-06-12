import { describe, it, expect } from 'vitest';
import {
  compareTextField,
  compareBrand,
  compareClassType,
  TEXT_MATCH_THRESHOLD,
  TEXT_REVIEW_THRESHOLD,
} from './textMatch';

describe('compareBrand', () => {
  it('exact match -> match', () => {
    const r = compareBrand('OLD TOM DISTILLERY', 'OLD TOM DISTILLERY');
    expect(r.status).toBe('match');
    expect(r.field).toBe('Brand');
  });

  // D1 (Steve, 2026-06-12): formatting-only differences are a clean match, not review.
  it("STONE'S THROW vs Stone's Throw -> match (formatting only)", () => {
    const r = compareBrand("STONE'S THROW", "Stone's Throw");
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/ignoring case/i);
  });

  it('case-only difference -> match', () => {
    const r = compareBrand('old tom distillery', 'OLD TOM DISTILLERY');
    expect(r.status).toBe('match');
  });

  it('accent-only difference (Crème vs Creme) -> match (é folds to e)', () => {
    const r = compareBrand('Crème de Cassis', 'Creme de Cassis');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/accent/i);
  });

  it('café vs cafe -> match', () => {
    expect(compareBrand('Café Granita', 'Cafe Granita').status).toBe('match');
  });

  it('trailing/leading whitespace-only difference -> match', () => {
    const r = compareBrand('OLD TOM DISTILLERY ', 'OLD TOM DISTILLERY');
    expect(r.status).toBe('match');
  });

  it('tiny typo on a long string (>= 0.95) -> match', () => {
    // 26-char normalized string, one extra char -> ratio ~0.96 >= 0.95
    const r = compareBrand('Old Tom Distillery Reserve', 'Old Tom Distillery Reservee');
    expect(r.status).toBe('match');
  });

  it('moderate difference (0.80-0.95) -> review (still flagged)', () => {
    const r = compareBrand('Old Tom Distillery', 'Old Tom Distlry');
    expect(r.status).toBe('review');
  });

  it('clearly different brands -> mismatch', () => {
    const r = compareBrand('OLD TOM DISTILLERY', 'JACK DANIELS');
    expect(r.status).toBe('mismatch');
  });

  it('nothing read -> missing', () => {
    expect(compareBrand('OLD TOM DISTILLERY', null).status).toBe('missing');
    expect(compareBrand('OLD TOM DISTILLERY', '   ').status).toBe('missing');
  });
});

describe('compareClassType', () => {
  it('exact match -> match', () => {
    const r = compareClassType(
      'Kentucky Straight Bourbon Whiskey',
      'Kentucky Straight Bourbon Whiskey',
    );
    expect(r.status).toBe('match');
    expect(r.field).toBe('Class/Type');
  });

  it('punctuation/whitespace-only difference -> match', () => {
    const r = compareClassType(
      'Kentucky Straight Bourbon Whiskey',
      'Kentucky Straight Bourbon Whiskey.',
    );
    expect(r.status).toBe('match');
  });

  it('case-only difference -> match (COFFEE LIQUEUR vs Coffee Liqueur)', () => {
    expect(compareClassType('Coffee Liqueur', 'COFFEE LIQUEUR').status).toBe('match');
  });

  it('reworded class/type -> mismatch', () => {
    const r = compareClassType('Kentucky Straight Bourbon Whiskey', 'London Dry Gin');
    expect(r.status).toBe('mismatch');
  });

  it('nothing read -> missing (parity with compareBrand)', () => {
    expect(compareClassType('London Dry Gin', null).status).toBe('missing');
  });
});

describe('compareTextField thresholds & shape', () => {
  it('threshold constants hold the documented relationship', () => {
    expect(TEXT_MATCH_THRESHOLD).toBeGreaterThan(TEXT_REVIEW_THRESHOLD);
    expect(TEXT_MATCH_THRESHOLD).toBeLessThanOrEqual(1);
    expect(TEXT_REVIEW_THRESHOLD).toBeGreaterThan(0);
  });

  it('preserves the original expected/found strings in the result', () => {
    const r = compareTextField('Brand', 'Foo Bar', 'Foo  Bar');
    expect(r.expected).toBe('Foo Bar');
    expect(r.found).toBe('Foo  Bar');
    expect(r.status).toBe('match'); // whitespace-only -> clean match (D1)
  });

  it('uses the provided field name in the label and missing detail', () => {
    const r = compareTextField('Brand', 'X', null);
    expect(r.field).toBe('Brand');
    expect(r.detail).toMatch(/no brand/i);
  });
});
