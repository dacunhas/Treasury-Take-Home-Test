import { describe, it, expect, vi } from 'vitest';
import { RoutingExtractor } from './router';
import {
  ExtractionError,
  type LabelExtractor,
  type LabelImage,
} from './types';
import type { ExtractedLabel } from '@/types';

const IMAGE: LabelImage = { base64: 'QUJD', mimeType: 'image/png' };

function label(
  name: string,
  confidence: number,
  extra: Partial<ExtractedLabel> = {},
): ExtractedLabel {
  return {
    brand: name,
    classType: null,
    abv: null,
    proof: null,
    netContents: null,
    warningText: null,
    rawText: null,
    confidence,
    ...extra,
  };
}

/** A fake extractor returning a fixed label (or throwing). */
function fake(
  name: string,
  result: ExtractedLabel | Error,
): LabelExtractor & { calls: number } {
  const ext = {
    name,
    calls: 0,
    async extract(_image: LabelImage): Promise<ExtractedLabel> {
      this.calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return ext;
}

describe('RoutingExtractor.extractRouted', () => {
  it('uses ONLY the primary tier when confidence >= threshold (protects the 5s SLA)', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.92));
    const deep = fake('claude-sonnet', label('SONNET', 0.99));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const r = await router.extractRouted(IMAGE);

    expect(r.escalated).toBe(false);
    expect(r.tier).toBe('primary');
    expect(r.extractorName).toBe('gemini-flash');
    expect(r.label.brand).toBe('FLASH');
    expect(r.primaryConfidence).toBeCloseTo(0.92);
    expect(deep.calls).toBe(0);
  });

  it('escalates to the deep tier when confidence < threshold and flags it', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.4));
    const deep = fake('claude-sonnet', label('SONNET', 0.95));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const r = await router.extractRouted(IMAGE);

    expect(r.escalated).toBe(true);
    expect(r.tier).toBe('deep');
    expect(r.extractorName).toBe('claude-sonnet');
    expect(r.label.brand).toBe('SONNET');
    expect(r.primaryConfidence).toBeCloseTo(0.4);
    expect(deep.calls).toBe(1);
  });

  it('treats confidence exactly at the threshold as confident (no escalation)', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.7));
    const deep = fake('claude-sonnet', label('SONNET', 0.99));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const r = await router.extractRouted(IMAGE);

    expect(r.escalated).toBe(false);
    expect(deep.calls).toBe(0);
  });

  it('falls back to the primary result (flagged escalated) when the deep tier fails', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.3));
    const deep = fake(
      'claude-sonnet',
      new ExtractionError('deep down', 'timeout'),
    );
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const r = await router.extractRouted(IMAGE);

    expect(r.escalated).toBe(true);
    expect(r.tier).toBe('primary');
    expect(r.label.brand).toBe('FLASH');
    expect(r.deepTierError).toBe('timeout');
  });

  it('records "unknown" deep-tier error code for a non-ExtractionError throw', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.1));
    const deep = fake('claude-sonnet', new TypeError('boom'));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const r = await router.extractRouted(IMAGE);
    expect(r.deepTierError).toBe('unknown');
  });

  it('propagates a primary-tier failure (nothing to fall back to)', async () => {
    const primary = fake(
      'gemini-flash',
      new ExtractionError('no network', 'network'),
    );
    const deep = fake('claude-sonnet', label('SONNET', 0.9));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    await expect(router.extractRouted(IMAGE)).rejects.toMatchObject({
      code: 'network',
    });
    expect(deep.calls).toBe(0);
  });

  it('extract() satisfies LabelExtractor and returns just the chosen label', async () => {
    const primary = fake('gemini-flash', label('FLASH', 0.2));
    const deep = fake('claude-sonnet', label('SONNET', 0.96));
    const router = new RoutingExtractor(primary, deep, { threshold: 0.7 });

    const out = await router.extract(IMAGE);
    expect(out.brand).toBe('SONNET');
    expect(router.name).toBe('router');
  });

  it('uses the env-driven threshold (0.7 default) when none is provided', async () => {
    const prev = process.env.EXTRACTION_CONFIDENCE_THRESHOLD;
    delete process.env.EXTRACTION_CONFIDENCE_THRESHOLD;
    try {
      const primary = fake('gemini-flash', label('FLASH', 0.65));
      const deep = fake('claude-sonnet', label('SONNET', 0.99));
      const router = new RoutingExtractor(primary, deep);
      const r = await router.extractRouted(IMAGE);
      expect(r.threshold).toBeCloseTo(0.7);
      expect(r.escalated).toBe(true); // 0.65 < 0.7
    } finally {
      if (prev === undefined) delete process.env.EXTRACTION_CONFIDENCE_THRESHOLD;
      else process.env.EXTRACTION_CONFIDENCE_THRESHOLD = prev;
    }
  });
});
