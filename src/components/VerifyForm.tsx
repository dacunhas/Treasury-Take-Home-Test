'use client';

/**
 * T3.1 — Single-label verification screen. T3.2 — friendly error handling.
 * T3.3 — accessibility pass.
 *
 * A simple, accessible form (brand, class/type, ABV, net contents, beverage-type
 * selector) + a label-image picker that POSTs multipart/form-data to /api/verify
 * and renders the structured VerificationResult: an overall banner, per-field
 * rows (expected vs found), the Government Warning section with a word-level
 * diff, and the measured "Verified in N.Ns" latency (CONTEXT §1, PROJECT_PLAN §4).
 *
 * Accessibility bar — usable by a non-technical agent ("73-year-old benchmark"):
 *   - every control has a <label htmlFor> tie; the group has a <legend>;
 *   - status is conveyed by a WORD + a text glyph, never colour alone;
 *   - all colours clear WCAG AA (guarded by contrast.test.ts);
 *   - a visible, consistent keyboard focus ring (globals.css);
 *   - focus is moved to the result on success and to the error on a submit
 *     failure, and to the offending field on a fixable validation error;
 *   - the result and error regions are aria-live so screen readers announce them.
 * Stateless: nothing is persisted; the image is sent for the request only.
 */
import { useEffect, useRef, useState } from 'react';
import type { BeverageType, VerificationResult } from '@/types';
import {
  fieldStatusPresentation,
  formatVerifiedLine,
  overallPresentation,
} from '@/lib/ui/format';
import { COLORS } from '@/lib/ui/colors';
import { validateVerifyForm } from '@/lib/ui/validateForm';
import { downscaleImageFile } from '@/lib/ui/imageResize';
import {
  ACCEPT_ATTR,
  ACCEPTED_TYPES_LABEL,
  MAX_IMAGE_LABEL,
} from '@/lib/ui/imageConstraints';
import {
  NET_CONTENTS_UNITS,
  DEFAULT_NET_CONTENTS_UNIT,
  composeNetContents,
  suggestNetContentsUnit,
} from '@/lib/ui/netContentsInput';

const SAMPLE = {
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol. (90 Proof)',
  netContentsValue: '750',
};

const BEVERAGE_OPTIONS: { value: BeverageType; label: string }[] = [
  { value: 'spirits', label: 'Spirits' },
  { value: 'wine', label: 'Wine' },
  { value: 'beer', label: 'Beer' },
];

type SubmitState = 'idle' | 'verifying';
/** Where an error came from, so focus goes to the right place (T3.3). */
type ErrorOrigin = 'field' | 'submit';

const label: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: '1rem',
  marginBottom: '0.35rem',
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.7rem 0.75rem',
  fontSize: '1rem',
  border: `1px solid ${COLORS.inputBorder}`,
  borderRadius: 6,
  background: COLORS.white,
  color: COLORS.text,
};
const fieldWrap: React.CSSProperties = { marginBottom: '1.1rem' };
const hintText: React.CSSProperties = {
  margin: '0.4rem 0 0',
  color: COLORS.muted,
  fontSize: '0.9rem',
};

