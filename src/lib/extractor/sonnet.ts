/**
 * SonnetExtractor — the conditional deep tier (CONTEXT §4, PROJECT_PLAN §2).
 *
 * Same `LabelExtractor` contract as GeminiExtractor, backed by the Anthropic
 * Messages API (Claude Sonnet vision). It is invoked ONLY by the router when the
 * fast Flash tier returns low confidence / ambiguous extraction — never on every
 * label, which would blow the 5s SLA. Like the Flash tier it ONLY transcribes the
 * label; no verdict logic lives here.
 *
 * Anthropic has no `responseSchema`, so we instruct JSON-only output in the prompt
 * and reuse the Gemini tier's tolerant `parseExtractedLabel` (it strips ```json
 * fences and degrades malformed/partial output to a zero-confidence label rather
 * than throwing). Pure helpers are exported for unit testing without a network
 * call, and the constructor accepts an injectable `fetchImpl` so tests MOCK the
 * transport — a live Anthropic call is never made in tests or unattended runs.
 */
import type { ExtractedLabel } from '@/types';
import { getAnthropicApiKey } from '@/lib/config';
import { EXTRACTION_PROMPT, parseExtractedLabel } from './gemini';
import { ExtractionError, type LabelExtractor, type LabelImage } from './types';

/** Image MIME types the Anthropic vision API accepts. */
export const SONNET_SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const ANTHROPIC_VERSION = '2023-06-01';
/**
 * Deep-tier timeout. The escalated path is allowed to run ~5-7s (CONTEXT §4: the
 * alternative is human re-review), so it is more generous than the Flash 4s bound.
 */
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * Appended to the shared transcription prompt: Anthropic returns free-form text,
 * so we must ask explicitly for a single JSON object with the agreed keys.
 */
export const SONNET_JSON_INSTRUCTION =
  ' Respond with ONLY a single JSON object (no prose, no code fence) with exactly ' +
  'these keys: brand, classType, abv, proof, netContents, warningText, ' +
  'confidence. Use null for any field not present on the label. confidence is a ' +
  'number from 0 to 1.';

/** Full deep-tier prompt: shared transcription instruction + JSON-shape demand. */
export const SONNET_PROMPT = EXTRACTION_PROMPT + SONNET_JSON_INSTRUCTION;

/** Build the Anthropic Messages request body. Pure — no network, no secrets. */
export function buildSonnetRequestBody(image: LabelImage, model: string): unknown {
  return {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SONNET_PROMPT },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mimeType,
              data: image.base64,
            },
          },
        ],
      },
    ],
  };
}

/** Pull the model's text out of an Anthropic Messages response. Pure, defensive. */
export function extractAnthropicText(responseJson: unknown): string | null {
  const content = (responseJson as { content?: unknown })?.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const text = content
    .filter((b) => (b as { type?: unknown })?.type === 'text')
    .map((b) => (b as { text?: unknown })?.text)
    .filter((t): t is string => typeof t === 'string')
    .join('');
  return text.length > 0 ? text : null;
}

export interface SonnetExtractorOptions {
  /** Defaults to getAnthropicApiKey() — resolved lazily on first extract(). */
  apiKey?: string;
  /** Defaults to "claude-3-5-sonnet-20241022". */
  model?: string;
  /** Injectable transport for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override endpoint (testing). */
  endpoint?: string;
  /** Abort the call after this many ms (defaults to 7000 — deep-tier budget). */
  timeoutMs?: number;
}

export class SonnetExtractor implements LabelExtractor {
  readonly name = 'claude-sonnet';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: SonnetExtractorOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async extract(image: LabelImage): Promise<ExtractedLabel> {
    if (
      !(SONNET_SUPPORTED_MIME_TYPES as readonly string[]).includes(image.mimeType)
    ) {
      const allowed = SONNET_SUPPORTED_MIME_TYPES.map((m) => m.split('/')[1]).join(
        ', ',
      );
      throw new ExtractionError(
        `Unsupported image type "${image.mimeType}". Supported types: ${allowed}.`,
        'input',
      );
    }
    const apiKey = this.apiKey ?? getAnthropicApiKey();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(buildSonnetRequestBody(image, this.model)),
        signal: controller.signal,
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw new ExtractionError(
          'The deep-check service took too long to respond. Please try again.',
          'timeout',
        );
      }
      throw new ExtractionError(
        'Could not reach the deep-check service. Please try again.',
        'network',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Never surface the provider body (may echo the request / key context).
      throw new ExtractionError(
        `Deep-check service returned an error (status ${response.status}). Please try again.`,
        'http',
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ExtractionError(
        'Deep-check service returned an unreadable response. Please try again.',
        'empty',
      );
    }

    const text = extractAnthropicText(json);
    if (text === null) {
      // No usable content: degrade to a zero-confidence result so the caller can
      // hand off to human review rather than crashing.
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
