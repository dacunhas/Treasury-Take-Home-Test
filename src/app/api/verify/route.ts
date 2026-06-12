/**
 * T1.3 — POST /api/verify (single-label verification route).
 *
 * Thin transport adapter over `handler.ts`:
 *   1. read the multipart form (expected values + beverage type + image),
 *   2. validate + read the image into memory (parseVerifyForm),
 *   3. run the routed extractor + deterministic comparison (runVerification),
 *   4. return the VerificationResult, or a friendly error — never a stack trace.
 *
 * Error -> HTTP mapping lives in the pure `mapVerifyError` (errorMap.ts) so the
 * boundary guarantees (friendly JSON, no stack trace, missing-key -> 503) are
 * unit-tested without a Next.js Request or a live model call.
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
} from '@/lib/extractor';
import {
  parseVerifyForm,
  runVerification,
  type RoutedExtractor,
} from './handler';
import { mapVerifyError } from './errorMap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lazily built so a missing key never crashes module load / unrelated routes;
 * it surfaces as a friendly 503 only when a verification is actually attempted
 * (mapped by mapVerifyError). Cached across invocations on a warm serverless
 * instance.
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
    const mapped = mapVerifyError(err);
    // Secret-free diagnostic to the Vercel function log (omitted for the
    // expected 400 validation path). The message NEVER contains an API key.
    if (mapped.log) console.error(mapped.log);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/** Guard non-POST verbs with a friendly 405 rather than a framework default. */
export function GET(): Response {
  return NextResponse.json(
    { error: 'Use POST to verify a label.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
