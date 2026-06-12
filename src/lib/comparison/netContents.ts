/**
 * Net-contents comparison (PROJECT_PLAN.md §3 "Net contents", CONTEXT.md §6).
 *
 * Pure, deterministic, I/O-free (the verdict never depends on model judgment —
 * only on extracted text run through here). Produces a `FieldResult` of
 * match / review / mismatch / missing with a human-readable, plain-language detail.
 *
 * What it does:
 *   - parse a value + unit out of each side ("750 mL", "1 L", "12 fl. oz.", "0,75 L")
 *   - normalize to a canonical millilitre quantity (mL <-> cL <-> L, fl oz / pt / qt / gal)
 *   - compare the quantities within a small relative tolerance
 *
 * Measurement-system note (CONTEXT §5), CONDITIONAL on beverage type: distilled
 * spirits and wine must state net contents in metric (mL / L); beer / malt may use
 * U.S. measures (fl oz). So an equal quantity expressed in a DIFFERENT measurement
 * system than expected is:
 *   - for BEER: a clean `match` (either system is acceptable);
 *   - for spirits/wine (or an unknown beverage type): a "looks right, a human should
 *     glance" case -> `review`, never a silent pass.
 * An equal quantity within the SAME system (e.g. 1 L vs 1000 mL) is always a clean
 * `match`. Pass `beverageType` to enable the beer allowance; omit it for the
 * conservative (review-on-cross-system) default.
 */
import type { BeverageType, FieldResult } from '@/types';

const FIELD = 'Net Contents';

/** Measurement system. Metric is required for spirits/wine; U.S. allowed for beer. */
type UnitSystem = 'metric' | 'us';

interface UnitDef {
  /** Conversion factor to millilitres. */
  ml: number;
  system: UnitSystem;
  /** Canonical display symbol. */
  symbol: string;
}

/**
 * Recognized units -> (factor to mL, system, canonical symbol). U.S. fluid measures
 * use the U.S. customary definitions (1 US fl oz = 29.5735 mL).
 */
const UNITS: Record<string, UnitDef> = {
  ml: { ml: 1, system: 'metric', symbol: 'mL' },
  cl: { ml: 10, system: 'metric', symbol: 'cL' },
  l: { ml: 1000, system: 'metric', symbol: 'L' },
  floz: { ml: 29.5735, system: 'us', symbol: 'fl oz' },
  pt: { ml: 473.176, system: 'us', symbol: 'pt' },
  qt: { ml: 946.353, system: 'us', symbol: 'qt' },
  gal: { ml: 3785.41, system: 'us', symbol: 'gal' },
};

/** Map a raw, lowercased unit token to a canonical UNITS key (or null). */
function canonicalUnitKey(raw: string): string | null {
  // Strip spaces/periods so "fl. oz." and "fl oz" collapse to the same token.
  const t = raw.toLowerCase().replace(/[.\s]/g, '');
  if (/^(milliliters?|millilitres?|ml)$/.test(t)) return 'ml';
  if (/^(centiliters?|centilitres?|cl)$/.test(t)) return 'cl';
  if (/^(liters?|litres?|l)$/.test(t)) return 'l';
  if (/^(fluidounces?|floz|oz)$/.test(t)) return 'floz';
  if (/^(pints?|pt)$/.test(t)) return 'pt';
  if (/^(quarts?|qt)$/.test(t)) return 'qt';
  if (/^(gallons?|gal)$/.test(t)) return 'gal';
  return null;
}

export interface ParsedNetContents {
  /** Numeric value as stated, or null if no number found. */
  value: number | null;
  /** Canonical unit symbol ("mL", "fl oz", ...), or null if no recognized unit. */
  unit: string | null;
  /** Measurement system of the unit, or null when no unit was recognized. */
  system: UnitSystem | null;
  /** Quantity in millilitres (value x factor), or null if value/unit missing. */
  ml: number | null;
}

// Unit alternation (longest/multi-word first so e.g. "fl oz" wins over "l").
const UNIT_GROUP =
  'fl\\.?\\s*oz\\.?|fluid\\s+ounces?|milliliters?|millilitres?|centiliters?|centilitres?|liters?|litres?|gallons?|quarts?|pints?|ml|cl|gal|qt|pt|l|oz';

