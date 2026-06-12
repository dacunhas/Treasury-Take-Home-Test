/**
 * ABV (alcohol-content) comparison — CONDITIONAL on beverage type.
 * Spec: PROJECT_PLAN.md §3 "ABV" + CONTEXT.md §5 "Alcohol-content (ABV) statement".
 *
 * Pure, deterministic, I/O-free (the verdict never depends on model judgment —
 * only on extracted text run through here). Produces a `FieldResult` of
 * match / review / mismatch / missing with a human-readable, plain-language detail.
 *
 * The conditional rules (CONTEXT §5) — getting these wrong wrongly fails compliant
 * beer/wine labels:
 *   - Spirits : numeric ABV ALWAYS required. Absent -> mismatch (a real failure).
 *               Proof, when present, should equal 2 x ABV.
 *   - Wine    : numeric ABV required EXCEPT table wine (7-14% ABV), which may state
 *               "Table Wine" / "Light Wine" in lieu of a number -> treat as
 *               match/review, NOT missing.
 *   - Beer    : ABV generally OPTIONAL -> absent is not, by itself, a failure.
 *               Must be to the nearest 0.1%; the abbreviation "ABV" is NOT allowed
 *               (must be spelled out, e.g. "Alcohol by Volume" / "Alc. by Vol.").
 */
import type { BeverageType, FieldResult } from '@/types';

const FIELD = 'Alcohol Content';

/** Round an ABV/proof number for display only (never for the compared value). */
function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** Number of decimal places in a numeric string (e.g. "13.5" -> 1, "5" -> 0). */
function countDecimals(numStr: string): number {
  const dot = numStr.indexOf('.');
  return dot === -1 ? 0 : numStr.length - dot - 1;
}

/** ABV is a percentage of volume — it cannot exceed 100%. Used to reject a bare
 *  number that is clearly not an alcohol-content reading (a proof or net-contents
 *  value mistyped into the field, e.g. "750"). */
const MAX_PLAUSIBLE_ABV = 100;

export interface AbvCompareOptions {
  /** Allowed absolute ABV difference (percentage points). Default 0.0 (exact). */
  tolerance?: number;
}

/** What we can pull out of one ABV-bearing string. */
export interface ParsedAbv {
  /** Numeric ABV percentage, or null if none stated. */
  abv: number | null;
  /** Numeric proof, or null if none stated. */
  proof: number | null;
  /** Label uses a "Table Wine" designation (numeric-ABV substitute, 7-14%). */
  hasTableWine: boolean;
  /** Label uses a "Light Wine" designation (numeric-ABV substitute). */
  hasLightWine: boolean;
  /** Disallowed-for-beer "ABV" abbreviation appears (must be spelled out). */
  usesAbvAbbrev: boolean;
  /** Numeric ABV stated to finer than 0.1% precision (>1 decimal place). */
  finerThanTenthPrecision: boolean;
}

/**
 * Parse an ABV/proof string. Tolerant of formats like
 *   "45% Alc./Vol. (90 Proof)", "5.0% ABV", "Table Wine", "13.5% alc/vol".
 * Returns the first numeric percentage found (excluding a "NN Proof" number).
 *
 * Bare-number tolerance (B1): if the WHOLE string is just a number — e.g. an
 * agent types "13" in the ABV field rather than "13% Alc./Vol." — it is read as
 * that percentage. The percent sign is assumed because the field's only meaning
 * is an alcohol-content percentage. This only fires when nothing else parsed an
 * ABV and the string is purely numeric, so it cannot steal a number out of a
 * richer statement (a "90 Proof" string keeps deriving ABV from proof as before).
 */
