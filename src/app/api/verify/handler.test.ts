/**
 * T1.3 — /api/verify handler tests.
 *
 * The extractor is MOCKED (a tiny in-memory fake) — no live Gemini/Anthropic
 * call is ever made, per AGENTS.md §3 and the unattended-run rule. These tests
 * cover input validation (the friendly 4xx paths) and the happy-path assembly
 * of a VerificationResult from the deterministic comparison engine.
 */
import { describe, it, expect } from 'vitest';
import type { ExtractedLabel } from '@/types';
import type { LabelImage, RoutedExtraction } from '@/lib/extractor';
import { GOVERNMENT_WARNING_CANONICAL } from '@/lib/governmentWarning';
import {
  parseVerifyForm,
  runVerification,
  VerifyValidationError,
  MAX_IMAGE_BYTES,
  type RoutedExtractor,
} from './handler';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageFile(
  type = 'image/png',
  bytes: Uint8Array = PNG_BYTES,
): File {
  return new File([bytes], 'label.png', { type });
}

/** Build a valid multipart form for the CONTEXT §5 sample bourbon label. */
function validForm(overrides: Record<string, string> = {}, image?: File): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    brand: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    netContents: '750 mL',
    beverageType: 'spirits',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== '') fd.append(k, v);
  }
  fd.append('image', image ?? imageFile());
  return fd;
}

/** A fake routed extractor that records the image and returns a fixed label. */
function fakeExtractor(
  label: ExtractedLabel,
  escalated = false,
): RoutedExtractor & { received: LabelImage | null } {
  const state = {
    received: null as LabelImage | null,
    async extractRouted(image: LabelImage): Promise<RoutedExtraction> {
      state.received = image;
      return {
        label,
        escalated,
        tier: escalated ? 'deep' : 'primary',
        extractorName: escalated ? 'claude-sonnet' : 'gemini-flash',
        primaryConfidence: escalated ? 0.4 : 0.95,
        threshold: 0.7,
      };
    },
  };
  return state;
}

/** Extracted label that matches the sample bourbon expected values exactly. */
const MATCHING_LABEL: ExtractedLabel = {
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  proof: '90 Proof',
  netContents: '750 mL',
  warningText: GOVERNMENT_WARNING_CANONICAL,
  rawText: null,
  confidence: 0.95,
};

describe('parseVerifyForm — validation', () => {
  it('parses a valid form into expected values + an in-memory image', async () => {
    const parsed = await parseVerifyForm(validForm());
    expect(parsed.expected).toEqual({
      brand: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      abv: '45% Alc./Vol.',
      netContents: '750 mL',
      beverageType: 'spirits',
    });
    expect(parsed.image.mimeType).toBe('image/png');
    expect(parsed.image.base64.length).toBeGreaterThan(0);
    expect(parsed.imageBytes).toBe(PNG_BYTES.byteLength);
  });

  it('rejects a wholly empty submission with one clear message', async () => {
    await expect(parseVerifyForm(new FormData())).rejects.toBeInstanceOf(
      VerifyValidationError,
    );
    await expect(parseVerifyForm(new FormData())).rejects.toThrow(
      /enter the expected label values/i,
    );
  });

  it('lists missing required fields', async () => {
    const fd = validForm({ brand: '', classType: '' });
    await expect(parseVerifyForm(fd)).rejects.toThrow(
      /brand name.*class\/type/i,
    );
  });

  it('rejects an unknown beverage type', async () => {
    await expect(parseVerifyForm(validForm({ beverageType: 'cider' }))).rejects.toThrow(
      /Spirits, Wine, or Beer/i,
    );
  });

  it('accepts case-insensitive beverage type', async () => {
    const parsed = await parseVerifyForm(validForm({ beverageType: 'Wine' }));
    expect(parsed.expected.beverageType).toBe('wine');
  });

  it('rejects a submission with text but no image', async () => {
    const fd = new FormData();
    fd.append('brand', 'OLD TOM DISTILLERY');
    fd.append('classType', 'Kentucky Straight Bourbon Whiskey');
    fd.append('netContents', '750 mL');
    fd.append('beverageType', 'spirits');
    await expect(parseVerifyForm(fd)).rejects.toThrow(/upload a label image/i);
  });

  it('rejects an unsupported image type', async () => {
    const fd = validForm({}, imageFile('image/gif'));
    await expect(parseVerifyForm(fd)).rejects.toThrow(/not supported/i);
  });

  it('rejects an oversized image', async () => {
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    await expect(parseVerifyForm(validForm({}, big))).rejects.toThrow(/too large/i);
  });

  it('allows a blank ABV for beer (conditional by beverage type)', async () => {
    const parsed = await parseVerifyForm(
      validForm({ abv: '', beverageType: 'beer' }),
    );
    expect(parsed.expected.abv).toBe('');
    expect(parsed.expected.beverageType).toBe('beer');
  });
});

describe('runVerification — assembly', () => {
  it('returns a pass VerificationResult for a fully matching label', async () => {
    const parsed = await parseVerifyForm(validForm());
    const extractor = fakeExtractor(MATCHING_LABEL);
    const result = await runVerification(parsed, extractor);

    expect(result.overall).toBe('pass');
    expect(result.fields).toHaveLength(4);
    expect(result.warning.textMatch).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.escalated).toBe(false);
    // The exact in-memory image is what we hand the extractor (stateless pass-through).
    expect(extractor.received?.base64).toBe(parsed.image.base64);
  });

  it('propagates the escalation flag from the router', async () => {
    const parsed = await parseVerifyForm(validForm());
    const result = await runVerification(
      parsed,
      fakeExtractor(MATCHING_LABEL, true),
    );
    expect(result.escalated).toBe(true);
  });

  it('produces a fail verdict when the warning is altered', async () => {
    const parsed = await parseVerifyForm(validForm());
    const reworded: ExtractedLabel = {
      ...MATCHING_LABEL,
      warningText: 'GOVERNMENT WARNING: drinking is bad for you.',
    };
    const result = await runVerification(parsed, fakeExtractor(reworded));
    expect(result.overall).toBe('fail');
  });
});
