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

describe('parseAbv — bare-number tolerance (B1)', () => {
  it('reads a whole-string plain number as a percentage', () => {
    expect(parseAbv('13').abv).toBe(13);
    expect(parseAbv('45').abv).toBe(45);
  });

  it('reads a bare decimal number as a percentage', () => {
    expect(parseAbv('13.5').abv).toBe(13.5);
  });

  it('ignores surrounding whitespace on a bare number', () => {
    expect(parseAbv('  12  ').abv).toBe(12);
  });

  it('does not set proof or wine designations for a bare number', () => {
    const p = parseAbv('13');
    expect(p.proof).toBeNull();
    expect(p.hasTableWine).toBe(false);
    expect(p.usesAbvAbbrev).toBe(false);
  });

  it('still derives ABV from proof for a "NN Proof" string (no bare-number misfire)', () => {
    const p = parseAbv('90 Proof');
    expect(p.abv).toBeNull();
    expect(p.proof).toBe(90);
  });

  it('does not treat a number embedded in a longer string as a bare ABV', () => {
    // Net-contents-like noise must not be read as an ABV by the bare fallback.
    expect(parseAbv('Lot 12345').abv).toBeNull();
  });

  it('tracks decimal precision for a bare number (beer 0.1% rule still applies)', () => {
    expect(parseAbv('5.25').finerThanTenthPrecision).toBe(true);
    expect(parseAbv('5.2').finerThanTenthPrecision).toBe(false);
  });

  it('rejects an implausible bare number above 100% (proof/net-contents mistyped)', () => {
    // ABV cannot exceed 100%, so a bare "750" or "150" is not read as an ABV.
    expect(parseAbv('750').abv).toBeNull();
    expect(parseAbv('150').abv).toBeNull();
    // The boundary value 100 is still accepted.
    expect(parseAbv('100').abv).toBe(100);
  });
});

describe('compareAbv — bare-number expected value (B1)', () => {
  it('compares a bare expected "13" against a label "13% Alc./Vol." as a match', () => {
    const r = compareAbv('13', '13% Alc./Vol.', 'wine');
    expect(r.status).toBe('match');
  });

  it('compares a bare expected "45" against a full spirits statement as a match', () => {
    const r = compareAbv('45', '45% Alc./Vol. (90 Proof)', 'spirits');
    expect(r.status).toBe('match');
  });

  it('flags a mismatch when the bare expected number differs from the label', () => {
    const r = compareAbv('13', '14% Alc./Vol.', 'wine');
    expect(r.status).toBe('mismatch');
  });

  it('spirits with a bare expected number but no ABV on the label is a mismatch', () => {
    const r = compareAbv('40', null, 'spirits');
    expect(r.status).toBe('mismatch');
  });
});
