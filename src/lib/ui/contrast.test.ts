import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  meetsAA,
  parseHex,
  relativeLuminance,
} from './contrast';
import { COLORS } from './colors';
import {
  FIELD_STATUS_PRESENTATION,
  OVERALL_PRESENTATION,
} from './format';

describe('contrast math (WCAG 2.1)', () => {
  it('parses #rgb and #rrggbb', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('1a1a1a')).toEqual({ r: 26, g: 26, b: 26 });
  });

  it('rejects malformed hex', () => {
    expect(() => parseHex('#12')).toThrow();
    expect(() => parseHex('nope')).toThrow();
  });

  it('luminance endpoints: black 0, white 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('black-on-white is the maximal 21:1 ratio (order-independent)', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });

  it('meetsAA respects the size threshold', () => {
    // #777 on white ~ 4.48:1 — fails normal, passes large.
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(AA_LARGE_TEXT);
    expect(meetsAA('#777777', '#ffffff', false)).toBe(false);
    expect(meetsAA('#777777', '#ffffff', true)).toBe(true);
  });
});

describe('every rendered colour pair clears WCAG AA (automated a11y check)', () => {
  it('overall verdict banners: foreground on its background >= 4.5', () => {
    for (const [name, p] of Object.entries(OVERALL_PRESENTATION)) {
      const ratio = contrastRatio(p.fg, p.bg);
      expect(ratio, `overall "${name}" ${p.fg} on ${p.bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it('field-status labels render on white >= 4.5', () => {
    for (const [name, p] of Object.entries(FIELD_STATUS_PRESENTATION)) {
      const ratio = contrastRatio(p.fg, COLORS.white);
      expect(ratio, `field "${name}" ${p.fg} on white = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it('body / muted / detail text on white >= 4.5', () => {
    for (const fg of [COLORS.text, COLORS.muted, COLORS.detail]) {
      expect(meetsAA(fg, COLORS.white, false), `${fg} on white`).toBe(true);
    }
  });

  it('button text on both the idle and busy backgrounds >= 4.5', () => {
    expect(meetsAA(COLORS.buttonText, COLORS.buttonBg, false)).toBe(true);
    expect(meetsAA(COLORS.buttonText, COLORS.buttonBusyBg, false)).toBe(true);
  });

  it('error text on the error background >= 4.5', () => {
    expect(meetsAA(COLORS.errorFg, COLORS.errorBg, false)).toBe(true);
  });

  it('diff legend colours on the diff panel >= 4.5', () => {
    expect(meetsAA(COLORS.diffRemoved, COLORS.diffPanelBg, false)).toBe(true);
    expect(meetsAA(COLORS.diffAdded, COLORS.diffPanelBg, false)).toBe(true);
  });

  it('non-text UI (input border, error border) on white >= 3.0', () => {
    expect(meetsAA(COLORS.inputBorder, COLORS.white, true)).toBe(true);
    expect(meetsAA(COLORS.errorBorder, COLORS.white, true)).toBe(true);
  });

  it('focus ring on white clears the 3:1 non-text bar', () => {
    expect(meetsAA('#0b3d91', COLORS.white, true)).toBe(true);
  });
});
