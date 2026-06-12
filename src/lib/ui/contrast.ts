/**
 * T3.3 — pure WCAG 2.1 contrast math.
 *
 * Deterministic, I/O-free, framework-free (runs under the existing `node` vitest
 * environment, like the other `src/lib/ui` helpers). Used by `contrast.test.ts`
 * to assert — automatically, in CI — that every foreground/background colour pair
 * the UI renders meets the WCAG AA contrast bar. This is the "automated a11y
 * check" for colour (CONTEXT §2, PROJECT_PLAN §4/§8): contrast can't be verified
 * by axe under jsdom (no layout), so we guard the actual tokens here instead.
 */

/** WCAG AA minimum contrast ratios. */
export const AA_NORMAL_TEXT = 4.5;
/** Large text (>= 18.66px bold or >= 24px) and non-text UI (borders, focus). */
export const AA_LARGE_TEXT = 3.0;

/** Parse a #rgb or #rrggbb hex string into 0–255 channels. */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB channel (0–255) → linearised value, per WCAG. */
function lineariseChannel(value8bit: number): number {
  const c = value8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0 = black, 1 = white) of a hex colour, per WCAG. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    0.2126 * lineariseChannel(r) +
    0.7152 * lineariseChannel(g) +
    0.0722 * lineariseChannel(b)
  );
}

/** WCAG contrast ratio between two hex colours (1.0 … 21.0). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Does the pair clear the AA threshold for the given text size? */
export function meetsAA(
  hexA: string,
  hexB: string,
  large = false,
): boolean {
  const ratio = contrastRatio(hexA, hexB);
  return ratio >= (large ? AA_LARGE_TEXT : AA_NORMAL_TEXT);
}
