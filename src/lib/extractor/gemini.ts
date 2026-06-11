/**
 * GeminiExtractor — the fast primary tier (CONTEXT §4, PROJECT_PLAN §2).
 *
 * One structured-output vision call to Gemini Flash: low temperature, strict
 * JSON schema (brand, classType, abv, proof, netContents, warningText, rawText,
 * confidence). The model ONLY transcribes the label; no verdict logic lives
 * here. Pure helpers (request building + response parsing) are exported so they
 * can be unit-tested without any network call, and the constructor accepts an
 * injectable `fetchImpl` so tests MOCK the transport — a live Gemini call is
 * never made in tests or unattended runs.
 */
import type { ExtractedLabel } from '@/types';
import { getGeminiApiKey } from '@/lib/config';
import { ExtractionError, type LabelExtractor, type LabelImage } from './types';

/** Image MIME types Gemini vision accepts. */
export const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/**
 * Flash model id. `gemini-2.0-flash` was SHUT DOWN by Google on 2026-06-01 and
 * now returns HTTP 404 ("model not found"), so the default is a current GA
 * vision model. Overridable via the `GEMINI_MODEL` env var so a future model
 * sunset can be handled by a config change + redeploy — no code change needed.
 */
const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
/** Upper bound on the Flash call so a hung connection cannot blow the 5s SLA. */
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_ENDPOINT_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Instruction prompt. Asks for transcription only and an honest self-reported
 * confidence so the Flash -> Sonnet escalation trigger is explicit, not guessed.
 */
export const EXTRACTION_PROMPT =
  'You are transcribing the text printed on a U.S. alcohol beverage label. ' +
  'Read ONLY what is actually printed — do not infer, correct, or complete ' +
  'missing values. Return the requested fields. Use null for any field not ' +
  'present on the label. For warningText, transcribe the government warning ' +
  'statement verbatim including its exact capitalization. confidence is your ' +
  '0-to-1 self-assessment of how legible the label was (low for blur, glare, ' +
  'or angle). Do not make a compliance judgement.';

/** Response schema for Gemini structured output (responseSchema). */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: 'string', nullable: true },
    classType: { type: 'string', nullable: true },
    abv: { type: 'string', nullable: true },
    proof: { type: 'string', nullable: true },
    netContents: { type: 'string', nullable: true },
    warningText: { type: 'string', nullable: true },
    rawText: { type: 'string', nullable: true },
    confidence: { type: 'number' },
  },
  required: ['confidence'],
} as const;

/** Build the generateContent request body. Pure — no network, no secrets. */
export function buildGeminiRequestBody(image: LabelImage): unknown {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: EXTRACTION_PROMPT },
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };
}

/** Pull the model's text out of a generateContent response. Pure, defensive. */
export function extractModelText(responseJson: unknown): string | null {
  const candidates = (responseJson as { candidates?: unknown })?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } })?.content
    ?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((p) => (p as { text?: unknown })?.text)
    .filter((t): t is string => typeof t === 'string')
    .join('');
  return text.length > 0 ? text : null;
}

function coerceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Strip a ```json ... ``` fence if the model wrapped its JSON in one. */
function stripCodeFence(text: string): string {
  const fence = text.trim();
  const match = fence.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match && match[1] !== undefined ? match[1] : fence;
}

/**
 * Parse the model's text into an ExtractedLabel. NEVER throws: malformed or
 * partial JSON degrades to a zero-confidence label carrying whatever raw text
 * we got, so the router escalates / hands to human review instead of crashing.
 */
export function parseExtractedLabel(text: string): ExtractedLabel {
  let obj: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(stripCodeFence(text));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      obj = parsed as Record<string, unknown>;
    }
  } catch {
    obj = null;
  }
  if (obj === null) {
    return {
      brand: null,
      classType: null,
      abv: null,
      proof: null,
      netContents: null,
      warningText: null,
      rawText: text,
      confidence: 0,
    };
  }
  return {
    brand: coerceString(obj.brand),
    classType: coerceString(obj.classType),
    abv: coerceString(obj.abv),
    proof: coerceString(obj.proof),
    netContents: coerceString(obj.netContents),
    warningText: coerceString(obj.warningText),
    rawText: coerceString(obj.rawText),
    confidence: coerceConfidence(obj.confidence),
  };
}

export interface GeminiExtractorOptions {
  /** Defaults to getGeminiApiKey() — resolved lazily on first extract(). */
  apiKey?: string;
  /** Defaults to `GEMINI_MODEL` env or "gemini-3.5-flash". */
  model?: string;
  /** Injectable transport for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override endpoint base (testing). */
  endpointBase?: string;
  /** Abort the call after this many ms (defaults to 4000 — guards the 5s SLA). */
  timeoutMs?: number;
}

export class GeminiExtractor implements LabelExtractor {
  readonly name = 'gemini-flash';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly endpointBase: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiExtractorOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.endpointBase = options.endpointBase ?? DEFAULT_ENDPOINT_BASE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async extract(image: LabelImage): Promise<ExtractedLabel> {
    if (
      !(SUPPORTED_MIME_TYPES as readonly string[]).includes(image.mimeType)
    ) {
      const allowed = SUPPORTED_MIME_TYPES.map((m) => m.split('/')[1]).join(', ');
      throw new ExtractionError(
        `Unsupported image type "${image.mimeType}". Supported types: ${allowed}.`,
        'input',
      );
    }
    const apiKey = this.apiKey ?? getGeminiApiKey();
    const url = `${this.endpointBase}/${this.model}:generateContent`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(buildGeminiRequestBody(image)),
        signal: controller.signal,
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw new ExtractionError(
          'The extraction service took too long to respond. Please try again.',
          'timeout',
        );
      }
      throw new ExtractionError(
        'Could not reach the extraction service. Please try again.',
        'network',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Never surface the provider body (may echo the request / key context).
      throw new ExtractionError(
        `Extraction service returned an error (status ${response.status}). Please try again.`,
        'http',
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ExtractionError(
        'Extraction service returned an unreadable response. Please try again.',
        'empty',
      );
    }

    const text = extractModelText(json);
    if (text === null) {
      // No usable content (e.g. safety block / empty candidates): degrade to a
      // zero-confidence result so the router escalates rather than crashing.
      return {
        brand: null,
        classType: null,
        abv: null,
        proof: null,
        netContents: null,
        warningText: null,
        rawText: null,
        confidence: 0,
      };
    }
    return parseExtractedLabel(text);
  }
}