export default function VerifyForm() {
  const [beverageType, setBeverageType] = useState<BeverageType>('spirits');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorOrigin, setErrorOrigin] = useState<ErrorOrigin | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [netContentsValue, setNetContentsValue] = useState('');
  const [netContentsUnit, setNetContentsUnit] = useState<string>(
    DEFAULT_NET_CONTENTS_UNIT,
  );
  const brandRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  // Move focus where the user needs it after a render (T3.3):
  //  - a submit-time error (network/API): focus the alert so it is found;
  //  - a successful result: focus the result region so it is announced/reachable.
  // Fixable validation errors focus the offending field directly (see submit).
  useEffect(() => {
    if (error && errorOrigin === 'submit') errorRef.current?.focus();
  }, [error, errorOrigin]);
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorOrigin(null);
    setResult(null);

    // Preflight: catch empty form / missing-or-bad image before the network
    // round-trip so the agent gets an instant, friendly message (T3.2). The API
    // re-validates independently; this is a UX fast-path, not the boundary.
    const formData = new FormData(e.currentTarget);
    // B2: net contents is entered as a number + a unit dropdown so the unit is
    // always explicit. Compose them into the canonical "<value> <unit>" string
    // the engine parses, then drop the raw parts so the API sees only `netContents`.
    const composedNet = composeNetContents(
      String(formData.get('netContentsValue') ?? ''),
      String(formData.get('netContentsUnit') ?? ''),
    );
    formData.set('netContents', composedNet);
    formData.delete('netContentsValue');
    formData.delete('netContentsUnit');
    const file = formData.get('image');
    const image =
      file instanceof File ? { type: file.type, size: file.size } : null;
    const validation = validateVerifyForm({
      brand: String(formData.get('brand') ?? ''),
      classType: String(formData.get('classType') ?? ''),
      abv: String(formData.get('abv') ?? ''),
      netContents: String(formData.get('netContents') ?? ''),
      image,
    });
    if (!validation.ok) {
      setError(validation.message);
      setErrorOrigin('field');
      // A fixable input problem: focus the control to fix (role=alert still
      // announces the message to screen-reader users).
      const target = validation.focus === 'image' ? imageRef : brandRef;
      target.current?.focus();
      return;
    }

    // Downscale large photos before upload: trims latency for the 5s budget and
    // mobile data, with no accuracy cost (the vision model downsamples anyway).
    // Falls back to the original file on any failure, so it never blocks a verify.
    if (file instanceof File) {
      const reduced = await downscaleImageFile(file);
      if (reduced !== file) {
        const base = file.name.replace(/\.[^.]+$/, '') || 'label';
        formData.set('image', reduced, `${base}.jpg`);
      }
    }

    setSubmitState('verifying');
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });
      let data: VerificationResult | { error: string } | null = null;
      try {
        data = (await res.json()) as VerificationResult | { error: string };
      } catch {
        // Non-JSON body (e.g. an upstream gateway HTML error page).
        setError(
          `The server returned an unexpected response (HTTP ${res.status}). Please try again in a moment.`,
        );
        setErrorOrigin('submit');
        return;
      }
      if (!res.ok || data === null || 'error' in data) {
        setError(
          data && 'error' in data
            ? data.error
            : 'Something went wrong verifying the label. Please try again.',
        );
        setErrorOrigin('submit');
        return;
      }
      setResult(data);
    } catch {
      setError(
        'We could not reach the verification service. Please check your connection and try again.',
      );
      setErrorOrigin('submit');
    } finally {
      setSubmitState('idle');
    }
  }

  // B2 OPTIONAL smart-suggest: a non-silent, overrideable unit hint. It never
  // changes the dropdown on its own — the user clicks "Use L" to apply it.
  const netContentsSuggestion = suggestNetContentsUnit(
    netContentsValue,
    netContentsUnit,
  );

  const verifying = submitState === 'verifying';

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <form onSubmit={handleSubmit} noValidate aria-label="Verify a single label">
        <fieldset
          style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 'auto' }}
          disabled={verifying}
        >
          <legend
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              padding: 0,
              marginBottom: '0.25rem',
            }}
          >
            Expected values (from the application)
          </legend>
          <p style={{ ...hintText, marginTop: 0, marginBottom: '0.9rem' }}>
            Enter at least one expected value. Beverage type and the label image
            are needed to run a check.
          </p>

          <div style={fieldWrap}>
            <label htmlFor="brand" style={label}>
              Brand name
            </label>
            <input
              id="brand"
              name="brand"
              type="text"
              ref={brandRef}
              style={input}
              placeholder={SAMPLE.brand}
              autoComplete="off"
            />
          </div>

          <div style={fieldWrap}>
            <label htmlFor="classType" style={label}>
              Class / type
            </label>
            <input
              id="classType"
              name="classType"
              type="text"
              style={input}
              placeholder={SAMPLE.classType}
              autoComplete="off"
            />
          </div>

          <div style={fieldWrap}>
            <label htmlFor="beverageType" style={label}>
              Beverage type
            </label>
            <select
              id="beverageType"
              name="beverageType"
              value={beverageType}
              onChange={(e) => setBeverageType(e.target.value as BeverageType)}
              style={input}
            >
              {BEVERAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p id="beverageType-help" style={hintText}>
              Drives the alcohol-content rule: required for spirits, optional for
              beer and table wine.
            </p>
          </div>

          <div style={fieldWrap}>
            <label htmlFor="abv" style={label}>
              Alcohol content{' '}
              <span style={{ fontWeight: 400, color: COLORS.muted }}>
                (optional for beer and table wine)
              </span>
            </label>
            <input
              id="abv"
              name="abv"
              type="text"
              inputMode="decimal"
              style={input}
              placeholder={SAMPLE.abv}
              autoComplete="off"
              aria-describedby="beverageType-help abv-help"
            />
            <p id="abv-help" style={hintText}>
              In this field a plain number is read as a percentage — enter “45”
              for 45% Alc./Vol., or type it in full exactly as printed.
            </p>
          </div>

          <div style={fieldWrap}>
            <label htmlFor="netContentsValue" style={label}>
              Net contents
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="netContentsValue"
                name="netContentsValue"
                type="text"
                inputMode="decimal"
                value={netContentsValue}
                onChange={(e) => setNetContentsValue(e.target.value)}
                style={{ ...input, flex: '1 1 auto' }}
                placeholder={SAMPLE.netContentsValue}
                autoComplete="off"
                aria-describedby="netContents-help"
              />
              <label htmlFor="netContentsUnit" className="sr-only">
                Net contents unit
              </label>
              <select
                id="netContentsUnit"
                name="netContentsUnit"
                value={netContentsUnit}
                onChange={(e) => setNetContentsUnit(e.target.value)}
                style={{ ...input, flex: '0 0 13rem', width: 'auto' }}
                aria-describedby="netContents-help"
              >
                {NET_CONTENTS_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <p id="netContents-help" style={hintText}>
              Enter the number and choose its unit (defaults to mL). Leave blank if
              you are not checking net contents.
            </p>
            {netContentsSuggestion && (
              <p role="status" style={{ ...hintText, color: COLORS.buttonBg }}>
                {netContentsSuggestion.reason}{' '}
                <button
                  type="button"
                  onClick={() => setNetContentsUnit(netContentsSuggestion.unit)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: COLORS.buttonBg,
                    font: 'inherit',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Use {netContentsSuggestion.unit}
                </button>
              </p>
            )}
          </div>

          <div style={fieldWrap}>
            <label htmlFor="image" style={label}>
              Label image
            </label>
            <input
              id="image"
              name="image"
              type="file"
              ref={imageRef}
              accept={ACCEPT_ATTR}
              aria-describedby="image-help"
              style={{ ...input, padding: '0.55rem 0.75rem' }}
              onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)}
            />
            <p id="image-help" style={hintText}>
              {imageName
                ? `Selected: ${imageName}`
                : `Upload a clear photo or scan of the label (${ACCEPTED_TYPES_LABEL}, up to ${MAX_IMAGE_LABEL}). If the read comes back unclear, try a sharper, straight-on image.`}
            </p>
          </div>

          <button
            type="submit"
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              padding: '0.8rem 1.5rem',
              borderRadius: 8,
              border: 'none',
              background: verifying ? COLORS.buttonBusyBg : COLORS.buttonBg,
              color: COLORS.buttonText,
              cursor: verifying ? 'progress' : 'pointer',
              minWidth: 180,
            }}
            aria-busy={verifying}
          >
            {verifying ? 'Verifying…' : 'Verify label'}
          </button>
          {verifying && (
            <p
              role="status"
              style={{
                margin: '0.6rem 0 0',
                color: COLORS.buttonBg,
                fontWeight: 600,
              }}
            >
              Reading the label and comparing fields… if the first read is
              unclear we run a closer check, which can take a few seconds longer.
            </p>
          )}
        </fieldset>
      </form>

      <div aria-live="polite">
        {error && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            style={{
              border: `1px solid ${COLORS.errorBorder}`,
              background: COLORS.errorBg,
              color: COLORS.errorFg,
              borderRadius: 8,
              padding: '1rem 1.1rem',
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true" style={{ marginRight: '0.5rem' }}>
              ✖
            </span>
            {error}
          </div>
        )}

        {result && <ResultCard result={result} sectionRef={resultRef} />}
      </div>
    </div>
  );
}

