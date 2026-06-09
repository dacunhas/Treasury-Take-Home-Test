/**
 * Extraction layer contract (PROJECT_PLAN §2, CONTEXT §4).
 *
 * The `LabelExtractor` interface is the swappable seam that answers Marcus's
 * firewall constraint: inference lives behind this interface so a cloud tier
 * (Gemini Flash / Claude Sonnet) can be replaced by a local/offline OCR
 * implementation (e.g. Tesseract.js) without touching the comparison engine or
 * the API route. The extractor ONLY reads text off the image; the deterministic
 * comparison engine owns every verdict.
 */
import type { ExtractedLabel } from '@/types';

/** An in-memory image to extract from. Stateless — never persisted. */
export interface LabelImage {
  /** Base64-encoded image bytes (no data: URI prefix). */
  base64: string;
  /** MIME type, e.g. "image/png", "image/jpeg", "image/webp". */
  mimeType: string;
}

/**
 * Swappable label extractor. Implementations: GeminiExtractor (fast primary),
 * SonnetExtractor (conditional deep tier — T1.2), LocalOcrExtractor (documented
 * firewall fallback). All return the same `ExtractedLabel` shape, including a
 * `confidence` signal that drives Flash -> Sonnet escalation.
 */
export interface LabelExtractor {
  /** Stable identifier for diagnostics / escalation logging (no secrets). */
  readonly name: string;
  /** Read the printed label text into a structured, deterministic-comparable shape. */
  extract(image: LabelImage): Promise<ExtractedLabel>;
}

/**
 * Raised when the extractor cannot reach or get a usable response from the
 * inference backend (network error, non-2xx, empty body). The API route maps
 * this to a friendly "try again / request a better image" message — never a
 * stack trace. NOTE: malformed *content* (a 200 with unparseable/partial JSON)
 * is NOT an error — it degrades to a low-confidence ExtractedLabel so the router
 * can escalate or hand off to human review.
 */
export class ExtractionError extends Error {
  /** Optional machine-readable cause for the UI to branch on. */
  readonly code: 'network' | 'http' | 'empty' | 'input' | 'timeout' | 'unknown';
  constructor(message: string, code: ExtractionError['code'] = 'unknown') {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
  }
}
