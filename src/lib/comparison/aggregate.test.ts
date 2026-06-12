import { describe, it, expect } from 'vitest';
import { aggregateOverall, compareLabel } from './aggregate';
import { GOVERNMENT_WARNING_CANONICAL } from '@/lib/governmentWarning';
import type {
  ExpectedLabel,
  ExtractedLabel,
  FieldResult,
  FieldStatus,
  WarningCheckResult,
} from '@/types';

/** Minimal FieldResult builder for the rollup unit tests. */
function field(status: FieldStatus): FieldResult {
  return { field: 'X', expected: 'e', found: 'f', status };
}

/** Minimal WarningCheckResult builder. */
function warn(status: FieldStatus): WarningCheckResult {
  return {
    present: status !== 'missing',
    prefixCaps: status === 'match',
    textMatch: status === 'match',
    status,
  };
}

describe('aggregateOverall — rollup rule', () => {
  it('all match + warning match -> pass', () => {
    expect(aggregateOverall([field('match'), field('match')], warn('match'))).toBe(
      'pass',
    );
  });

  it('any field mismatch -> fail', () => {
    expect(
      aggregateOverall([field('match'), field('mismatch')], warn('match')),
    ).toBe('fail');
  });

  it('a review with no fail -> review', () => {
    expect(
      aggregateOverall([field('match'), field('review')], warn('match')),
    ).toBe('review');
  });

  it('field missing (unread) -> review, not fail', () => {
    expect(
      aggregateOverall([field('match'), field('missing')], warn('match')),
    ).toBe('review');
  });

  it('fail outranks review (mismatch + review present)', () => {
    expect(
      aggregateOverall([field('review'), field('mismatch')], warn('review')),
    ).toBe('fail');
  });

  it('warning missing -> fail even when every field matches', () => {
    expect(
      aggregateOverall([field('match'), field('match')], warn('missing')),
    ).toBe('fail');
  });

  it('warning mismatch -> fail', () => {
    expect(aggregateOverall([field('match')], warn('mismatch'))).toBe('fail');
  });

  it('warning review (and no fail) -> review', () => {
    expect(aggregateOverall([field('match')], warn('review'))).toBe('review');
  });

  it('empty field list still honors the warning severity', () => {
    expect(aggregateOverall([], warn('match'))).toBe('pass');
    expect(aggregateOverall([], warn('missing'))).toBe('fail');
  });
});

// ---- Integration: compareLabel wires the real comparators end to end. ----

const SPIRITS: ExpectedLabel = {
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  netContents: '750 mL',
  beverageType: 'spirits',
};

function extracted(over: Partial<ExtractedLabel> = {}): ExtractedLabel {
  return {
    brand: 'Old Tom Distillery',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    proof: '90 Proof',
    netContents: '750 mL',
    warningText: GOVERNMENT_WARNING_CANONICAL,
    rawText: null,
    confidence: 0.95,
    ...over,
  };
}

describe('compareLabel — full label integration', () => {
  it('clean spirits label: 4 field results + warning, brand formatting -> match overall (D1)', () => {
    const r = compareLabel(SPIRITS, extracted());
    expect(r.fields.map((f) => f.field)).toEqual([
      'Brand',
      'Class/Type',
      'Alcohol Content',
      'Net Contents',
    ]);
    expect(r.warning.status).toBe('match');
    // brand differs only by case -> clean match (D1 decision 2026-06-12) -> overall pass
    expect(r.fields[0]!.status).toBe('match');
    expect(r.fields[0]!.detail).toMatch(/ignoring case/i);
    expect(r.overall).toBe('pass');
  });

  it('exact brand + everything matches -> overall pass', () => {
    const r = compareLabel(SPIRITS, extracted({ brand: 'OLD TOM DISTILLERY' }));
    expect(r.overall).toBe('pass');
    expect(r.fields.every((f) => f.status === 'match')).toBe(true);
  });

  it('wrong net contents -> overall fail', () => {
    const r = compareLabel(
      { ...SPIRITS, brand: 'OLD TOM DISTILLERY' },
      extracted({ netContents: '375 mL' }),
    );
    expect(r.fields[3]!.status).toBe('mismatch');
    expect(r.overall).toBe('fail');
  });

  it('reworded warning -> overall fail', () => {
    const r = compareLabel(
      { ...SPIRITS, brand: 'OLD TOM DISTILLERY' },
      extracted({ warningText: 'GOVERNMENT WARNING: Drinking is bad for you.' }),
    );
    expect(r.warning.status).toBe('mismatch');
    expect(r.overall).toBe('fail');
  });

  it('spirits with no ABV and no proof -> ABV flagged, overall not pass', () => {
    const r = compareLabel(
      { ...SPIRITS, brand: 'OLD TOM DISTILLERY' },
      extracted({ abv: null, proof: null }),
    );
    // spirits require a stated ABV; absent -> mismatch (compareAbv contract).
    expect(r.fields[2]!.status).toBe('mismatch');
    expect(r.overall).toBe('fail');
  });

  it('beer with no ABV (optional) -> ABV not failed; overall can pass', () => {
    const beer: ExpectedLabel = {
      brand: 'NORTHERN LIGHTS',
      classType: 'India Pale Ale',
      abv: '',
      netContents: '12 fl oz',
      beverageType: 'beer',
    };
    const r = compareLabel(
      beer,
      extracted({
        brand: 'NORTHERN LIGHTS',
        classType: 'India Pale Ale',
        abv: null,
        proof: null,
        netContents: '12 fl oz',
      }),
    );
    expect(r.fields[2]!.status).not.toBe('mismatch');
    expect(r.overall).not.toBe('fail');
  });

  it('proof cross-check fires: ABV + proof combined are passed to the comparator', () => {
    // 45% with a printed 80 Proof is internally inconsistent (should be 90).
    const r = compareLabel(
      { ...SPIRITS, brand: 'OLD TOM DISTILLERY' },
      extracted({ abv: '45% Alc./Vol.', proof: '80 Proof' }),
    );
    // The combined string reaches compareAbv, which flags the proof inconsistency.
    expect(r.fields[2]!.detail ?? '').toMatch(/proof/i);
  });
});