export function ResultCard({
  result,
  sectionRef,
}: {
  result: VerificationResult;
  sectionRef: React.Ref<HTMLElement>;
}) {
  const overall = overallPresentation(result.overall);
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="result-heading"
      style={{ display: 'grid', gap: '1.25rem' }}
    >
      <h2 id="result-heading" className="sr-only">
        Verification result: {overall.label}
      </h2>
      <div
        style={{
          background: overall.bg,
          color: overall.fg,
          border: `2px solid ${overall.fg}`,
          borderRadius: 10,
          padding: '1.1rem 1.25rem',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
          <span aria-hidden="true" style={{ marginRight: '0.5rem' }}>
            {overall.glyph}
          </span>
          {overall.label}
        </p>
        <p style={{ margin: '0.4rem 0 0', fontSize: '1rem' }}>
          {overall.summary}
        </p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
          {formatVerifiedLine(result.latencyMs, result.escalated)}
        </p>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '1rem',
        }}
      >
        <caption
          style={{
            textAlign: 'left',
            fontWeight: 700,
            fontSize: '1.1rem',
            marginBottom: '0.5rem',
          }}
        >
          Field-by-field
        </caption>
        <thead>
          <tr>
            <th scope="col" style={th}>
              Field
            </th>
            <th scope="col" style={th}>
              Expected
            </th>
            <th scope="col" style={th}>
              Found on label
            </th>
            <th scope="col" style={th}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {result.fields.map((f) => {
            const p = fieldStatusPresentation(f.status);
            return (
              <tr key={f.field}>
                <th scope="row" style={{ ...td, fontWeight: 600 }}>
                  {f.field}
                </th>
                <td style={td}>{f.expected || '—'}</td>
                <td style={td}>{f.found ?? '—'}</td>
                <td style={td}>
                  <span style={{ fontWeight: 700, color: p.fg }}>
                    <span aria-hidden="true" style={{ marginRight: '0.35rem' }}>
                      {p.glyph}
                    </span>
                    {p.label}
                  </span>
                  {f.detail && (
                    <span
                      style={{
                        display: 'block',
                        color: COLORS.detail,
                        fontSize: '0.85rem',
                        marginTop: '0.2rem',
                      }}
                    >
                      {f.detail}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <WarningSection warning={result.warning} />
    </section>
  );
}

function WarningSection({
  warning,
}: {
  warning: VerificationResult['warning'];
}) {
  const p = fieldStatusPresentation(warning.status);
  return (
    <div
      style={{
        border: '1px solid #c9c9c9',
        borderRadius: 10,
        padding: '1rem 1.15rem',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
        Government Warning
        <span style={{ marginLeft: '0.6rem', color: p.fg, fontWeight: 700 }}>
          <span aria-hidden="true" style={{ marginRight: '0.35rem' }}>
            {p.glyph}
          </span>
          {p.label}
        </span>
      </h3>
      {warning.detail && (
        <p style={{ margin: '0 0 0.6rem', color: COLORS.detail }}>
          {warning.detail}
        </p>
      )}
      {warning.diff && warning.diff.length > 0 && (
        <>
          <p style={{ margin: '0.5rem 0 0.3rem', fontWeight: 600 }}>
            Difference from the required text:
          </p>
          <p
            style={{
              margin: 0,
              lineHeight: 1.7,
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '0.95rem',
              background: COLORS.diffPanelBg,
              padding: '0.6rem 0.75rem',
              borderRadius: 6,
            }}
          >
            {warning.diff.map((seg, i) => {
              if (seg.type === 'equal') {
                return <span key={i}>{seg.text} </span>;
              }
              if (seg.type === 'removed') {
                return (
                  <span
                    key={i}
                    style={{
                      color: COLORS.diffRemoved,
                      textDecoration: 'line-through',
                    }}
                  >
                    {seg.text}{' '}
                  </span>
                );
              }
              return (
                <span
                  key={i}
                  style={{
                    color: COLORS.diffAdded,
                    textDecoration: 'underline',
                    fontWeight: 700,
                  }}
                >
                  {seg.text}{' '}
                </span>
              );
            })}
          </p>
          <p style={{ margin: '0.5rem 0 0', color: COLORS.muted, fontSize: '0.85rem' }}>
            <span
              style={{ textDecoration: 'line-through', color: COLORS.diffRemoved }}
            >
              struck-through
            </span>{' '}
            = required wording missing from the label;{' '}
            <span
              style={{ textDecoration: 'underline', color: COLORS.diffAdded }}
            >
              underlined
            </span>{' '}
            = wording on the label that is not in the required text.
          </p>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '2px solid #767676',
  padding: '0.5rem 0.6rem',
  fontSize: '0.9rem',
  verticalAlign: 'top',
};
const td: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #d4d4d4',
  padding: '0.6rem',
  verticalAlign: 'top',
};
