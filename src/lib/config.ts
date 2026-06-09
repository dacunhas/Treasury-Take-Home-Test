/**
 * Typed environment config loader.
 *
 * Secrets are read ONLY from environment variables and never logged. The core
 * loop (scaffold + pure comparison engine + mocked-extractor unit tests) needs
 * NO keys; keys are required only for live extraction. Accessors fail loudly
 * with a clear, secret-free message when a required key is absent.
 */

export class MissingConfigError extends Error {
  constructor(key: string) {
    super(
      `Missing required environment variable: ${key}. ` +
        `Add it to .env.local (see .env.example). Never commit real secrets.`,
    );
    this.name = 'MissingConfigError';
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new MissingConfigError(key);
  }
  return value;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** Confidence below which Flash escalates to the Sonnet deep tier. */
export function getConfidenceThreshold(): number {
  const raw = process.env.EXTRACTION_CONFIDENCE_THRESHOLD;
  if (!raw) return DEFAULT_CONFIDENCE_THRESHOLD;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }
  return parsed;
}

/** Gemini Flash key — required only when performing live extraction. */
export function getGeminiApiKey(): string {
  return requireEnv('GEMINI_API_KEY');
}

/** Anthropic Sonnet key — required only when the deep tier is invoked. */
export function getAnthropicApiKey(): string {
  return requireEnv('ANTHROPIC_API_KEY');
}

/** Non-throwing presence check, e.g. for health/diagnostics UI. */
export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
