import { describe, it, expect } from 'vitest';
import { compareAbv, parseAbv } from './abv';

describe('parseAbv', () => {
  it('parses ABV and proof from a full spirits statement', () => {
    const p = parseAbv('45% Alc./Vol. (90 Proof)');
    expect(p.abv).toBe(45);
    expect(p.proof).toBe(90);
  });

  it('does not mistake the proof number for the ABV percentage', () => {
    const p = parseAbv('40% Alc./Vol. (80 Proof)');
    expect(p.abv).toBe(40);
    expect(p.proof).toBe(80);
  });

  it('parses a decimal ABV', () => {
    expect(parseAbv('13.5% alc/vol').abv).toBe(13.5);
  });

  it('detects Table Wine / Light Wine designations', () => {
    expect(parseAbv('Table Wine').hasTableWine).toBe(true);
    expect(parseAbv('LIGHT WINE').hasLightWine).toBe(true);
    expect(parseAbv('45% Alc./Vol.').hasTableWine).toBe(false);
  });

  it('flags the disallowed "ABV" abbreviation but not "Alc./Vol."', () => {
    expect(parseAbv('5.0% ABV').usesAbvAbbrev).toBe(true);
    expect(parseAbv('5.0% Alc./Vol.').usesAbvAbbrev).toBe(false);
  });

  it('flags finer-than-0.1% precision', () => {
    expect(parseAbv('5.25% Alc./Vol.').finerThanTenthPrecision).toBe(true);
    expect(parseAbv('5.2% Alc./Vol.').finerThanTenthPrecision).toBe(false);
    expect(parseAbv('5% Alc./Vol.').finerThanTenthPrecision).toBe(false);
  });

  it('returns nulls for a string with no alcohol content', () => {
    const p = parseAbv('');
    expect(p.abv).toBeNull();
    expect(p.proof).toBeNull();
  });
});

describe('compareAbv — numeric comparison', () => {
  it('matches identical spirits ABV with consistent proof', () => {
    const r = compareAbv('45% Alc./Vol. (90 Proof)', '45% Alc./Vol. (90 Proof)', 'spirits');
    expect(r.status).toBe('match');
  });

  it('mismatches when the numbers differ (exact tolerance default)', () => {
    const r = compareAbv('45% Alc./Vol.', '40% Alc./Vol.', 'spirits');
    expect(r.status).toBe('mismatch');
    expect(r.detail).toContain('45');
    expect(r.detail).toContain('40');
  });

  it('honours a configured tolerance', () => {
    expect(compareAbv('45% Alc./Vol.', '45.2% Alc./Vol.', 'spirits').status).toBe('mismatch');
    expect(
      compareAbv('45% Alc./Vol.', '45.2% Alc./Vol.', 'spirits', { tolerance: 0.5 }).status,
    ).toBe('match');
  });

  it('flags a proof inconsistent with the ABV as review', () => {
    const r = compareAbv('45% Alc./Vol.', '45% Alc./Vol. (100 Proof)', 'spirits');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/proof/i);
  });

  it('derives ABV from a proof-only label', () => {
    const r = compareAbv('45% Alc./Vol.', '90 Proof', 'spirits');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/derived/i);
  });

  it('reviews when the label has a number but no expected value was given', () => {
    const r = compareAbv('', '45% Alc./Vol.', 'spirits');
    expect(r.status).toBe('review');
  });
});

describe('compareAbv — spirits (ABV always required)', () => {
  it('FAILS spirits with no ABV on the label', () => {
    const r = compareAbv('45% Alc./Vol.', 'Kentucky Straight Bourbon', 'spirits');
    expect(r.status).toBe('mismatch');
    expect(r.detail).toMatch(/spirits must state/i);
  });
});

describe('compareAbv — wine (Table Wine substitute)', () => {
  it('PASSES a wine labeled "Table Wine" with no numeric ABV', () => {
    const r = compareAbv('', 'Table Wine', 'wine');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/table wine/i);
  });

  it('PASSES a wine labeled "Light Wine" with no numeric ABV', () => {
    const r = compareAbv('', 'Light Wine', 'wine');
    expect(r.status).toBe('match');
  });

  it('matches when both wine sides give the same numeric ABV', () => {
    expect(compareAbv('12.5% Alc./Vol.', '12.5% Alc./Vol.', 'wine').status).toBe('match');
  });

  it('mismatches a wine that expected a number but shows neither number nor designation', () => {
    const r = compareAbv('12.5% Alc./Vol.', 'Vintage 2021', 'wine');
    expect(r.status).toBe('mismatch');
  });

  it('marks missing when nothing expected and no number/designation on a wine', () => {
    expect(compareAbv('', 'Vintage 2021', 'wine').status).toBe('missing');
  });
});

describe('compareAbv — beer (ABV optional + format rules)', () => {
  it('PASSES a beer with no ABV on the label (optional)', () => {
    const r = compareAbv('', 'Hazy IPA', 'beer');
    expect(r.status).toBe('match');
    expect(r.detail).toMatch(/optional/i);
  });

  it('does not FAIL a beer when an ABV was expected but the label omits it (review)', () => {
    const r = compareAbv('5.0% Alc./Vol.', 'Hazy IPA', 'beer');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/optional for beer/i);
  });

  it('downgrades a matching beer to review when it uses the "ABV" abbreviation', () => {
    const r = compareAbv('5.0% Alc./Vol.', '5.0% ABV', 'beer');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/abbreviation/i);
  });

  it('downgrades a matching beer to review for finer-than-0.1% precision', () => {
    const r = compareAbv('5.25% Alc./Vol.', '5.25% Alc./Vol.', 'beer');
    expect(r.status).toBe('review');
    expect(r.detail).toMatch(/0\.1%/);
  });

  it('keeps a clean beer match when ABV is spelled out at 0.1% precision', () => {
    expect(compareAbv('5.2% Alc./Vol.', '5.2% Alc./Vol.', 'beer').status).toBe('match');
  });
});

describe('compareAbv — regression: unanchored percent', () => {
  it('parses the alc/vol percent, not an earlier unrelated percent', () => {
    expect(parseAbv('Contains 2% added flavors. 45% Alc./Vol.').abv).toBe(45);
  });
  it('does not wrongly fail a compliant beer with an added-flavors percent', () => {
    const r = compareAbv('5.0% Alc./Vol.', 'Brewed with 2% honey. 5.0% Alc./Vol.', 'beer');
    expect(r.status).toBe('match');
  });
  it('rounds a derived display value (no float artifact)', () => {
    const r = compareAbv('45.5% Alc./Vol.', '91 Proof', 'spirits');
    expect(r.status).toBe('match');
    expect(r.detail).not.toMatch(/0000/);
  });
  it('handles parseAbv(null) without throwing', () => {
    expect(parseAbv(null).abv).toBeNull();
  });
});
