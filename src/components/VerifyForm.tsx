'use client';

/**
 * T3.1 — Single-label verification screen.
 *
 * A simple, accessible form (brand, class/type, ABV, net contents, beverage-type
 * selector) + a label-image picker that POSTs multipart/form-data to /api/verify
 * and renders the structured VerificationResult: an overall banner, per-field
 * rows (expected vs found), the Government Warning section with a word-level
 * diff, and the measured "Verified in N.Ns" latency (CONTEXT §1, PROJECT_PLAN §4).
 *
 * Design bar: usable by a non-technical agent ("73-year-old benchmark") — large
 * targets, labels tied to inputs, status conveyed by word + glyph (not color
 * alone), aria-live result announcements. Stateless: nothing is persisted; the
 * image is sent for the request only. Friendly errors are shown inline (the API
 * already returns human-readable messages, never a stack trace).
 */
import { useRef, useState } from 'react';
import type { BeverageType, VerificationResult } from '@/types';
import {
  fieldStatusPresentation,
  formatVerifiedLine,
  overallPresentation,
} from '@/lib/ui/format';
import { validateVerifyForm } from '@/lib/ui/validateForm';
import {
  ACCEPT_ATTR,
  ACCEPTED_TYPES_LABEL,
  MAX_IMAGE_LABEL,
} from '@/lib/ui/imageConstraints';

const SAMPLE = {
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
};

const BEVERAGE_OPTIONS: { value: BeverageType; label: string }[] = [
  { value: 'spirits', label: 'Spirits' },
  { value: 'wine', label: 'Wine' },
  { value: 'beer', label: 'Beer' },
];

type SubmitState = 'idle' | 'verifying';

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
  border: '1px solid #6b6b6b',
  borderRadius: 6,
  background: '#fff',
};
const fieldWrap: React.CSSProperties = { marginBottom: '1.1rem' };

export default function VerifyForm() {
  const [beverageType, setBeverageType] = useState<BeverageType>('spirits');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const brandRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Preflight: catch empty form / missing-or-bad image before the network
    // round-trip so the agent gets an instant, friendly message (T3.2). The API
    // re-validates independently; this is a UX fast-path, not the boundary.
    const formData = new FormData(e.currentTarget);
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
      const target = validation.focus === 'image' ? imageRef : brandRef;
      target.current?.focus();
      return;
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
        return;
      }
      if (!res.ok || data === null || 'error' in data) {
        setError(
          data && 'error' in data
            ? data.error
            : 'Something went wrong verifying the label. Please try again.',
        );
        return;
      }
      setResult(data);
    } catch {
      setError(
        'We could not reach the verification service. Please check your connection and try again.',
      );
    } finally {
      setSubmitState('idle');
    }
  }

  const verifying = submitState === 'verifying';

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset
          style={{ border: 'none', margin: 0, padding: 0 }}
          disabled={verifying}
        >
          <legend
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              padding: 0,
              marginBottom: '0.75rem',
            }}
          >
            Expected values (from the application)
          </legend>

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
              onChange={(e) =>
                setBeverageType(e.target.value as BeverageType)
              }
              style={input}
            >
              {BEVERAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldWrap}>
            <label htmlFor="abv" style={label}>
              Alcohol content{' '}
              <span style={{ fontWeight: 400, color: '#555' }}>
                (optional for beer and table wine)
              </span>
            </label>
            <input
              id="abv"
              name="abv"
              type="text"
              style={input}
              placeholder={SAMPLE.abv}
              autoComplete="off"
            />
          </div>

          <div style={fieldWrap}>
            <label htmlFor="netContents" style={label}>
              Net contents
            </label>
            <input
              id="netContents"
              name="netContents"
              type="text"
              style={input}
              placeholder={SAMPLE.netContents}
              autoComplete="off"
            />
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
              onChange={(e) =>
                setImageName(e.target.files?.[0]?.name ?? null)
              }
            />
            <p
              id="image-help"
              style={{ margin: '0.4rem 0 0', color: '#555', fontSize: '0.9rem' }}
            >
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
              background: verifying ? '#3a5d8f' : '#1f4e8c',
              color: '#fff',
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
              style={{ margin: '0.6rem 0 0', color: '#1f4e8c', fontWeight: 600 }}
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
            role="alert"
            style={{
              border: '1px solid #8a1c1c',
              background: '#fbe9e9',
              color: '#8a1c1c',
              borderRadius: 8,
              padding: '1rem 1.1rem',
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {result && <ResultCard result={result} />}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: VerificationResult }) {
  const overall = overallPresentation(result.overall);
  return (
    <section
      aria-label="Verification result"
      style={{ display: 'grid', gap: '1.25rem' }}
    >
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
                        color: '#444',
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
        <p style={{ margin: '0 0 0.6rem', color: '#333' }}>{warning.detail}</p>
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
              background: '#fafafa',
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
                      color: '#8a1c1c',
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
                    color: '#0f5d2a',
                    textDecoration: 'underline',
                    fontWeight: 700,
                  }}
                >
                  {seg.text}{' '}
                </span>
              );
            })}
          </p>
          <p style={{ margin: '0.5rem 0 0', color: '#555', fontSize: '0.85rem' }}>
            <span style={{ textDecoration: 'line-through', color: '#8a1c1c' }}>
              struck-through
            </span>{' '}
            = required wording missing from the label;{' '}
            <span style={{ textDecoration: 'underline', color: '#0f5d2a' }}>
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
  borderBottom: '2px solid #999',
  padding: '0.5rem 0.6rem',
  fontSize: '0.9rem',
  verticalAlign: 'top',
};
const td: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #ddd',
  padding: '0.6rem',
  verticalAlign: 'top',
};
