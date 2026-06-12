/**
 * T5.4 / B2 — net-contents NUMBER + UNIT input helpers (pure, framework-free).
 *
 * The single-label form used to take net contents as one free-text field, which
 * meant a user could type a bare "750" with no unit and the engine had to either
 * guess or route the result to `review`. B2 splits the input into a NUMBER field
 * plus a UNIT dropdown so the unit is always explicit: the form composes the two
 * into the canonical "<value> <unit>" string the comparison engine already parses
 * (`parseNetContents`), and the engine never has to guess a bare number's unit.
 *
 * Kept I/O-free and DOM-free (like `validateForm.ts` / `format.ts`) so it runs
 * under the existing `node` vitest environment and stays trivially unit-testable.
 *
 * Smart-suggest (OPTIONAL, non-silent, overrideable): `suggestNetContentsUnit`
 * returns a *hint* only when the default unit (mL) would be implausible for the
 * number typed (e.g. "0.75" is litres, not 0.75 mL). It NEVER auto-changes the
 * dropdown — the form surfaces the suggestion and the user applies or ignores it.
 * When the number is ambiguous the default stays mL and no suggestion is made.
 */

/** A selectable unit for the net-contents dropdown. `value` is the canonical
 * symbol the engine's `parseNetContents` recognizes; `label` is human-facing. */
export interface NetContentsUnitOption {
  value: string;
  label: string;
}

/**
 * Unit choices, ordered for the dropdown. mL is first so it is the default
 * (most spirits/wine fills are stated in mL). The common metric + U.S. fluid
 * ounce units lead; the less common U.S. units (pt/qt/gal) follow as options.
 * Every `value` is a symbol `parseNetContents` canonicalizes.
 */
export const NET_CONTENTS_UNITS: readonly NetContentsUnitOption[] = [
  { value: 'mL', label: 'mL — millilitres' },
  { value: 'cL', label: 'cL — centilitres' },
  { value: 'L', label: 'L — litres' },
  { value: 'fl oz', label: 'fl oz — US fluid ounces' },
  { value: 'pt', label: 'pt — US pints' },
  { value: 'qt', label: 'qt — US quarts' },
  { value: 'gal', label: 'gal — US gallons' },
] as const;

/** The default unit (mL) — first option above. */
export const DEFAULT_NET_CONTENTS_UNIT = NET_CONTENTS_UNITS[0]?.value ?? 'mL';

/** True if `unit` is one of the recognized dropdown options. */
export function isNetContentsUnit(unit: string): boolean {
  return NET_CONTENTS_UNITS.some((u) => u.value === unit);
}

/**
 * Compose a NUMBER + UNIT into the canonical net-contents string the engine
 * parses. A blank/whitespace-only number yields '' (so the field stays optional
 * and the "blank expected" rules still apply); otherwise the value is always
 * paired with its unit, so the engine never receives a unit-less number from
 * this form. The raw number text is preserved (incl. a comma decimal, which the
 * engine tolerates); only surrounding whitespace is trimmed.
 */
export function composeNetContents(value: string, unit: string): string {
  const v = (value ?? '').trim();
  if (v === '') return '';
  const u = (unit ?? '').trim() || DEFAULT_NET_CONTENTS_UNIT;
  return `${v} ${u}`;
}

export interface NetContentsUnitSuggestion {
  /** The suggested unit symbol (a `NET_CONTENTS_UNITS` value). */
  unit: string;
  /** A short, plain-language reason shown to the user. */
  reason: string;
}

/**
 * OPTIONAL non-silent unit hint. Returns a suggestion ONLY when the currently
 * selected unit is the mL default AND the typed number is implausibly small for
 * millilitres (a bottle is never a fraction of a millilitre), which almost
 * always means the user meant litres. Returns null otherwise (ambiguous numbers
 * keep the mL default). Never mutates anything — the caller decides whether to
 * apply it, so the default is never auto-flipped.
 */
export function suggestNetContentsUnit(
  value: string,
  selectedUnit: string,
): NetContentsUnitSuggestion | null {
  // Only nudge away from the mL default; if the user already picked a unit,
  // respect it (no second-guessing an explicit choice).
  if (selectedUnit !== DEFAULT_NET_CONTENTS_UNIT) return null;

  const v = (value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(v)) return null; // not a plain number -> no hint
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;

  // A net-contents fill under 5 is almost certainly litres, not millilitres
  // (0.75 L, 1 L, 1.5 L, 3 L); a real mL fill is far larger (50 mL minis up).
  if (n < 5) {
    return { unit: 'L', reason: `“${v}” looks like litres, not millilitres.` };
  }
  return null;
}
