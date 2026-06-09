import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MissingConfigError,
  getConfidenceThreshold,
  getGeminiApiKey,
  getAnthropicApiKey,
  hasGeminiApiKey,
} from './config';

const ORIGINAL = { ...process.env };

describe('config loader', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.EXTRACTION_CONFIDENCE_THRESHOLD;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('throws a clear MissingConfigError when Gemini key absent', () => {
    expect(() => getGeminiApiKey()).toThrow(MissingConfigError);
    expect(() => getGeminiApiKey()).toThrow(/GEMINI_API_KEY/);
  });

  it('throws when Anthropic key absent', () => {
    expect(() => getAnthropicApiKey()).toThrow(MissingConfigError);
  });

  it('treats whitespace-only key as missing', () => {
    process.env.GEMINI_API_KEY = '   ';
    expect(hasGeminiApiKey()).toBe(false);
    expect(() => getGeminiApiKey()).toThrow(MissingConfigError);
  });

  it('returns the key when present', () => {
    process.env.GEMINI_API_KEY = 'test-key-123';
    expect(getGeminiApiKey()).toBe('test-key-123');
    expect(hasGeminiApiKey()).toBe(true);
  });

  it('error message never echoes the secret value', () => {
    process.env.GEMINI_API_KEY = '';
    try {
      getGeminiApiKey();
    } catch (e) {
      expect((e as Error).message).not.toContain('test-key');
    }
  });

  it('defaults confidence threshold to 0.7', () => {
    expect(getConfidenceThreshold()).toBe(0.7);
  });

  it('reads a valid confidence threshold from env', () => {
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD = '0.85';
    expect(getConfidenceThreshold()).toBe(0.85);
  });

  it('falls back to default on an out-of-range threshold', () => {
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD = '5';
    expect(getConfidenceThreshold()).toBe(0.7);
  });
});
