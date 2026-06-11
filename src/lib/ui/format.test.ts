import { describe, it, expect } from 'vitest';
import {
  OVERALL_PRESENTATION,
  FIELD_STATUS_PRESENTATION,
  formatLatencySeconds,
  formatVerifiedLine,
  overallPresentation,
  fieldStatusPresentation,
} from './format';

describe('formatLatencySeconds', () => {
  it('formats ms to one decimal place of seconds', () => {
    expect(formatLatencySeconds(3200)).toBe('3.2');
    expect(formatLatencySeconds(0)).toBe('0.0');
    expect(formatLatencySeconds(4990)).toBe('5.0');
    expect(formatLatencySeconds(449)).toBe('0.4');
  });

  it('floors invalid or negative input to 0.0 (clock skew / NaN safe)', () => {
    expect(formatLatencySeconds(-100)).toBe('0.0');
    expect(formatLatencySeconds(Number.NaN)).toBe('0.0');
    expect(formatLatencySeconds(Number.POSITIVE_INFINITY)).toBe('0.0');
  });
});

describe('formatVerifiedLine', () => {
  it('renders the plain "Verified in N.Ns" line by default', () => {
    expect(formatVerifiedLine(3200)).toBe('Verified in 3.2s');
    expect(formatVerifiedLine(3200, false)).toBe('Verified in 3.2s');
  });

  it('appends the closer-check note when the deep tier escalated', () => {
    expect(formatVerifiedLine(6100, true)).toBe(
      'Verified in 6.1s (a closer check was run)',
    );
  });
});

describe('overall presentation', () => {
  it('uses plain language and a non-color glyph for every verdict', () => {
    expect(OVERALL_PRESENTATION.pass.label).toBe('Looks good');
    expect(OVERALL_PRESENTATION.review.label).toBe('Please check');
    expect(OVERALL_PRESENTATION.fail.label).toBe("Doesn't match");
    for (const p of Object.values(OVERALL_PRESENTATION)) {
      expect(p.glyph.length).toBeGreaterThan(0);
      expect(p.summary.length).toBeGreaterThan(0);
    }
  });

  it('overallPresentation falls back to review for an unknown verdict', () => {
    // @ts-expect-error exercising the runtime fallback path
    expect(overallPresentation('bogus')).toBe(OVERALL_PRESENTATION.review);
    expect(overallPresentation('pass')).toBe(OVERALL_PRESENTATION.pass);
  });
});

describe('field status presentation', () => {
  it('covers all four field statuses with a word + glyph', () => {
    for (const status of ['match', 'review', 'mismatch', 'missing'] as const) {
      const p = FIELD_STATUS_PRESENTATION[status];
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.glyph.length).toBeGreaterThan(0);
    }
  });

  it('fieldStatusPresentation falls back to review for an unknown status', () => {
    // @ts-expect-error exercising the runtime fallback path
    expect(fieldStatusPresentation('weird')).toBe(
      FIELD_STATUS_PRESENTATION.review,
    );
    expect(fieldStatusPresentation('match')).toBe(
      FIELD_STATUS_PRESENTATION.match,
    );
  });
});
