import { describe, it, expect } from 'vitest';
import { computeScaledSize, DEFAULT_MAX_EDGE } from '@/lib/ui/imageResize';

describe('computeScaledSize', () => {
  it('does not scale an image already within the limit', () => {
    expect(computeScaledSize(1000, 800, 1568)).toEqual({
      width: 1000,
      height: 800,
      scaled: false,
    });
  });

  it('scales a landscape image to the max longest edge, preserving aspect', () => {
    const r = computeScaledSize(4000, 3000, 1568);
    expect(r.scaled).toBe(true);
    expect(r.width).toBe(1568);
    expect(r.height).toBe(1176); // 3000 * 1568/4000
  });

  it('scales a portrait image by its height (longest side)', () => {
    const r = computeScaledSize(3000, 4000, 1568);
    expect(r.scaled).toBe(true);
    expect(r.height).toBe(1568);
    expect(r.width).toBe(1176);
  });

  it('treats the limit as inclusive (exactly maxEdge does not scale)', () => {
    expect(computeScaledSize(1568, 900, 1568).scaled).toBe(false);
  });

  it('never produces a zero dimension for extreme aspect ratios', () => {
    const r = computeScaledSize(5000, 2, 1568);
    expect(r.scaled).toBe(true);
    expect(r.width).toBe(1568);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it('returns unscaled for invalid input', () => {
    expect(computeScaledSize(0, 0, 1568).scaled).toBe(false);
    expect(computeScaledSize(4000, 3000, 0).scaled).toBe(false);
    expect(computeScaledSize(NaN, 100, 1568).scaled).toBe(false);
  });

  it('exposes a sane default max edge', () => {
    expect(DEFAULT_MAX_EDGE).toBeGreaterThanOrEqual(1024);
    expect(DEFAULT_MAX_EDGE).toBeLessThanOrEqual(2048);
  });
});
