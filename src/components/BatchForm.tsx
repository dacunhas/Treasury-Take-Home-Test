'use client';

/**
 * T4.1 — Batch verification screen. T4.2 — sortable results table, row→detail,
 * and CSV export of results.
 *
 * An importer uploads a CSV of expected values (one label per row) plus the
 * matching label images; the app verifies each row and renders a results table.
 * This is the "200-300 at once" case (CONTEXT §3, Seattle/Janet) and the
 * slip-rule cut line (PROJECT_PLAN §7) — built after the single-label critical
 * path was complete.
 *
 * Architecture: all of the load-bearing logic lives in the pure, unit-tested
 * batch core (`@/lib/batch`): CSV parsing + per-row validation, image matching by
 * filename, per-row-isolated processing, results sorting (`sortOutcomes`), and
 * results→CSV serialization (`outcomesToCsv`). This component is thin glue — it
 * reads the files, supplies a verifier that POSTs each row to the existing
 * `/api/verify` route (so the server stays stateless and the single-label
 * correctness core is reused unchanged), shows progress, and renders the table.
 *
 * Row detail reuses the SAME `ResultCard` the single-label screen renders, so the
 * per-row detail matches the single-label output exactly (T4.2 acceptance) with
 * no duplicated rendering logic.
 *
 * One bad row never fails the batch (T4.1 acceptance): the verifier's throw is
 * caught per row by `runBatch`, surfaced as an `error` cell, and the run
 * continues.
 *
 * Accessibility (CONTEXT §2 "73-year-old benchmark"): every control has a
 * <label htmlFor>; the progress bar is a labelled <progress> plus an aria-live
 * status; the results table has a <caption> and scoped <th>s with `aria-sort` on
 * the active sort column; status is a WORD + a text glyph (never colour alone);
 * all colours clear WCAG AA (contrast.test). Sorting/expand controls are real
 * <button>s, keyboard-operable by default.
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import type { VerificationResult } from '@/types';
import {
  parseBatchCsv,
  matchRowsToFiles,
  runBatch,
  summarizeOutcomes,
  toVerifyFields,
  outcomesToCsv,
  sortOutcomes,
  type SortKey,
  type SortDirection,
  type BatchRowOutcome,
  type MatchedBatchRow,
} from '@/lib/batch';
import { ResultCard } from '@/components/VerifyForm';
import {
  fieldStatusPresentation,
  formatLatencySeconds,
  overallPresentation,
} from '@/lib/ui/format';
import { COLORS } from '@/lib/ui/colors';
import { downscaleImageFile } from '@/lib/ui/imageResize';
import { ACCEPT_ATTR } from '@/lib/ui/imageConstraints';

type RunState = 'idle' | 'running' | 'done';

/**
 * Presentation for a batch row status. Colours are taken from the SAME tokens
 * the single-label UI uses (`overallPresentation` / `fieldStatusPresentation`),
 * so the AA-contrast guarantee enforced by `contrast.test.ts` covers the batch
 * table by reference, not by a copied hex literal (audit/compliance nit, T4.1).
 */
function statusPresentation(status: BatchRowOutcome['status']): {
  label: string;
  glyph: string;
  fg: string;
} {
  if (status === 'pass') {
    const p = overallPresentation('pass');
    return { label: p.label, glyph: p.glyph, fg: p.fg };
  }
  if (status === 'review') return fieldStatusPresentation('review');
  if (status === 'fail') {
    const p = overallPresentation('fail');
    return { label: p.label, glyph: p.glyph, fg: p.fg };
  }
  // Could-not-verify reuses the mismatch foreground (a verified AA token).
  return { label: 'Could not verify', glyph: '!', fg: fieldStatusPresentation('mismatch').fg };
}

/** POST one row's expected values + matched image to /api/verify. */
async function verifyRowViaApi(
  row: MatchedBatchRow,
  file: File,
): Promise<VerificationResult> {
  const formData = new FormData();
  const fields = toVerifyFields(row.expected);
  (Object.keys(fields) as (keyof typeof fields)[]).forEach((k) =>
    formData.set(k, fields[k]),
  );

  // Downscale large photos before upload (same as the single-label path): trims
  // latency with no accuracy cost; falls back to the original on any failure.
  const reduced = await downscaleImageFile(file);
  if (reduced !== file) {
    const base = file.name.replace(/\.[^.]+$/, '') || 'label';
    formData.set('image', reduced, `${base}.jpg`);
  } else {
    formData.set('image', file, file.name);
  }

  const res = await fetch('/api/verify', { method: 'POST', body: formData });
  let data: VerificationResult | { error: string } | null = null;
  try {
    data = (await res.json()) as VerificationResult | { error: string };
  } catch {
    throw new Error(`The server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!res.ok || data === null || 'error' in data) {
    throw new Error(
      data && 'error' in data
        ? data.error
        : 'The label could not be verified.',
    );
  }
  return data;
}

/** Find image filenames uploaded more than once (basename collision, T4.1 carry-over a). */
function duplicateNames(files: File[]): string[] {
  const counts = new Map<string, number>();
  files.forEach((f) => counts.set(f.name, (counts.get(f.name) ?? 0) + 1));
  return [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
}

/** Trigger a client-side download of `text` as a named file. Stateless: nothing persisted. */
function downloadTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const label: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: '1rem',
  marginBottom: '0.35rem',
};
const hintText: React.CSSProperties = {
  margin: '0.4rem 0 0',
  color: COLORS.muted,
  fontSize: '0.9rem',
};
const cell: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  borderBottom: `1px solid #d9d9d9`,
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: '0.95rem',
};
const th: React.CSSProperties = { ...cell, fontWeight: 700, borderBottom: `2px solid #b0b0b0` };
/** A header-cell sort button styled as plain text so the table stays calm. */
const sortButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
  color: COLORS.buttonBg,
  textDecoration: 'underline',
};

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'row', label: 'Row' },
  { key: 'brand', label: 'Brand' },
  { key: 'image', label: 'Image' },
  { key: 'status', label: 'Result' },
];

