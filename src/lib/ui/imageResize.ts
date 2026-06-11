/**
 * T-SLA — client-side image downscaling before upload.
 *
 * A full-resolution phone photo (3000–4000px, several MB) costs upload time AND
 * model time, yet buys nothing: vision models internally downsample to a small
 * tile resolution, so the extra pixels are discarded server-side. Shrinking to a
 * legible ~1568px longest edge before upload cuts latency (helping the 5s SLA)
 * and mobile data use, with no meaningful accuracy loss for label text.
 *
 * The dimension math (`computeScaledSize`) is pure and unit-tested under the
 * `node` env; the actual canvas encode (`downscaleImageFile`) is a thin DOM
 * wrapper that degrades safely to the original file on any failure (e.g. a HEIC
 * the browser can't decode), so a verification is never blocked by resizing.
 */

/** Default longest-edge target — legible for label fine print, small to send. */
export const DEFAULT_MAX_EDGE = 1568;
/** JPEG quality for the re-encode. */
export const DEFAULT_QUALITY = 0.85;

export interface ScaledSize {
  width: number;
  height: number;
  /** False when the source already fits (no resize needed). */
  scaled: boolean;
}

/** Pure: target dimensions to fit `maxEdge` on the longest side, preserving aspect. */
export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number,
): ScaledSize {
  const longest = Math.max(width, height);
  if (
    !Number.isFinite(longest) ||
    longest <= 0 ||
    !Number.isFinite(maxEdge) ||
    maxEdge <= 0 ||
    longest <= maxEdge
  ) {
    return { width, height, scaled: false };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/**
 * Downscale a chosen image File to a JPEG Blob no larger than `maxEdge` on its
 * longest side. Returns the ORIGINAL file unchanged if it already fits, isn't a
 * decodable raster image, or anything goes wrong — resizing must never block a
 * verification.
 */
export async function downscaleImageFile(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE,
  quality: number = DEFAULT_QUALITY,
): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || !file.type.startsWith('image/')) {
      return file;
    }
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height, scaled } = computeScaledSize(
      bitmap.width,
      bitmap.height,
      maxEdge,
    );
    if (!scaled) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
