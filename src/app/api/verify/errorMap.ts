/**
 * T5.4/A2 — pure error -> HTTP response mapping for POST /api/verify.
 *
 * Split out of `route.ts` so the boundary mapping is unit-testable with no
 * Next.js Request and no live model call. This is the guarantee that the UI
 * never sees a stack trace: every thrown error becomes a friendly
 * `{ error }` JSON body + an HTTP status, plus an optional secret-free server
 * log line.
 *
 * A2 design note — a *lazily-resolved* `MissingConfigError` (a missing
 * GEMINI_API_KEY / ANTHROPIC_API_KEY, thrown only when a verification is first
 * attempted) is a SERVER misconfiguration, not an extraction failure. It maps to
 * a friendly 503 ("not configured — contact support"), deliberately NOT collapsed
 * into an `ExtractionError`/502 ("upload a better photo"), which would mislead the
 * agent about a problem they cannot fix. The key NAME never appears in the client
 * message or the log line.
 */
import { ExtractionError } from '@/lib/extractor';
import { MissingConfigError } from '@/lib/config';
import { VerifyValidationError } from './handler';

export interface MappedErrorResponse {
  /** HTTP status to return. */
  status: number;
  /** Friendly, client-safe JSON body — never a stack trace. */
  body: { error: string };
  /**
   * Secret-free diagnostic line for the server log (Vercel function log).
   * Omitted for the expected validation path (a 400 is not an operational
   * incident). Never contains an API key or a key name.
   */
  log?: string;
}

/**
 * Map any error thrown while verifying a label to a friendly HTTP response.
 * Pure: no logging, no I/O — the caller logs `log` if present.
 */
export function mapVerifyError(err: unknown): MappedErrorResponse {
  // Expected, client-fixable bad input -> 400 with the friendly message.
  if (err instanceof VerifyValidationError) {
    return { status: err.status, body: { error: err.message } };
  }

  // Server misconfiguration: an inference key is missing (surfaced lazily on the
  // first real extraction). Friendly 503; never leak the key name (A2).
  if (err instanceof MissingConfigError) {
    return {
      status: 503,
      body: {
        error:
          'The label-reading service is not configured right now. Please contact support.',
      },
      log: '[verify] missing inference configuration (no API key present)',
    };
  }

  // Extraction failed (provider network/HTTP/timeout/unreadable input) -> 502.
  // The extractors omit the provider body, so `err.message` is secret-free.
  if (err instanceof ExtractionError) {
    const message =
      err.code === 'input'
        ? 'That image could not be processed. Please upload a clear PNG, JPEG, or WebP.'
        : "We couldn't read the label clearly right now. Please try again, or upload a better photo.";
    return {
      status: 502,
      body: { error: message },
      log: `[verify] extraction failed: code=${err.code} detail=${err.message}`,
    };
  }

  // Anything else -> generic 500, friendly message, secret-free diagnostic.
  const name = (err as Error)?.name ?? 'Error';
  const detail = (err as Error)?.message ?? String(err);
  return {
    status: 500,
    body: {
      error:
        'Something went wrong verifying the label. Please try again in a moment.',
    },
    log: `[verify] unexpected error: ${name}: ${detail}`,
  };
}