export function parseAbv(input: string | null): ParsedAbv {
  const text = (input ?? '').trim();

  // Proof first, so we can exclude a "90 Proof" number from the % search.
  let proof: number | null = null;
  const proofMatch = text.match(/(\d+(?:\.\d+)?)\s*proof/i);
  if (proofMatch && proofMatch[1] !== undefined) {
    proof = Number(proofMatch[1]);
  }

  // ABV: a number immediately followed by a percent sign. Most TTB statements
  // read "NN% Alc./Vol."; the percent sign is the reliable anchor and avoids
  // catching the proof or net-contents numbers.
  let abv: number | null = null;
  let abvDecimals = 0;
  // Prefer a percentage anchored to an alcohol-content phrase ("45% Alc./Vol.",
  // "5.0% ABV", "12.5% alcohol by volume"). This avoids grabbing an unrelated
  // earlier percent (e.g. an OCR blob "2% added flavors ... 45% Alc./Vol.")
  // which would wrongly fail a compliant label. Fall back to a bare percent.
  const ANCHORED = /(\d+(?:\.\d+)?)\s*%\s*(?:alc|alcohol|abv|a\.?\s*\/?\s*v)/i;
  const BARE = /(\d+(?:\.\d+)?)\s*%/;
  // Whole-string plain number (no %, no other text) -> treat as a percentage (B1).
  const BARE_NUMBER = /^(\d+(?:\.\d+)?)$/;
  const pctMatch = text.match(ANCHORED) ?? text.match(BARE);
  if (pctMatch && pctMatch[1] !== undefined) {
    abv = Number(pctMatch[1]);
    abvDecimals = countDecimals(pctMatch[1]);
  }

  // Bare-number fallback (B1): no percent/anchored ABV was found, but the entire
  // string is a plain number (e.g. the agent typed "13" or "13.5"). Read it as a
  // percentage. Anchored to ^...$ so it never grabs a digit from a longer string
  // (proof numbers, net contents, "Table Wine"), preserving every path above. A
  // value above 100 is rejected (left as null) since ABV cannot exceed 100% —
  // that guards against a proof or net-contents number typed into the ABV field,
  // and means the shared parser never invents a giant ABV from a stray big number.
  if (abv === null) {
    const bareMatch = text.match(BARE_NUMBER);
    if (bareMatch && bareMatch[1] !== undefined) {
      const value = Number(bareMatch[1]);
      if (value <= MAX_PLAUSIBLE_ABV) {
        abv = value;
        abvDecimals = countDecimals(bareMatch[1]);
      }
    }
  }

  return {
    abv,
    proof,
    hasTableWine: /\btable\s+wine\b/i.test(text),
    hasLightWine: /\blight\s+wine\b/i.test(text),
    // Whole-word "ABV", case-insensitive. "Alc./Vol." is fine and not matched.
    usesAbvAbbrev: /\babv\b/i.test(text),
    finerThanTenthPrecision: abv !== null && abvDecimals > 1,
  };
}

function result(
  expected: string,
  found: string | null,
  status: FieldResult['status'],
  detail: string,
): FieldResult {
  return { field: FIELD, expected, found, status, detail };
}

/**
 * Compare the expected ABV against the value read off the label, applying the
 * beverage-type-conditional rules. `found` is the label string (may be null).
 */
