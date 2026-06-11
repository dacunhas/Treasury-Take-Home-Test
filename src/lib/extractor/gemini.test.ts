import { describe, it, expect, vi } from 'vitest';
import {
  GeminiExtractor,
  SUPPORTED_MIME_TYPES,
  buildGeminiRequestBody,
  extractModelText,
  parseExtractedLabel,
} from './gemini';
import { ExtractionError, type LabelImage } from './types';

const IMAGE: LabelImage = { base64: 'QUJD', mimeType: 'image/png' };

/** Build a fake gemini generateContent response wrapping `modelText`. */
function geminiResponse(modelText: string): unknown {
  return { candidates: [{ content: { parts: [{ text: modelText }] } }] };
}

/** A fake fetch returning a 200 JSON body. */
function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

const SAMPLE_LABEL_JSON = JSON.stringify({
  brand: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  proof: '90 Proof',
  netContents: '750 mL',
  warningText: 'GOVERNMENT WARNING: (1) ...',
  rawText: 'OLD TOM DISTILLERY ...',
  confidence: 0.94,
});

describe('buildGeminiRequestBody', () => {
  it('inlines the image and pins low-temperature structured JSON output', () => {
    const body = buildGeminiRequestBody(IMAGE) as any;
    const parts = body.contents[0].parts;
    expect(parts[1].inlineData).toEqual({ mimeType: 'image/png', data: 'QUJD' });
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties).toHaveProperty('confidence');
  });

  it('pins the minimal thinking level by default (5s SLA — no wasted reasoning)', () => {
    const body = buildGeminiRequestBody(IMAGE) as any;
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });
});

describe('extractModelText', () => {
  it('returns concatenated part text', () => {
    expect(extractModelText(geminiResponse('{"confidence":1}'))).toBe('{"confidence":1}');
  });
  it('joins multiple text parts', () => {
    const r = { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] };
    expect(extractModelText(r)).toBe('ab');
  });
  it('returns null for missing/empty candidates or parts', () => {
    expect(extractModelText({})).toBeNull();
    expect(extractModelText({ candidates: [] })).toBeNull();
    expect(extractModelText({ candidates: [{ content: {} }] })).toBeNull();
    expect(extractModelText(null)).toBeNull();
  });
});

describe('parseExtractedLabel', () => {
  it('maps a well-formed JSON object to ExtractedLabel', () => {
    const r = parseExtractedLabel(SAMPLE_LABEL_JSON);
    expect(r.brand).toBe('OLD TOM DISTILLERY');
    expect(r.classType).toBe('Kentucky Straight Bourbon Whiskey');
    expect(r.abv).toBe('45% Alc./Vol.');
    expect(r.netContents).toBe('750 mL');
    expect(r.confidence).toBe(0.94);
  });
  it('preserves nulls and empty strings as null', () => {
    const r = parseExtractedLabel(JSON.stringify({ brand: null, abv: '   ', confidence: 0.5 }));
    expect(r.brand).toBeNull();
    expect(r.abv).toBeNull();
    expect(r.netContents).toBeNull();
  });
  it('clamps confidence to [0,1] and defaults non-numeric to 0', () => {
    expect(parseExtractedLabel(JSON.stringify({ confidence: 1.7 })).confidence).toBe(1);
    expect(parseExtractedLabel(JSON.stringify({ confidence: -2 })).confidence).toBe(0);
    expect(parseExtractedLabel(JSON.stringify({ brand: 'x' })).confidence).toBe(0);
  });
  it('strips a ```json code fence', () => {
    const r = parseExtractedLabel('```json\n{"brand":"ACME","confidence":0.8}\n```');
    expect(r.brand).toBe('ACME');
    expect(r.confidence).toBe(0.8);
  });
  it('degrades malformed JSON to a zero-confidence label without throwing', () => {
    const r = parseExtractedLabel('not json at all {');
    expect(r.confidence).toBe(0);
    expect(r.brand).toBeNull();
    expect(r.rawText).toBe('not json at all {');
  });
  it('degrades a JSON array (non-object) to zero confidence', () => {
    const r = parseExtractedLabel('[1,2,3]');
    expect(r.confidence).toBe(0);
    expect(r.brand).toBeNull();
  });
});

describe('GeminiExtractor.extract (transport mocked — no live call)', () => {
  it('returns a populated ExtractedLabel on the happy path', async () => {
    const fetchImpl = okFetch(geminiResponse(SAMPLE_LABEL_JSON));
    const extractor = new GeminiExtractor({ apiKey: 'test-key', fetchImpl });
    const result = await extractor.extract(IMAGE);
    expect(result.brand).toBe('OLD TOM DISTILLERY');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends the api key in a header, not the URL query string', async () => {
    const fetchImpl = okFetch(geminiResponse('{"confidence":1}'));
    await new GeminiExtractor({ apiKey: 'secret-key', fetchImpl }).extract(IMAGE);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
  });

  it('rejects an unsupported image type with a friendly ExtractionError', async () => {
    const fetchImpl = okFetch(geminiResponse('{"confidence":1}'));
    const extractor = new GeminiExtractor({ apiKey: 'k', fetchImpl });
    await expect(extractor.extract({ base64: 'x', mimeType: 'application/pdf' }))
      .rejects.toMatchObject({ name: 'ExtractionError', code: 'input' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a non-2xx response to an ExtractionError without leaking the body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"error":"INTERNAL api-key=secret-key leaked"}', { status: 500 }),
    ) as unknown as typeof fetch;
    const extractor = new GeminiExtractor({ apiKey: 'secret-key', fetchImpl });
    await expect(extractor.extract(IMAGE)).rejects.toMatchObject({
      name: 'ExtractionError',
      code: 'http',
    });
    await extractor.extract(IMAGE).catch((e: ExtractionError) => {
      expect(e.message).not.toContain('secret-key');
      expect(e.message).not.toContain('leaked');
    });
  });

  it('maps a transport throw to a network ExtractionError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const extractor = new GeminiExtractor({ apiKey: 'secret-key', fetchImpl });
    await extractor.extract(IMAGE).catch((e: ExtractionError) => {
      expect(e.code).toBe('network');
      expect(e.message).not.toContain('secret-key');
      expect(e.message).not.toContain('ECONNREFUSED');
    });
    await expect(extractor.extract(IMAGE)).rejects.toMatchObject({ code: 'network' });
  });

  it('maps an aborted (timed-out) call to a timeout ExtractionError', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    const extractor = new GeminiExtractor({ apiKey: 'k', fetchImpl, timeoutMs: 5 });
    await expect(extractor.extract(IMAGE)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('does not crash on malformed model output — degrades to confidence 0', async () => {
    const fetchImpl = okFetch(geminiResponse('totally not json'));
    const extractor = new GeminiExtractor({ apiKey: 'k', fetchImpl });
    const result = await extractor.extract(IMAGE);
    expect(result.confidence).toBe(0);
    expect(result.rawText).toBe('totally not json');
  });

  it('degrades an empty/blocked response to a zero-confidence label (no throw)', async () => {
    const fetchImpl = okFetch({ candidates: [] });
    const extractor = new GeminiExtractor({ apiKey: 'k', fetchImpl });
    const result = await extractor.extract(IMAGE);
    expect(result.confidence).toBe(0);
    expect(result.brand).toBeNull();
  });

  it('supports the documented image MIME types', () => {
    expect(SUPPORTED_MIME_TYPES).toContain('image/png');
    expect(SUPPORTED_MIME_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_MIME_TYPES).toContain('image/webp');
  });
});
