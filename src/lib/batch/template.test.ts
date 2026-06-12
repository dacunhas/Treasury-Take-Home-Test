/**
 * Batch CSV template tests. The key guarantee: the template we hand the user is
 * itself ACCEPTED by `parseBatchCsv` with no header error and no per-row errors —
 * so "download template -> fill in -> upload" can't fail on format.
 */
import { describe, it, expect } from 'vitest';
import { buildTemplateCsv, TEMPLATE_CSV_HEADER } from './template';
import { parseBatchCsv } from './csv';

describe('buildTemplateCsv', () => {
  it('includes the image column and the single-label required fields', () => {
    expect(TEMPLATE_CSV_HEADER).toContain('image');
    expect(TEMPLATE_CSV_HEADER).toContain('brand');
    expect(TEMPLATE_CSV_HEADER).toContain('class/type');
    expect(TEMPLATE_CSV_HEADER).toContain('net contents');
    expect(TEMPLATE_CSV_HEADER).toContain('beverage type');
    expect(TEMPLATE_CSV_HEADER).toContain('abv');
  });

  it('uses CRLF line endings (Excel/Sheets default)', () => {
    expect(buildTemplateCsv()).toContain('\r\n');
  });

  it('round-trips: the template parses with NO header error', () => {
    const parsed = parseBatchCsv(buildTemplateCsv());
    expect(parsed.headerError).toBeUndefined();
    expect(parsed.rows.length).toBe(2);
  });

  it('every example row is valid (no per-row errors)', () => {
    const parsed = parseBatchCsv(buildTemplateCsv());
    for (const row of parsed.rows) {
      expect(row.errors).toEqual([]);
    }
  });

  it('maps each example row to its image filename', () => {
    const parsed = parseBatchCsv(buildTemplateCsv());
    expect(parsed.rows[0]?.imageName).toBe('old-tom-bourbon.jpg');
    expect(parsed.rows[1]?.imageName).toBe('cascade-summit-ale.jpg');
  });

  it('leaves the beer example ABV blank (optional for beer)', () => {
    const parsed = parseBatchCsv(buildTemplateCsv());
    const beer = parsed.rows.find((r) => r.expected.beverageType === 'beer');
    expect(beer?.expected.abv).toBe('');
    expect(beer?.errors).toEqual([]);
  });
});
