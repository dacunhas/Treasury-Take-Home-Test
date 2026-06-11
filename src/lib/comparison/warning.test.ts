import { describe, it, expect } from 'vitest';
import { checkGovernmentWarning, diffWarningWords } from './warning';
import { GOVERNMENT_WARNING_CANONICAL } from '@/lib/governmentWarning';

const CANON = GOVERNMENT_WARNING_CANONICAL;

// A title-case-prefix variant: identical words, prefix not in all caps.
const TITLE_CASE_PREFIX = CANON.replace(
  'GOVERNMENT WARNING:',
  'Government Warning:',
);

// A reworded variant (drops "of birth defects" specificity; changes a clause).
const REWORDED =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, pregnant women ' +
  'should avoid alcohol. (2) Drinking impairs your ability to drive and may ' +
  'cause health problems.';

describe('checkGovernmentWarning — acceptance matrix', () => {
  it('exact canonical text -> match (pass)', () => {
    const r = checkGovernmentWarning(CANON);
    expect(r.status).toBe('match');
    expect(r.present).toBe(true);
    expect(r.prefixCaps).toBe(true);
    expect(r.textMatch).toBe(true);
    expect(r.diff).toBeUndefined();
  });

  it('exact text shrunk onto multiple wrapped lines -> still match (whitespace-normalized)', () => {
    const wrapped = CANON.replace(/ /g, (_m, i) => (i % 17 === 0 ? '\n   ' : ' '));
    const r = checkGovernmentWarning(wrapped);
    expect(r.status).toBe('match');
    expect(r.textMatch).toBe(true);
    // Honest note about formatting we cannot verify from text.
    expect(r.detail).toMatch(/bold\/font-size/i);
  });

  it('title-case "Government Warning:" prefix -> mismatch (fail)', () => {
    const r = checkGovernmentWarning(TITLE_CASE_PREFIX);
    expect(r.status).toBe('mismatch');
    expect(r.prefixCaps).toBe(false);
    expect(r.textMatch).toBe(false);
    expect(r.detail).toMatch(/all capital letters/i);
  });

  it('reworded warning -> mismatch (fail) with a word-level diff', () => {
    const r = checkGovernmentWarning(REWORDED);
    expect(r.status).toBe('mismatch');
    expect(r.textMatch).toBe(false);
    expect(r.prefixCaps).toBe(true);
    expect(r.diff && r.diff.length).toBeGreaterThan(0);
    // Diff must carry at least one removed (canonical) and one added (label) run.
    expect(r.diff!.some((s) => s.type === 'removed')).toBe(true);
    expect(r.diff!.some((s) => s.type === 'added')).toBe(true);
  });

  it('missing / empty warning -> missing (fail)', () => {
    for (const v of [null, '', '   ', '\n\t']) {
      const r = checkGovernmentWarning(v);
      expect(r.status).toBe('missing');
      expect(r.present).toBe(false);
      expect(r.detail).toMatch(/mandatory/i);
    }
  });

  it('correct words, only body letter-casing differs -> review (not a hard fail)', () => {
    const bodyCaseTweak = CANON.replace('According', 'ACCORDING');
    const r = checkGovernmentWarning(bodyCaseTweak);
    expect(r.status).toBe('review');
    expect(r.prefixCaps).toBe(true);
    expect(r.textMatch).toBe(false);
  });

  it('extra trailing text on the label -> mismatch with an added segment', () => {
    const r = checkGovernmentWarning(CANON + ' PLEASE DRINK RESPONSIBLY.');
    expect(r.status).toBe('mismatch');
    expect(r.diff!.some((s) => s.type === 'added')).toBe(true);
  });

  it('reworded AND lower-case prefix -> mismatch, prefixCaps false, with diff', () => {
    const r = checkGovernmentWarning(REWORDED.replace('GOVERNMENT WARNING:', 'Government warning:'));
    expect(r.status).toBe('mismatch');
    expect(r.prefixCaps).toBe(false);
    expect(r.textMatch).toBe(false);
    expect(r.diff && r.diff.length).toBeGreaterThan(0);
    expect(r.detail).toMatch(/not in all capital letters/i);
  });

  it('prefix not at the start (leading text) -> prefixCaps false', () => {
    const r = checkGovernmentWarning('SURGEON GENERAL NOTICE ' + CANON);
    expect(r.prefixCaps).toBe(false);
    expect(r.status).toBe('mismatch');
  });
});

describe('diffWarningWords', () => {
  it('identical text -> all equal, no added/removed', () => {
    const d = diffWarningWords('a b c', 'a b c');
    expect(d).toEqual([{ type: 'equal', text: 'a b c' }]);
  });

  it('a removed word is tagged removed', () => {
    const d = diffWarningWords('a b c', 'a c');
    expect(d).toContainEqual({ type: 'removed', text: 'b' });
  });

  it('an added word is tagged added', () => {
    const d = diffWarningWords('a c', 'a b c');
    expect(d).toContainEqual({ type: 'added', text: 'b' });
  });

  it('coalesces consecutive same-type tokens into one segment', () => {
    const d = diffWarningWords('a x y z d', 'a d');
    expect(d).toContainEqual({ type: 'removed', text: 'x y z' });
  });
});
