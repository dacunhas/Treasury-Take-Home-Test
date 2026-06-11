/**
 * T3.2 — pure client-side preflight validation for the single-label form.
 *
 * Catches the common error cases BEFORE the network round-trip so the agent gets
 * an instant, friendly message (and we don't spend a model call on input we can
 * already tell is unusable):
 *   - empty form (no expected value entered to compare against)
 *   - missing image
 *   - unsupported image type
 *   - oversize image
 *
 * Kept I/O-free and framework-free (like `format.ts`) so it runs under the
 * existing `node` vitest environment — no DOM/testing-library dependency. The
 * server route re-validates everything independently (defense in depth); this is
 * a UX fast-path, not the security boundary. Messages mirror the route's wording
 * so the experience is consistent whichever layer catches the problem.
 *
 * Network / model / unreadable-image failures are NOT handled here — those only
 * surface after submission and are shown from the API's friendly `error` body
 * (e.g. "request a better image"); partial extractions come back as `missing`
 * fields from the engine. This module is strictly the pre-submit gate.
 */
import {
  ACCEPTED_TYPES_LABEL,
  MAX_IMAGE_LABEL,
  MAX_IMAGE_BYTES,
  isAcceptedImageType,
} from '@/lib/ui/imageConstraints';

/** Minimal, framework-free view of a chosen file (matches the DOM `File` API). */
export interface ImageFileInfo {
  type: string;
  size: number;
}

/** The expected-value text fields, as raw strings from the form inputs. */
export interface ExpectedFieldInputs {
  brand: string;
  classType: string;
  abv: string;
  netContents: string;
}

export interface VerifyFormInput extends ExpectedFieldInputs {
  /** The selected label image, or null when none has been chosen. */
  image: ImageFileInfo | null;
}

/** Which control to move focus to when reporting the error (accessibility). */
export type ValidationFocus = 'brand' | 'image';

export type ValidationResult =
  | { ok: true }
  | { ok: false; focus: ValidationFocus; message: string };

const OK: ValidationResult = { ok: true };

/**
 * Validate the form before submit. Returns the FIRST problem found (one clear
 * message at a time is friendlier than a wall of errors), with the control to
 * focus. Order: expected values -> image presence -> image type -> image size.
 */
export function validateVerifyForm(input: VerifyFormInput): ValidationResult {
  const hasAnyExpected =
    input.brand.trim() !== '' ||
    input.classType.trim() !== '' ||
    input.abv.trim() !== '' ||
    input.netContents.trim() !== '';

  if (!hasAnyExpected) {
    return {
      ok: false,
      focus: 'brand',
      message:
        'Please enter at least one expected value (for example, the brand name) so there is something to compare the label against.',
    };
  }

  const { image } = input;
  if (image === null || image.size === 0) {
    return {
      ok: false,
      focus: 'image',
      message: `Please upload a label image (${ACCEPTED_TYPES_LABEL}).`,
    };
  }

  if (!isAcceptedImageType(image.type)) {
    return {
      ok: false,
      focus: 'image',
      message: `That image type is not supported. Please upload a ${ACCEPTED_TYPES_LABEL} image.`,
    };
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      focus: 'image',
      message: `That image is too large. Please upload an image under ${MAX_IMAGE_LABEL}.`,
    };
  }

  return OK;
}
