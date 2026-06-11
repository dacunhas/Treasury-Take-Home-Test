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
    const result = await runVerification(parsed, getExtractor());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof VerifyValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof MissingConfigError) {
      // Server misconfiguration (no inference key). Don't leak the key name.
      return NextResponse.json(
        {
          error:
            'The label-reading service is not configured right now. Please contact support.',
        },
        { status: 503 },
      );
    }
    if (err instanceof ExtractionError) {
      const message =
        err.code === 'input'
          ? 'That image could not be processed. Please upload a clear PNG, JPEG, or WebP.'
          : "We couldn't read the label clearly right now. Please try again, or upload a better photo.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    // Unknown server error — friendly message, no stack trace to the client.
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
