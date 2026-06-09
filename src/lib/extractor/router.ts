/**
 * RoutingExtractor — the Flash -> (low confidence) -> Sonnet -> human pipeline
 * (CONTEXT §4, PROJECT_PLAN §2/§3, BUILD_BACKLOG T1.2).
 *
 * Runs the fast primary tier (Gemini Flash) first. If its self-reported
 * confidence is below the configurable threshold, it escalates to the deep tier
 * (Claude Sonnet) and returns that result, flagged `escalated` so the UI can show
 * the "running a closer check…" state and so /api/verify can surface
 * `VerificationResult.escalated`. A high-confidence label never invokes the deep
 * tier — that is what protects the 5s SLA on the common path.
 *
 * The deep tier is invoked through the same `LabelExtractor` seam, so escalation
 * is just routing — no special-casing of providers, and a local OCR tier could be
 * dropped in behind either slot for the firewall fallback.
 *
 * Resilience: if the deep tier itself fails (network/timeout/HTTP), the router
 * does NOT fail the whole request — it falls back to the primary's low-confidence
 * result, still flagged `escalated`, so the work reaches human review (the
 * intended terminal state) rather than a hard error. The deep-tier error code is
 * carried in `deepTierError` for diagnostics; no secrets are included.
 */
import type { ExtractedLabel } from '@/types';
import { getConfidenceThreshold } from '@/lib/config';
import {
  ExtractionError,
  type LabelExtractor,
  type LabelImage,
} from './types';

/** Which tier produced the returned label. */
export type ExtractionTier = 'primary' | 'deep';

/**
 * Result of a routed extraction. `label` is the chosen tier's output; the rest is
 * routing metadata the API route maps onto `VerificationResult` / the UI.
 */
export interface RoutedExtraction {
  /** The label to compare against — from whichever tier was used last. */
  label: ExtractedLabel;
  /** True when the deep (Sonnet) tier was invoked. */
  escalated: boolean;
  /** Which tier's `label` is being returned. */
  tier: ExtractionTier;
  /** Name of the extractor that produced `label` (e.g. "gemini-flash"). */
  extractorName: string;
  /** The primary tier's confidence, always recorded (drives the decision). */
  primaryConfidence: number;
  /** The escalation threshold used for this run. */
  threshold: number;
  /** Set when the deep tier was tried but failed; we fell back to primary. */
  deepTierError?: ExtractionError['code'];
}

export interface RoutingExtractorOptions {
  /**
   * Confidence below which the primary result escalates to the deep tier.
   * Defaults to getConfidenceThreshold() (env-driven, 0.7 default).
   */
  threshold?: number;
}

/**
 * Routes between a fast primary extractor and a conditional deep extractor.
 * Implements `LabelExtractor` so it is itself substitutable; `extractRouted`
 * exposes the escalation metadata the UI/route needs.
 */
export class RoutingExtractor implements LabelExtractor {
  readonly name = 'router';
  private readonly primary: LabelExtractor;
  private readonly deep: LabelExtractor;
  private readonly threshold?: number;

  constructor(
    primary: LabelExtractor,
    deep: LabelExtractor,
    options: RoutingExtractorOptions = {},
  ) {
    this.primary = primary;
    this.deep = deep;
    this.threshold = options.threshold;
  }

  /** LabelExtractor contract: returns just the chosen label (drops metadata). */
  async extract(image: LabelImage): Promise<ExtractedLabel> {
    return (await this.extractRouted(image)).label;
  }

  /** Full routed extraction with escalation metadata for the UI / API route. */
  async extractRouted(image: LabelImage): Promise<RoutedExtraction> {
    const threshold = this.threshold ?? getConfidenceThreshold();
    const primaryLabel = await this.primary.extract(image);
    const primaryConfidence = primaryLabel.confidence;

    // Common path: confident enough — never touch the deep tier (5s SLA).
    if (primaryConfidence >= threshold) {
      return {
        label: primaryLabel,
        escalated: false,
        tier: 'primary',
        extractorName: this.primary.name,
        primaryConfidence,
        threshold,
      };
    }

    // Low confidence: escalate to the deep tier.
    try {
      const deepLabel = await this.deep.extract(image);
      return {
        label: deepLabel,
        escalated: true,
        tier: 'deep',
        extractorName: this.deep.name,
        primaryConfidence,
        threshold,
      };
    } catch (cause) {
      // Deep tier unavailable: fall back to the primary's result so the label
      // still reaches human review rather than failing outright.
      const code =
        cause instanceof ExtractionError ? cause.code : 'unknown';
      return {
        label: primaryLabel,
        escalated: true,
        tier: 'primary',
        extractorName: this.primary.name,
        primaryConfidence,
        threshold,
        deepTierError: code,
      };
    }
  }
}
