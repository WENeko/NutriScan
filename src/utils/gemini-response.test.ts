import { describe, expect, it } from 'vitest';
import { readGeminiContent, parseMealJson, GEMINI_OUTPUT_TOKENS, GEMINI_RETRY_OUTPUT_TOKENS } from './gemini-response';

describe('Gemini meal responses', () => {
  it('requests 8192 output tokens initially and 16384 on truncation', () => {
    expect(GEMINI_OUTPUT_TOKENS).toBe(8192);
    expect(GEMINI_RETRY_OUTPUT_TOKENS).toBe(16384);
  });
  it('identifies the provider truncation signal even if JSON happens to be valid', () => {
    expect(readGeminiContent({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"items":[]}' }] } }] }).truncated).toBe(true);
  });
  it('joins response parts without including internal reasoning', () => {
    const response = readGeminiContent({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'reasoning', thought: true }, { text: '{"items":' }, { text: '[]}' },
    ] } }] });
    expect(response).toEqual({ content: '{"items":[]}', truncated: false });
  });
  it('accepts fenced complete JSON and preserves missing nutrients', () => {
    expect(parseMealJson('```json\n{"items":[{"calories":593}]}\n```')).toEqual({ items: [{ calories: 593 }] });
  });
  it('does not discard an unfinished second food or repair unfinished numbers', () => {
    expect(() => parseMealJson('{"items":[{"calories":593},{"vitamin_d_mcg":0.5')).toThrow();
  });
});