export function compareAbv(
  expected: string,
  found: string | null,
  beverageType: BeverageType,
  options: AbvCompareOptions = {},
): FieldResult {
  const tolerance = options.tolerance ?? 0.0;
  const pe = parseAbv(expected);
  const pf = parseAbv(found);

  // Derive ABV from proof (ABV = proof / 2) when a number isn't stated directly
  // but a proof is — e.g. a spirits label printing only "90 Proof".
  const eAbv = pe.abv ?? (pe.proof !== null ? pe.proof / 2 : null);
  const fAbv = pf.abv ?? (pf.proof !== null ? pf.proof / 2 : null);
  const fAbvDerived = pf.abv === null && pf.proof !== null;

  // Beer-only formatting notes appended to whatever the numeric verdict is.
  const beerFlags: string[] = [];
  if (beverageType === 'beer') {
    if (pf.usesAbvAbbrev)
      beerFlags.push(
        'label uses the "ABV" abbreviation — beer must spell it out ("Alcohol by Volume" / "Alc. by Vol.")',
      );
    if (pf.finerThanTenthPrecision)
      beerFlags.push('ABV should be stated to the nearest 0.1%');
  }
  const withBeerFlags = (status: FieldResult['status'], detail: string): FieldResult => {
    if (beerFlags.length === 0) return result(expected, found, status, detail);
    // A formatting issue downgrades a clean match to review (a human should glance).
    const downgraded = status === 'match' ? 'review' : status;
    return result(
      expected,
      found,
      downgraded,
      `${detail} Note: ${beerFlags.join('; ')}.`,
    );
  };

  // ---- Both sides have a numeric ABV: compare numerically. ----
  if (eAbv !== null && fAbv !== null) {
    const diff = Math.abs(eAbv - fAbv);
    const shown = fAbvDerived ? `${fmt(fAbv)}% (derived from ${fmt(pf.proof ?? 0)} proof)` : `${fmt(fAbv)}%`;

    if (diff > tolerance) {
      return withBeerFlags(
        'mismatch',
        `Expected ${eAbv}% Alc./Vol. but the label shows ${shown}.`,
      );
    }

    // Numbers agree — now cross-check proof = 2 x ABV when proof is printed.
    if (pf.proof !== null && pf.abv !== null) {
      const expectedProof = pf.abv * 2;
      if (Math.abs(pf.proof - expectedProof) > 0.1) {
        return withBeerFlags(
          'review',
          `ABV matches (${pf.abv}%), but the printed proof ${pf.proof} is inconsistent with ${pf.abv}% (expected ~${expectedProof}). Please confirm.`,
        );
      }
    }
    return withBeerFlags('match', `Matches (${shown} Alc./Vol.).`);
  }

  // ---- Label has a number but no expected value was supplied to compare. ----
  if (eAbv === null && fAbv !== null) {
    return withBeerFlags(
      'review',
      `The label states ${fAbv}% Alc./Vol., but no expected ABV was provided to compare against. Please confirm.`,
    );
  }

  // ---- No numeric ABV read off the label: apply the conditional rules. ----
  // (fAbv === null below.)
  switch (beverageType) {
    case 'spirits':
      // ABV is always required for distilled spirits — absent is a real failure.
      return result(
        expected,
        found,
        'mismatch',
        'Distilled spirits must state the alcohol content (% Alc./Vol.); none was found on the label.',
      );

    case 'wine':
      // Table/Light Wine (7-14%) may appear in lieu of a numeric ABV.
      if (pf.hasTableWine || pf.hasLightWine) {
        const which = pf.hasTableWine ? 'Table Wine' : 'Light Wine';
        return result(
          expected,
          found,
          'match',
          `No numeric ABV, but the label is designated "${which}", which may substitute for a numeric statement on wine (7-14% ABV).`,
        );
      }
      // Expected a number, label has neither a number nor the wine designation.
      if (eAbv !== null) {
        return result(
          expected,
          found,
          'mismatch',
          `Expected ${eAbv}% Alc./Vol., but the label states no alcohol content and carries no "Table Wine"/"Light Wine" designation.`,
        );
      }
      return result(
        expected,
        found,
        'missing',
        'No alcohol content found on the wine label and no "Table Wine"/"Light Wine" designation to substitute for it.',
      );

    case 'beer':
      // ABV is generally optional for beer — absence is not a failure.
      if (eAbv !== null) {
        return result(
          expected,
          found,
          'review',
          `Expected ${eAbv}% Alc./Vol., but the label omits the alcohol content. ABV is optional for beer, so this is not a failure — please confirm it was intentionally omitted.`,
        );
      }
      return result(
        expected,
        found,
        'match',
        'No alcohol content stated; the ABV statement is optional for beer/malt beverages, so its omission is not a failure.',
      );

    default: {
      // Exhaustiveness guard.
      const _never: never = beverageType;
      return result(expected, found, 'missing', `Unknown beverage type: ${String(_never)}.`);
    }
  }
}
