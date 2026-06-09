/**
 * Core domain types for the TTB label verification prototype.
 * See planning/CONTEXT.md §5 and planning/PROJECT_PLAN.md §2 (Data shapes).
 */

/** Beverage type drives conditional ABV validation (CONTEXT §5). */
export type BeverageType = 'spirits' | 'wine' | 'beer';

/** Per-field comparison outcome. `review` = looks right, human should glance. */
export type FieldStatus = 'match' | 'review' | 'mismatch' | 'missing';

/** Result of comparing one expected field against the extracted value. */
export interface FieldResult {
  field: string;
  expected: string;
  found: string | null;
  status: FieldStatus;
  /** Human-readable note: similarity score, parse note, conditional-rule note. */
  detail?: string;
}

/** Result of the strict Government Warning check (CONTEXT §5, PROJECT_PLAN §3). */
export interface WarningCheckResult {
  /** Is there a warning block at all? */
  present: boolean;
  /** Is the "GOVERNMENT WARNING" prefix present and uppercase? */
  prefixCaps: boolean;
  /** Does the full statement equal the canonical text (whitespace-normalized)? */
  textMatch: boolean;
  status: FieldStatus;
  /** Word-level diff vs canonical when text does not match. */
  diff?: WarningDiffSegment[];
  /** Honest limitation note (bold/font not detectable from extracted text). */
  detail?: string;
}

/** One segment of the warning word-level diff. */
export interface WarningDiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/** What the extractor reads off the label image. Includes a confidence signal. */
export interface ExtractedLabel {
  brand: string | null;
  classType: string | null;
  abv: string | null;
  proof: string | null;
  netContents: string | null;
  warningText: string | null;
  /** Full raw text read off the label, for diffing/debugging. */
  rawText: string | null;
  /** 0-1 confidence; drives the Flash -> Sonnet escalation decision. */
  confidence: number;
}

/** Aggregate result returned by /api/verify. */
export interface VerificationResult {
  fields: FieldResult[];
  warning: WarningCheckResult;
  overall: 'pass' | 'review' | 'fail';
  /** Measured end-to-end latency, surfaced in the UI to prove the 5s claim. */
  latencyMs: number;
  /** True when the deep (Sonnet) tier was invoked. */
  escalated?: boolean;
}

/** Expected values an agent enters (from a COLA application). */
export interface ExpectedLabel {
  brand: string;
  classType: string;
  abv: string;
  netContents: string;
  beverageType: BeverageType;
}
