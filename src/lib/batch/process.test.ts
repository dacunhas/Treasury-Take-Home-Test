import { describe, it, expect, vi } from 'vitest';
import { runBatch, summarizeOutcomes } from './process';
import { toVerifyFields } from './fields';
import type { MatchedBatchRow, VerificationResult } from './types';

function matched(
  rowNumber: number,
  over: Partial<MatchedBatchRow> = {},
): MatchedBatchRow {
  return {
    rowNumber,
    imageName: `img${rowNumber}.png`,
    matchedFileName: `img${rowNumber}.png`,
    errors: [],
    expected: { brand: `B${rowNumber}`, classType: 'C', abv: '', netContents: '750 mL', beverageType: 'spirits' },
    ...over,
  };
}

function vr(overall: VerificationResult['overall']): VerificationResult {
  return { fields: [], warning: { present: true, prefixCaps: true, textMatch: true, status: 'match' }, overall, latencyMs: 1200 };
}

describe('runBatch — per-row isolation (T4.1 acceptance)', () => {
  it('one rejecting row does not fail the batch; others still produce verdicts', async () => {
    const rows = [matched(1), matched(2), matched(3)];
    const verifyRow = vi.fn(async (row: MatchedBatchRow) => {
      if (row.rowNumber === 2) throw new Error('We could not read the label clearly.');
      return vr('pass');
    });
    const outcomes = await runBatch(rows, {
      resolveImage: (name) => name,
      verifyRow,
      concurrency: 1,
    });
    expect(outcomes.map((o) => o.status)).toEqual(['pass', 'error', 'pass']);
    expect(outcomes[1]?.error).toMatch(/could not read the label clearly/);
    // The valid rows still carry their full result.
    expect(outcomes[0]?.result?.overall).toBe('pass');
  });

  it('maps a resolved result.overall straight onto the row status', async () => {
    const rows = [matched(1), matched(2), matched(3)];
    const overalls = { 1: 'pass', 2: 'review', 3: 'fail' } as const;
    const outcomes = await runBatch(rows, {
      resolveImage: (n) => n,
      verifyRow: async (row) => vr(overalls[row.rowNumber as 1 | 2 | 3]),
      concurrency: 2,
    });
    expect(outcomes.map((o) => o.status)).toEqual(['pass', 'review', 'fail']);
  });

  it('skips invalid / unmatched rows WITHOUT calling the verifier', async () => {
    const rows = [
      matched(1, { errors: ['missing brand name'] }),
      matched(2, { matchedFileName: null }),
      matched(3),
    ];
    const verifyRow = vi.fn(async () => vr('pass'));
    const outcomes = await runBatch(rows, { resolveImage: (n) => n, verifyRow, concurrency: 1 });
    expect(outcomes[0]).toMatchObject({ status: 'error', error: 'missing brand name' });
    expect(outcomes[1]?.status).toBe('error');
    expect(outcomes[2]?.status).toBe('pass');
    // Only the one valid row reached the verifier.
    expect(verifyRow).toHaveBeenCalledTimes(1);
  });

  it('errors a row whose image payload cannot be resolved', async () => {
    const outcomes = await runBatch([matched(1)], {
      resolveImage: () => undefined,
      verifyRow: async () => vr('pass'),
    });
    expect(outcomes[0]?.status).toBe('error');
    expect(outcomes[0]?.error).toMatch(/was not available to process/);
  });

  it('returns outcomes in original row order even under concurrency', async () => {
    const rows = [matched(1), matched(2), matched(3), matched(4)];
    const delays: Record<number, number> = { 1: 20, 2: 1, 3: 15, 4: 2 };
    const outcomes = await runBatch(rows, {
      resolveImage: (n) => n,
      verifyRow: async (row) => {
        await new Promise((r) => setTimeout(r, delays[row.rowNumber] ?? 0));
        return vr('pass');
      },
      concurrency: 4,
    });
    expect(outcomes.map((o) => o.rowNumber)).toEqual([1, 2, 3, 4]);
  });

  it('reports progress once per settled row', async () => {
    const rows = [matched(1), matched(2), matched(3)];
    const ticks: number[] = [];
    await runBatch(rows, {
      resolveImage: (n) => n,
      verifyRow: async () => vr('pass'),
      onProgress: (p) => ticks.push(p.completed),
      concurrency: 1,
    });
    expect(ticks).toEqual([1, 2, 3]);
  });

  it('never rejects — returns an empty array for no rows', async () => {
    const outcomes = await runBatch([], { resolveImage: (n) => n, verifyRow: async () => vr('pass') });
    expect(outcomes).toEqual([]);
  });
});

describe('summarizeOutcomes', () => {
  it('tallies by status', async () => {
    const rows = [matched(1), matched(2, { errors: ['x'] }), matched(3)];
    const outcomes = await runBatch(rows, {
      resolveImage: (n) => n,
      verifyRow: async (row) => vr(row.rowNumber === 1 ? 'pass' : 'review'),
      concurrency: 1,
    });
    expect(summarizeOutcomes(outcomes)).toEqual({ pass: 1, review: 1, fail: 0, error: 1 });
  });
});

describe('toVerifyFields', () => {
  it('maps expected values verbatim, preserving a blank ABV', () => {
    expect(
      toVerifyFields({ brand: 'Acme', classType: 'Lager', abv: '', netContents: '355 mL', beverageType: 'beer' }),
    ).toEqual({ brand: 'Acme', classType: 'Lager', abv: '', netContents: '355 mL', beverageType: 'beer' });
  });
});
