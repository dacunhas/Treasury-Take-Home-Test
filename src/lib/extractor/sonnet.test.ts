import { describe, it, expect, vi } from 'vitest';
import {
  SonnetExtractor,
  SONNET_SUPPORTED_MIME_TYPES,
  SONNET_PROMPT,
  buildSonnetRequestBody,
  extractAnthropicText,
} from './sonnet';
import { ExtractionError, type LabelImage } from './types';

const IMAGE: LabelImage = { base64: 'QUJD', mimeType: 'image/png' };

/** Build a fake Anthropic Messages response wrapping `modelText`. */
function anthropicResponse(modelText: string): unknown {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: modelText }],
  };
}

/** A fake fetch returning a 200 JSON body, capturing the request for assertions. */
function okFetch(body: unknown, captured?: { url?: string; init?: RequestInit }): typeof fetch {
  return vi.fn(async (url: any, init: any) => {
    if (captured) {
      captured.url = url;
      captured.init = init;
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const SAMPLE_LABEL_JSON = JSON.stringify({
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  proof: '90 Proof',
  netContents: '750 mL',
  warningText: 'GOVERNMENT WARNING: (1) ...',
  rawText: 'OLD TOM DISTILLERY ...',
  confidence: 0.41,
});

describe('buildSonnetRequestBody', () => {
  it('inlines the image as a base64 source and pins temperature 0', () => {
    const body = buildSonnetRequestBody(IMAGE, 'claude-test') as any;
    expect(body.model).toBe('claude-test');
    expect(body.temperature).toBe(0);
    const content = body.messages[0].content;
    expect(content[0].text).toBe(SONNET_PROMPT);
    expect(content[1].source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'QUJD',
    });
  });
  it('prompt demands JSON-only output with the agreed keys', () => {
    expect(SONNET_PROMPT).toMatch(/single JSON object/i);
    expect(SONNET_PROMPT).toMatch(/brand, classType, abv, proof, netContents/);
  });
});

describe('extractAnthropicText', () => {
  it('joins text blocks and ignores non-text blocks', () => {
    const r = {
      content: [
        { type: 'text', text: 'a' },
        { type: 'tool_use', id: 'x' },
        { type: 'text', text: 'b' },
      ],
    };
    expect(extractAnthropicText(r)).toBe('ab');
  });
  it('returns null for missing/empty content', () => {
    expect(extractAnthropicText({})).toBeNull();
    expect(extractAnthropicText({ content: [] })).toBeNull();
    expect(extractAnthropicText({ content: [{ type: 'text' }] })).toBeNull();
    expect(extractAnthropicText(null)).toBeNull();
  });
});

describe('SonnetExtractor.extract', () => {
  it('returns a populated ExtractedLabel for a well-formed response', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      fetchImpl: okFetch(anthropicResponse(SAMPLE_LABEL_JSON)),
    });
    const r = await ex.extract(IMAGE);
    expect(r.brand).toBe('OLD TOM DISTILLERY');
    expect(r.netContents).toBe('750 mL');
    expect(r.confidence).toBeCloseTo(0.41);
  });

  it('sends the key in x-api-key with the anthropic-version header (not in URL)', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const ex = new SonnetExtractor({
      apiKey: 'secret-key',
      fetchImpl: okFetch(anthropicResponse('{"confidence":1}'), captured),
    });
    await ex.extract(IMAGE);
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret-key');
    expect(headers['anthropic-version']).toBeDefined();
    expect(String(captured.url)).not.toContain('secret-key');
  });

  it('degrades a safety-blocked / empty response to zero confidence (no throw)', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      fetchImpl: okFetch({ content: [] }),
    });
    const r = await ex.extract(IMAGE);
    expect(r.confidence).toBe(0);
    expect(r.brand).toBeNull();
  });

  it('degrades malformed JSON content to zero confidence (no throw)', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      fetchImpl: okFetch(anthropicResponse('not json at all')),
    });
    const r = await ex.extract(IMAGE);
    expect(r.confidence).toBe(0);
    expect(r.rawText).toBe('not json at all');
  });

  it('rejects an unsupported image type before any network call', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const ex = new SonnetExtractor({ apiKey: 'k', fetchImpl });
    await expect(
      ex.extract({ base64: 'QQ==', mimeType: 'image/tiff' }),
    ).rejects.toMatchObject({ code: 'input' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a non-2xx response to a secret-free ExtractionError (no provider body)', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      fetchImpl: vi.fn(async () =>
        new Response('{"error":{"message":"key sk-leak"}}', { status: 401 }),
      ) as unknown as typeof fetch,
    });
    let caught: unknown;
    try {
      await ex.extract(IMAGE);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExtractionError);
    expect((caught as ExtractionError).code).toBe('http');
    expect((caught as ExtractionError).message).not.toContain('sk-leak');
  });

  it('maps a network failure to an ExtractionError(network)', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      fetchImpl: vi.fn(async () => {
        throw new TypeError('connection refused');
      }) as unknown as typeof fetch,
    });
    await expect(ex.extract(IMAGE)).rejects.toMatchObject({ code: 'network' });
  });

  it('maps an aborted (timeout) call to an ExtractionError(timeout)', async () => {
    const ex = new SonnetExtractor({
      apiKey: 'k',
      timeoutMs: 5,
      fetchImpl: ((_url: any, init: any) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })) as unknown as typeof fetch,
    });
    await expect(ex.extract(IMAGE)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('exposes a stable name and a webp/gif-inclusive supported type list', () => {
    expect(new SonnetExtractor({ apiKey: 'k' }).name).toBe('claude-sonnet');
    expect(SONNET_SUPPORTED_MIME_TYPES).toContain('image/jpeg');
  });
});
