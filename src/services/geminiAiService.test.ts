import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeMealWithGemini } from './geminiAiService';
import type { ActiveProviderConfig } from '@/lib/aiAccess';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('./appLogger', () => ({ appLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/localAiBridge', () => ({ runLocalIntentChat: vi.fn() }));

const provider: ActiveProviderConfig = {
  providerId: 'test-google', name: 'Test Gemini', apiType: 'gemini',
  baseUrl: 'https://example.invalid', modelsEndpoint: '', model: 'test-model', apiKey: 'test-placeholder',
};
const response = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
}), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('Gemini analysis request flow', () => {
  it('retries a truncated response once with 16384 tokens and returns the complete meal', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('{"items":[', 'MAX_TOKENS'))
      .mockResolvedValueOnce(response('{"items":[{"calories":593}]}'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await analyzeMealWithGemini({ text: 'repas test', providerOverride: provider });
    expect(result).toEqual({ items: [{ calories: 593 }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const configs = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).generationConfig);
    expect(configs).toEqual([
      { maxOutputTokens: 8192, responseMimeType: 'application/json' },
      { maxOutputTokens: 16384, responseMimeType: 'application/json' },
    ]);
  });
  it('rejects a second truncation instead of looping or saving incomplete nutrition', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response('{"items":[]}', 'MAX_TOKENS')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(analyzeMealWithGemini({ text: 'repas test', providerOverride: provider })).rejects.toThrow('MAX_TOKENS');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed JSON so the routing engine can try its next provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"items":[{"calories":593},{"calories":')));
    await expect(analyzeMealWithGemini({ text: 'repas test', providerOverride: provider })).rejects.toThrow('JSON invalide');
  });
  it('rejects an empty or safety-blocked response rather than returning an empty object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }))));
    await expect(analyzeMealWithGemini({ text: 'repas test', providerOverride: provider })).rejects.toThrow('aucun contenu');
  });
});