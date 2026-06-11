/**
 * T1.3 — POST /api/verify (single-label verification route).
 *
 * Thin transport adapter over `handler.ts`:
 *   1. read the multipart form (expected values + beverage type + image),
 *   2. validate + read the image into memory (parseVerifyForm),
 *   3. run the routed extractor + deterministic comparison (runVerification),
 *   4. return the VerificationResult, or a friendly error — never a stack trace.
 *
 * Node runtime: the extractors use Buffer/base64 and a fetch timeout; this also
 * keeps the request off the Edge body-size limits. Stateless: nothing is
 * persisted (CONTEXT §3).
 */
import { NextResponse } from 'next/server';
import {
  RoutingExtractor,
  GeminiExtractor,
  SonnetExtractor,
  ExtractionError,
} from '@/lib/extractor';
import { MissingConfigError } from '@/lib/config';
import {
  parseVerifyForm,
  runVerification,
  VerifyValidationError,
  type RoutedExtractor,
} from './handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lazily built so a missing key never crashes module load / unrelated routes;
 * it surfaces as a friendly 503 only when a verification is actually attempted.
 * Cached across invocations on a warm serverless instance.
 */
let cachedExtractor: RoutedExtractor | null = null;
function getExtractor(): RoutedExtractor {
  if (!cachedExtractor) {
    cachedExtractor = new RoutingExtractor(
      new GeminiExtractor(),
      new SonnetExtractor(),
    );
  }
  return cachedExtractor;
}

/**
 * DIAGNOSTIC (benchmark-only): allow a request to pin which Gemini model the
 * fast tier uses, so latency/accuracy of candidate models can be compared on the
 * live URL without a redeploy. Strictly allow-listed to a few cheap Gemini Flash
 * models — an unknown value is ignored and the configured default is used, so it
 * cannot be abused to invoke arbitrary/expensive models. Remove or gate to
 * non-production before final submission.
 */
const BENCHMARK_MODELS: readonly string[] = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];
function overrideExtractor(formData: FormData): RoutedExtractor | null {
  const raw = formData.get('__model');
  const model = typeof raw === 'string' ? raw.trim() : '';
  if (!model || !BENCHMARK_MODELS.includes(model)) return null;
  return new RoutingExtractor(new GeminiExtractor({ model }), new SonnetExtractor());
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          'This endpoint expects a multipart form upload with the expected values and a label image.',
      },
      { status: 400 },
    );
  }

  try {
    const parsed = await parseVerifyForm(formData);
    const extractor = overrideExtractor(formData) ?? getExtractor();
    const result = await runVerification(parsed, extractor);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof VerifyValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof MissingConfigError) {
      // Server misconfiguration (no inference key). Don't leak the key name.
      console.error('[verify] missing inference configuration (no API key present)');
      return NextResponse.json(
        {
          error:
            'The label-reading service is not configured right now. Please contact support.',
        },
        { status: 503 },
      );
    }
    if (err instanceof ExtractionError) {
      // Diagnostic only: record the machine code + our own (secret-free) error
      // message so a production extraction failure shows the provider status in
      // the Vercel function log. The message NEVER contains the API key — the
      // extractors deliberately omit the provider body (see gemini.ts/sonnet.ts).
      console.error(
        `[verify] extraction failed: code=${err.code} detail=${err.message}`,
      );
      const message =
        err.code === 'input'
          ? 'That image could not be processed. Please upload a clear PNG, JPEG, or WebP.'
          : "We couldn't read the label clearly right now. Please try again, or upload a better photo.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    // Unknown server error — friendly message, no stack trace to the client.
    console.error(
      `[verify] unexpected error: ${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? String(err)}`,
    );
    return NextResponse.json(
      {
        error:
          'Something went wrong verifying the label. Please try again in a moment.',
      },
      { status: 500 },
    );
  }
}

/** Guard non-POST verbs with a friendly 405 rather than a framework default. */
export function GET(): Response {
  return NextResponse.json(
    { error: 'Use POST to verify a label.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
