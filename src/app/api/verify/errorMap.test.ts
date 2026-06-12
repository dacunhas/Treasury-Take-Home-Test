/**
 * T5.4/A2 — tests for the pure /api/verify error -> HTTP mapping.
 *
 * Focus: a *lazily-resolved* missing inference key (MissingConfigError) returns
 * the friendly 503 JSON, never a stack trace, and never leaks the key name —
 * the A2 acceptance bar. Also pins the 400 / 502 / 500 paths so route.ts stays a
 * thin adapter with all mapping logic verified here (no Next.js Request needed).
 */
import { describe, it, expect } from 'vitest';
import { mapVerifyError } from './errorMap';
import { VerifyValidationError } from './handler';
import { MissingConfigError } from '@/lib/config';
import { ExtractionError } from '@/lib/extractor';

describe('mapVerifyError', () => {
  it('maps a validation error to a friendly 400 and no log', () => {
    const mapped = mapVerifyError(
      new VerifyValidationError('Please upload a label image (PNG, JPEG).'),
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toBe('Please upload a label image (PNG, JPEG).');
    expect(mapped.log).toBeUndefined();
  });

  describe('missing inference key (A2)', () => {
    it('returns a friendly 503 JSON for a missing GEMINI_API_KEY', () => {
      const mapped = mapVerifyError(new MissingConfigError('GEMINI_API_KEY'));
      expect(mapped.status).toBe(503);
      expect(mapped.body).toEqual({
        error:
          'The label-reading service is not configured right now. Please contact support.',
      });
    });

    it('returns a friendly 503 for a missing ANTHROPIC_API_KEY (deep tier)', () => {
      const mapped = mapVerifyError(new MissingConfigError('ANTHROPIC_API_KEY'));
      expect(mapped.status).toBe(503);
    });

    it('never leaks the key name or the config error text to the client', () => {
      const mapped = mapVerifyError(new MissingConfigError('GEMINI_API_KEY'));
      const body = JSON.stringify(mapped.body);
      expect(body).not.toContain('GEMINI_API_KEY');
      expect(body).not.toContain('Missing required environment variable');
      expect(body).not.toContain('.env.local');
    });

    it('never writes the key name into the server log line', () => {
      const mapped = mapVerifyError(new MissingConfigError('ANTHROPIC_API_KEY'));
      expect(mapped.log).toBeDefined();
      expect(mapped.log).not.toContain('ANTHROPIC_API_KEY');
      expect(mapped.log).not.toContain('Missing required environment variable');
    });

    it('does NOT collapse a config error into a 502 extraction message', () => {
      // A server misconfig is not the agent's fault — must not say "upload a
      // better photo" (would be an ExtractionError/502).
      const mapped = mapVerifyError(new MissingConfigError('GEMINI_API_KEY'));
      expect(mapped.status).not.toBe(502);
      expect(mapped.body.error.toLowerCase()).not.toContain('photo');
    });
  });

  describe('extraction failures', () => {
    it('maps an unreadable-input ExtractionError to a 502 image message', () => {
      const mapped = mapVerifyError(
        new ExtractionError('decoded image was empty', 'input'),
      );
      expect(mapped.status).toBe(502);
      expect(mapped.body.error).toContain('clear PNG');
      expect(mapped.log).toContain('code=input');
    });

    it('maps a transport ExtractionError to a 502 retry message', () => {
      const mapped = mapVerifyError(
        new ExtractionError('upstream 500', 'http'),
      );
      expect(mapped.status).toBe(502);
      expect(mapped.body.error).toContain('try again');
      expect(mapped.log).toContain('code=http');
    });
  });

  describe('unknown errors', () => {
    it('maps an unexpected Error to a friendly 500 with a secret-free log', () => {
      const mapped = mapVerifyError(new TypeError('cannot read prop x of undefined'));
      expect(mapped.status).toBe(500);
      expect(mapped.body.error).toBe(
        'Something went wrong verifying the label. Please try again in a moment.',
      );
      expect(mapped.log).toContain('TypeError');
    });

    it('handles a non-Error throw without crashing', () => {
      const mapped = mapVerifyError('boom');
      expect(mapped.status).toBe(500);
      expect(mapped.body.error).toMatch(/Something went wrong/);
    });
  });

  it('never returns a multi-line (stack-like) client message', () => {
    for (const err of [
      new MissingConfigError('GEMINI_API_KEY'),
      new ExtractionError('x', 'network'),
      new Error('y\n  at foo (bar.ts:1:1)'),
    ]) {
      const mapped = mapVerifyError(err);
      expect(mapped.body.error).not.toContain('\n');
      expect(mapped.body.error).not.toContain('    at ');
    }
  });
});
