/**
 * T1.3 — /api/verify request handling (pure, transport-agnostic core).
 *
 * Split out from `route.ts` so the validation + verification logic is unit
 * testable with a MOCKED extractor — no Next.js Request, no live Gemini/Anthropic
 * call. `route.ts` is a thin adapter that wires the real RoutingExtractor and
 * maps thrown errors to HTTP responses.
 *
 * Flow:
 *   parseVerifyForm(formData)  -> validated ExpectedLabel + in-memory image
 *   runVerification(parsed, x) -> extractor.extractRouted -> compareLabel
 *                                 -> VerificationResult { ..., latencyMs, escalated }
 *
 * Stateless: the image is read into memory for the request only and never
 * persisted (CONTEXT §3 "don't store sensitive data").
 */
import type { BeverageType, ExpectedLabel, VerificationResult } from '@/types';
import {
  SUPPORTED_MIME_TYPES,
  type LabelImage,
  type RoutedExtraction,
} from '@/lib/extractor';
import { compareLabel } from '@/lib/comparison';
import { MAX_IMAGE_BYTES, MAX_IMAGE_LABEL } from '@/lib/ui/imageConstraints';

/**
 * Reject images larger than this to protect memory + the 5s budget.
 * Re-exported from the shared client/server source of truth (T3.2) so the API
 * and the form preflight enforce the identical limit.
 */
export { MAX_IMAGE_BYTES };

const BEVERAGE_TYPES: readonly BeverageType[] = ['spirits', 'wine', 'beer'];

/**
 * Human-readable list of accepted image types, derived from the single source of
 * truth (`SUPPORTED_MIME_TYPES`) so the messages can never drift from what the
 * extractor actually accepts (AUDIT MINOR, 2026-06-11).
 */
const SUPPORTED_TYPES_LABEL = (SUPPORTED_MIME_TYPES as readonly string[])
  .map((m) => m.split('/')[1]?.toUpperCase() ?? m)
  .join(', ');

/**
 * A friendly, client-safe validation failure. The route maps this to a 400 with
 * `message` as the body — never a stack trace (PROJECT_PLAN §5).
 */
export class VerifyValidationError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = 'VerifyValidationError';
  }
}

/** Validated, in-memory request ready for verification. */
export interface ParsedVerifyRequest {
  expected: ExpectedLabel;
  image: LabelImage;
  /** Decoded image size in bytes (diagnostics only; not persisted). */
  imageBytes: number;
}

/**
 * The only extractor surface the handler needs: the routed extraction that
 * carries the escalation flag. `RoutingExtractor` satisfies this; tests pass a
 * lightweight fake so no network call is ever made.
 */
export interface RoutedExtractor {
  extractRouted(image: LabelImage): Promise<RoutedExtraction>;
}

/** Read a trimmed string form field; '' when absent or a file. */
function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isSupportedMime(mime: string): boolean {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Validate the multipart form and read the image into memory. Throws
 * `VerifyValidationError` with a friendly message on any bad input.
 *
 * Required: brand, classType, netContents, beverageType, image.
 * Optional: abv — it is conditional by beverage type (beer / table-wine may omit
 * it), so a blank ABV is NOT rejected here; the comparison engine applies the
 * §5 rules. proof is not entered by the agent (read from the label only).
 */
export async function parseVerifyForm(
  formData: FormData,
): Promise<ParsedVerifyRequest> {
  const brand = field(formData, 'brand');
  const classType = field(formData, 'classType');
  const abv = field(formData, 'abv');
  const netContents = field(formData, 'netContents');
  const beverageTypeRaw = field(formData, 'beverageType').toLowerCase();
  const imageValue = formData.get('image');

  const hasAnyText = Boolean(
    brand || classType || abv || netContents || beverageTypeRaw,
  );
  const hasImage =
    imageValue instanceof Blob &&
    typeof imageValue.arrayBuffer === 'function' &&
    imageValue.size > 0;

  // Wholly empty submission -> one clear message rather than a field pile-up.
  if (!hasAnyText && !hasImage) {
    throw new VerifyValidationError(
      'Please enter the expected label values and upload a label image.',
    );
  }

  const missing: string[] = [];
  if (!brand) missing.push('brand name');
  if (!classType) missing.push('class/type');
  if (!netContents) missing.push('net contents');
  if (!beverageTypeRaw) missing.push('beverage type');
  if (missing.length > 0) {
    throw new VerifyValidationError(
      `Please fill in the following before verifying: ${missing.join(', ')}.`,
    );
  }

  if (!BEVERAGE_TYPES.includes(beverageTypeRaw as BeverageType)) {
    throw new VerifyValidationError(
      'Beverage type must be one of: Spirits, Wine, or Beer.',
    );
  }
  const beverageType = beverageTypeRaw as BeverageType;

  if (!(imageValue instanceof Blob) || imageValue.size === 0) {
    throw new VerifyValidationError(
      `Please upload a label image (${SUPPORTED_TYPES_LABEL}).`,
    );
  }
  const mimeType = imageValue.type || '';
  if (!isSupportedMime(mimeType)) {
    throw new VerifyValidationError(
      `That image type is not supported. Please upload a ${SUPPORTED_TYPES_LABEL} image.`,
    );
  }
  if (imageValue.size > MAX_IMAGE_BYTES) {
    throw new VerifyValidationError(
      `That image is too large. Please upload an image under ${MAX_IMAGE_LABEL}.`,
    );
  }

  const bytes = Buffer.from(await imageValue.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new VerifyValidationError(
      'The uploaded image appears to be empty. Please upload a clear label photo.',
    );
  }

  const expected: ExpectedLabel = {
    brand,
    classType,
    abv,
    netContents,
    beverageType,
  };
  const image: LabelImage = {
    base64: bytes.toString('base64'),
    mimeType,
  };
  return { expected, image, imageBytes: bytes.byteLength };
}

/**
 * Run extraction (with Flash -> Sonnet routing) then the deterministic
 * comparison engine, and assemble the `VerificationResult` with measured
 * latency and the escalation flag for the UI. The verdict comes only from the
 * pure engine — never from the model's opinion (CONTEXT §4).
 */
export async function runVerification(
  parsed: ParsedVerifyRequest,
  extractor: RoutedExtractor,
): Promise<VerificationResult> {
  const startedAt = Date.now();
  const routed = await extractor.extractRouted(parsed.image);
  const comparison = compareLabel(parsed.expected, routed.label);
  const latencyMs = Date.now() - startedAt;
  return {
    fields: comparison.fields,
    warning: comparison.warning,
    overall: comparison.overall,
    latencyMs,
    escalated: routed.escalated,
  };
}
