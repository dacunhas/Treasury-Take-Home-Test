/**
 * T3.2 — client-safe image constraints (single source of truth).
 *
 * Pure constants shared by the server route (`handler.ts`) and the client form
 * (`validateForm.ts` / `VerifyForm.tsx`) so the size limit and the user-facing
 * list of accepted types cannot drift between the two preflight checks. This
 * module imports NOTHING from the extractor/provider code, so it is safe to pull
 * into the client bundle (no `process.env`, no SDK).
 *
 * The accepted MIME set mirrors the extractor's `SUPPORTED_MIME_TYPES`
 * (`src/lib/extractor/gemini.ts`); that list remains the server-side authority,
 * and `gemini.test.ts` pins its members. A small drift guard test in
 * `validateForm.test.ts` asserts the two lists agree.
 */

/** Reject images larger than this to protect memory + the 5s budget. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Human-readable size limit, derived from MAX_IMAGE_BYTES. */
export const MAX_IMAGE_LABEL = `${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`;

/** Image MIME types the prototype accepts (mirrors the extractor's set). */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/** Comma-separated, upper-cased subtype list for messages (e.g. "PNG, JPEG"). */
export const ACCEPTED_TYPES_LABEL = ACCEPTED_IMAGE_MIME_TYPES.map(
  (m) => m.split('/')[1]?.toUpperCase() ?? m,
).join(', ');

/** True when `mime` is one of the accepted image types (case-insensitive). */
export function isAcceptedImageType(mime: string): boolean {
  const normalized = mime.trim().toLowerCase();
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(normalized);
}

/** Value attribute for an <input type="file"> accept list. */
export const ACCEPT_ATTR = ACCEPTED_IMAGE_MIME_TYPES.join(',');