export default function BatchForm() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<BatchRowOutcome[]>([]);
  const [unusedFiles, setUnusedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDirection }>({
    key: 'row',
    dir: 'asc',
  });
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const dupeNames = duplicateNames(imageFiles);

  const sortedOutcomes = useMemo(
    () => sortOutcomes(outcomes, sort.key, sort.dir),
    [outcomes, sort],
  );

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sort.key !== key) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  function handleExport() {
    const csv = outcomesToCsv(sortedOutcomes);
    downloadTextFile(csv, 'batch-verification-results.csv');
  }

  async function readCsvPreview(file: File | null) {
    setOutcomes([]);
    setRunState('idle');
    setUnusedFiles([]);
    setExpandedRow(null);
    if (!file) {
      setParsedCount(null);
      setHeaderError(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseBatchCsv(text);
      setHeaderError(parsed.headerError ?? null);
      setParsedCount(parsed.headerError ? null : parsed.rows.length);
    } catch {
      setHeaderError('That CSV file could not be read. Please re-export and try again.');
      setParsedCount(null);
    }
  }

  async function handleRun() {
    setError(null);
    setOutcomes([]);
    setExpandedRow(null);
    if (!csvFile) {
      setError('Please choose a CSV of expected values first.');
      return;
    }
    if (imageFiles.length === 0) {
      setError('Please choose the label images to match against the CSV rows.');
      return;
    }

    let parsed;
    try {
      parsed = parseBatchCsv(await csvFile.text());
    } catch {
      setError('That CSV file could not be read. Please re-export and try again.');
      return;
    }
    if (parsed.headerError) {
      setHeaderError(parsed.headerError);
      return;
    }

    const fileByName = new Map<string, File>();
    imageFiles.forEach((f) => fileByName.set(f.name, f));
    const { rows, unusedFiles: unused } = matchRowsToFiles(
      parsed.rows,
      imageFiles.map((f) => f.name),
    );
    setUnusedFiles(unused);

    setRunState('running');
    setProgress({ completed: 0, total: rows.length });
    const results = await runBatch(rows, {
      resolveImage: (name) => fileByName.get(name),
      verifyRow: verifyRowViaApi,
      onProgress: (p) => setProgress(p),
      concurrency: 3,
    });
    setOutcomes(results);
    setRunState('done');
    // Move focus to the results so screen-reader + keyboard users land on them.
    window.requestAnimationFrame(() => resultsRef.current?.focus());
  }

  const running = runState === 'running';
  const tally = outcomes.length > 0 ? summarizeOutcomes(outcomes) : null;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleRun();
        }}
        aria-label="Verify a batch of labels"
      >
        <fieldset
          style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 'auto' }}
          disabled={running}
        >
          <legend style={{ fontSize: '1.15rem', fontWeight: 700, padding: 0, marginBottom: '0.25rem' }}>
            Batch verification
          </legend>
          <p style={{ ...hintText, marginTop: 0, marginBottom: '0.9rem' }}>
            Upload a CSV of expected values (one row per label) and the matching
            label images. The CSV needs columns for brand, class/type, net
            contents, beverage type, and an image filename (ABV is optional). Each
            row is checked on its own — one unreadable label won&apos;t stop the rest.
          </p>

          <div style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="batch-csv" style={label}>
              Expected values (CSV)
            </label>
            <input
              id="batch-csv"
              name="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0] ?? null;
                setCsvFile(f);
                void readCsvPreview(f);
              }}
            />
            <p style={hintText} aria-live="polite">
              {headerError
                ? headerError
                : parsedCount !== null
                  ? `Read ${parsedCount} row${parsedCount === 1 ? '' : 's'} from the CSV.`
                  : 'No CSV chosen yet.'}
            </p>
          </div>

          <div style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="batch-images" style={label}>
              Label images
            </label>
            <input
              id="batch-images"
              name="images"
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              onChange={(e) => {
                setImageFiles(Array.from(e.currentTarget.files ?? []));
                setExpandedRow(null);
              }}
            />
            <p style={hintText} aria-live="polite">
              {imageFiles.length === 0
                ? 'No images chosen yet.'
                : `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} chosen.`}
            </p>
            {dupeNames.length > 0 && (
              <p style={{ ...hintText, color: COLORS.errorFg }} role="status">
                Heads up: {dupeNames.length === 1 ? 'two images share' : 'some images share'} the
                same name ({dupeNames.join(', ')}). A CSV row can only match one of
                them — please rename so each label has a unique filename.
              </p>
            )}
          </div>

          <button
            type="submit"
            style={{
              padding: '0.7rem 1.4rem',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: COLORS.buttonText,
              background: running ? COLORS.buttonBusyBg : COLORS.buttonBg,
              border: 'none',
              borderRadius: 6,
              cursor: running ? 'progress' : 'pointer',
            }}
          >
            {running ? 'Verifying…' : 'Verify batch'}
          </button>
        </fieldset>
      </form>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.85rem 1rem',
            background: COLORS.errorBg,
            color: COLORS.errorFg,
            border: `1px solid ${COLORS.errorBorder}`,
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      {(running || runState === 'done') && progress.total > 0 && (
        <div>
          <label htmlFor="batch-progress" style={label}>
            Progress
          </label>
          <progress
            id="batch-progress"
            value={progress.completed}
            max={progress.total}
            style={{ width: '100%', height: '1.1rem' }}
          />
          <p style={hintText} role="status" aria-live="polite">
            {running
              ? `Verified ${progress.completed} of ${progress.total}…`
              : `Done — verified ${progress.total} label${progress.total === 1 ? '' : 's'}.`}
          </p>
        </div>
      )}

      {tally && (
        <section
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Batch results"
          style={{ display: 'grid', gap: '0.75rem' }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              {tally.pass} looked good · {tally.review} need a closer look ·{' '}
              {tally.fail} did not match · {tally.error} could not be verified
            </p>
            <button
              type="button"
              onClick={handleExport}
              style={{
                padding: '0.55rem 1.1rem',
                fontSize: '1rem',
                fontWeight: 600,
                color: COLORS.buttonText,
                background: COLORS.buttonBg,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Download results (CSV)
            </button>
          </div>
          {unusedFiles.length > 0 && (
            <p style={hintText}>
              {unusedFiles.length} uploaded image
              {unusedFiles.length === 1 ? ' was' : 's were'} not referenced by any
              CSV row: {unusedFiles.join(', ')}.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <caption style={{ textAlign: 'left', fontWeight: 700, marginBottom: '0.5rem' }}>
                Per-row results — choose a column heading to sort, or “Show details”
                to see the full per-field breakdown.
              </caption>
              <thead>
                <tr>
                  {SORT_COLUMNS.map((col) => (
                    <th key={col.key} scope="col" style={th} aria-sort={ariaSort(col.key)}>
                      <button
                        type="button"
                        style={sortButton}
                        onClick={() => toggleSort(col.key)}
                        aria-label={`Sort by ${col.label}${
                          sort.key === col.key
                            ? sort.dir === 'asc'
                              ? ', currently ascending'
                              : ', currently descending'
                            : ''
                        }`}
                      >
                        {col.label}
                        <span aria-hidden="true">
                          {sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" style={th}>Detail</th>
                  <th scope="col" style={th}>More</th>
                </tr>
              </thead>
              <tbody>
                {sortedOutcomes.map((o) => {
                  const p = statusPresentation(o.status);
                  const isOpen = expandedRow === o.rowNumber;
                  const detailId = `batch-detail-${o.rowNumber}`;
                  return (
                    <Fragment key={o.rowNumber}>
                      <tr>
                        <td style={cell}>{o.rowNumber}</td>
                        <td style={cell}>{o.row.expected.brand || '—'}</td>
                        <td style={cell}>{(o.row.matchedFileName ?? o.row.imageName) || '—'}</td>
                        <td style={{ ...cell, color: p.fg, fontWeight: 600 }}>
                          <span aria-hidden="true">{p.glyph} </span>
                          {p.label}
                        </td>
                        <td style={{ ...cell, color: COLORS.detail }}>
                          {o.status === 'error'
                            ? o.error
                            : o.result
                              ? `Verified in ${formatLatencySeconds(o.result.latencyMs)}s${
                                  o.result.escalated ? ' (closer check)' : ''
                                }`
                              : ''}
                        </td>
                        <td style={cell}>
                          {o.result ? (
                            <button
                              type="button"
                              style={sortButton}
                              aria-expanded={isOpen}
                              aria-controls={detailId}
                              onClick={() =>
                                setExpandedRow(isOpen ? null : o.rowNumber)
                              }
                            >
                              {isOpen ? 'Hide details' : 'Show details'}
                            </button>
                          ) : (
                            <span style={{ color: COLORS.muted }}>—</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && o.result && (
                        <tr>
                          <td id={detailId} colSpan={6} style={{ ...cell, background: '#fafafa' }}>
                            <ResultCard result={o.result} sectionRef={null} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
