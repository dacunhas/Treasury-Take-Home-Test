/**
 * T3.3 — single source of truth for the UI colour palette.
 *
 * Centralising the colours the form renders (previously inline literals) lets
 * `contrast.test.ts` enumerate every foreground/background pair and assert AA
 * contrast automatically. Status/verdict colours live in `format.ts`
 * (OVERALL_PRESENTATION / FIELD_STATUS_PRESENTATION) and are guarded by the same
 * test. CONTEXT §2, PROJECT_PLAN §4.
 */

export const COLORS = {
  /** Page text on white — high contrast for the over-50 readership. */
  text: '#1a1a1a',
  /** Muted helper/secondary text on white. #595959 = ~7:1 vs #fff (AA). */
  muted: '#595959',
  /** Detail text inside result rows on white / very light grey. */
  detail: '#3a3a3a',
  /** Input border (non-text UI) on white — needs only AA large/UI (3:1). */
  inputBorder: '#6b6b6b',
  white: '#ffffff',

  /** Primary action button. */
  buttonBg: '#1f4e8c',
  /** Busy/disabled-look button while verifying (darkened so white text stays AA). */
  buttonBusyBg: '#234d80',
  buttonText: '#ffffff',

  /** Inline error / alert region. */
  errorBg: '#fbe9e9',
  errorFg: '#8a1c1c',
  errorBorder: '#8a1c1c',

  /** Diff legend foregrounds (rendered on a #fafafa panel). */
  diffPanelBg: '#fafafa',
  diffRemoved: '#8a1c1c',
  diffAdded: '#0f5d2a',
} as const;

export type ColorToken = keyof typeof COLORS;