// A number (optional decimal, "." or "," separator) IMMEDIATELY followed by a unit.
// Anchoring the number to a unit means surrounding text or a lot code that happens
// to contain digits ("Lot 12345 / 750 mL") does not steal the parse from the real
// net-contents token.
const NET_WITH_UNIT_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_GROUP})\\b`, 'i');
// Fallback: any bare number, used only when no number-with-unit exists in the string.
const BARE_NUMBER_RE = /(\d+(?:[.,]\d+)?)/;

/**
 * Parse a net-contents string into a value + canonical unit + millilitre quantity.
 * Tolerant of "750 mL", "750ml", "1 L", "0,75 L", "12 fl. oz.", "25.4 fl oz", and of
 * surrounding text / lot codes ("Lot 12345 / 750 mL" -> 750 mL).
 */
export function parseNetContents(input: string | null): ParsedNetContents {
  const text = (input ?? '').trim();

  // Prefer the number that is actually attached to a unit.
  const m = text.match(NET_WITH_UNIT_RE);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    const value = Number(m[1].replace(',', '.'));
    const key = canonicalUnitKey(m[2]);
    const def = key !== null ? UNITS[key] : undefined;
    if (def !== undefined) {
      return { value, unit: def.symbol, system: def.system, ml: value * def.ml };
    }
  }

  // No number-with-unit found: fall back to a bare number (unit-less, e.g. "750").
  const bare = text.match(BARE_NUMBER_RE);
  if (bare && bare[1] !== undefined) {
    return { value: Number(bare[1].replace(',', '.')), unit: null, system: null, ml: null };
  }

  return { value: null, unit: null, system: null, ml: null };
}

function result(
  expected: string,
  found: string | null,
  status: FieldResult['status'],
  detail: string,
): FieldResult {
  return { field: FIELD, expected, found, status, detail };
}

/** Trim trailing zeros for display ("750.00" -> "750", "25.40" -> "25.4"). */
function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

export interface NetContentsCompareOptions {
  /**
   * Allowed relative difference between the two millilitre quantities. Default
   * 0.01 (1%) - generous enough to absorb the rounding inherent in stating a
   * metric fill in U.S. fluid ounces (e.g. "25.4 fl oz" for a 750 mL bottle),
   * tight enough that genuinely different standard fills (375 / 500 / 700 / 750 /
   * 1000 mL) still register as a mismatch.
   */
  toleranceRatio?: number;
}

/**
 * Compare the expected net contents against the value read off the label.
 * `found` is the label string (may be null). Pure & deterministic.
 */
export function compareNetContents(
  expected: string,
  found: string | null,
  beverageType?: BeverageType,
  options: NetContentsCompareOptions = {},
): FieldResult {
  const toleranceRatio = options.toleranceRatio ?? 0.01;
  const expectedTrim = (expected ?? '').trim();
  const foundTrim = (found ?? '').trim();

  // Nothing read for this field -> missing (a human / better image is needed).
  if (foundTrim === '') {
    return result(expected, found ?? null, 'missing', 'No net contents were read from the label.');
  }

  const pe = parseNetContents(expectedTrim);
  const pf = parseNetContents(foundTrim);

  // Could not read a usable quantity off the label.
  if (pf.ml === null) {
    if (pf.value !== null) {
      return result(
        expected,
        found,
        'review',
        `The label shows "${foundTrim}" - a number with no recognizable unit of measure. Please confirm the net contents.`,
      );
    }
    return result(
      expected,
      found,
      'missing',
      `Could not read a net-contents quantity from the label ("${foundTrim}").`,
    );
  }

  // No usable expected quantity to compare against (blank or unit-less expected).
  if (pe.ml === null) {
    if (pe.value !== null && Math.abs(pe.value - (pf.value ?? NaN)) < 1e-9) {
      return result(
        expected,
        found,
        'review',
        `The number matches (${fmt(pf.value ?? 0)}), but the expected value carried no unit - the label reads ${fmt(pf.value ?? 0)} ${pf.unit}. Please confirm the unit.`,
      );
    }
    return result(
      expected,
      found,
      'review',
      `The label reads ${fmt(pf.value ?? 0)} ${pf.unit}, but no comparable expected net contents was provided. Please confirm.`,
    );
  }

  // Both sides parsed to a millilitre quantity - compare numerically.
  const diff = Math.abs(pe.ml - pf.ml);
  const tolerance = Math.max(toleranceRatio * pe.ml, 1e-6);

  if (diff > tolerance) {
    return result(
      expected,
      found,
      'mismatch',
      `Expected ${fmt(pe.value ?? 0)} ${pe.unit} (${fmt(pe.ml)} mL) but the label shows ${fmt(pf.value ?? 0)} ${pf.unit} (${fmt(pf.ml)} mL).`,
    );
  }

  // Equal quantity. Same measurement system -> clean match; different system
  // (metric expected, U.S. on the label or vice-versa) -> review, because
  // spirits/wine must state metric and that judgment belongs to a human.
  if (pe.system !== pf.system) {
    // CONTEXT §5: beer / malt beverages MAY state net contents in U.S. fluid
    // measures (fl oz); distilled spirits and wine MUST use metric (mL / L). So an
    // equal quantity in a different measurement system is a clean `match` for beer
    // (either system is acceptable), but a human-review flag for spirits/wine —
    // and for an unknown beverage type we keep the conservative `review`, never a
    // silent pass. (Mirrors the conditional-by-beverage-type design in `abv.ts`;
    // resolves the T2.3 AUDIT MAJOR carried to T2.5.)
    if (beverageType === 'beer') {
      return result(
        expected,
        found,
        'match',
        `Matches (${fmt(pe.value ?? 0)} ${pe.unit} = ${fmt(pf.value ?? 0)} ${pf.unit}); U.S. fluid measure is acceptable for malt beverages.`,
      );
    }
    return result(
      expected,
      found,
      'review',
      `Same quantity, stated in a different measurement system: expected ${fmt(pe.value ?? 0)} ${pe.unit}, the label shows ${fmt(pf.value ?? 0)} ${pf.unit} (~ ${fmt(pf.ml)} mL). Spirits and wine must state metric (mL / L); please confirm the unit is acceptable for this beverage type.`,
    );
  }

  // Same system, equal quantity, but stated with a different unit/number
  // (e.g. 1 L vs 1000 mL) - still a match; note the equivalent representation.
  if (pe.unit !== pf.unit) {
    return result(
      expected,
      found,
      'match',
      `Matches (${fmt(pe.value ?? 0)} ${pe.unit} = ${fmt(pf.value ?? 0)} ${pf.unit}).`,
    );
  }

  return result(expected, found, 'match', `Matches (${fmt(pf.value ?? 0)} ${pf.unit}).`);
}
