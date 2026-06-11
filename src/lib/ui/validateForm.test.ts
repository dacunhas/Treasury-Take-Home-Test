import { describe, it, expect } from 'vitest';
import {
  validateVerifyForm,
  type VerifyFormInput,
} from '@/lib/ui/validateForm';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from '@/lib/ui/imageConstraints';
import { SUPPORTED_MIME_TYPES } from '@/lib/extractor';

const goodImage = { type: 'image/png', size: 1024 };

function base(overrides: Partial<VerifyFormInput> = {}): VerifyFormInput {
  return {
    brand: 'OLD TOM DISTILLERY',
    classType: '',
    abv: '',
    netContents: '',
    image: goodImage,
    ...overrides,
  };
}

describe('validateVerifyForm', () => {
  it('passes when at least one expected value and a valid image are present', () => {
    expect(validateVerifyForm(base())).toEqual({ ok: true });
  });

  it('passes when only a non-brand field is filled (any expected value counts)', () => {
    const r = validateVerifyForm(
      base({ brand: '', netContents: '750 mL' }),
    );
    expect(r.ok).toBe(true);
  });

  it('fails (focus brand) when no expected values are entered', () => {
    const r = validateVerifyForm(
      base({ brand: '', classType: '', abv: '', netContents: '' }),
    );
    expect(r).toEqual({
      ok: false,
      focus: 'brand',
      message: expect.stringContaining('at least one expected value'),
    });
  });

  it('treats whitespace-only expected values as empty', () => {
    const r = validateVerifyForm(
      base({ brand: '   ', classType: '\t', abv: ' ', netContents: '\n' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.focus).toBe('brand');
  });

  it('fails (focus image) when no image is chosen', () => {
    const r = validateVerifyForm(base({ image: null }));
    expect(r).toEqual({
      ok: false,
      focus: 'image',
      message: expect.stringContaining('upload a label image'),
    });
  });

  it('treats a zero-byte file as a missing image', () => {
    const r = validateVerifyForm(base({ image: { type: 'image/png', size: 0 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.focus).toBe('image');
      expect(r.message).toContain('upload a label image');
    }
  });

  it('fails on an unsupported image type', () => {
    const r = validateVerifyForm(
      base({ image: { type: 'application/pdf', size: 2048 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.focus).toBe('image');
      expect(r.message).toContain('not supported');
    }
  });

  it('accepts every declared MIME type (case-insensitive)', () => {
    for (const mime of ACCEPTED_IMAGE_MIME_TYPES) {
      expect(
        validateVerifyForm(base({ image: { type: mime, size: 100 } })).ok,
      ).toBe(true);
      expect(
        validateVerifyForm(
          base({ image: { type: mime.toUpperCase(), size: 100 } }),
        ).ok,
      ).toBe(true);
    }
  });

  it('fails on an oversize image', () => {
    const r = validateVerifyForm(
      base({ image: { type: 'image/png', size: MAX_IMAGE_BYTES + 1 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.focus).toBe('image');
      expect(r.message).toContain('too large');
    }
  });

  it('accepts an image exactly at the size limit (inclusive boundary)', () => {
    const r = validateVerifyForm(
      base({ image: { type: 'image/png', size: MAX_IMAGE_BYTES } }),
    );
    expect(r.ok).toBe(true);
  });

  it('reports the empty-form problem before the image problem', () => {
    // Both wrong: no expected values AND no image -> expected wins (checked first).
    const r = validateVerifyForm(
      base({ brand: '', classType: '', abv: '', netContents: '', image: null }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.focus).toBe('brand');
  });

  it('drift guard: client accepted MIME set matches the extractor authority', () => {
    expect([...ACCEPTED_IMAGE_MIME_TYPES].sort()).toEqual(
      [...SUPPORTED_MIME_TYPES].sort(),
    );
  });
});
