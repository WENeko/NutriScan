export const GEMINI_OUTPUT_TOKENS = 8192;
export const GEMINI_RETRY_OUTPUT_TOKENS = 16384;

/** Never treat a cut-off answer as a complete meal or invent its missing tail. */
export function readGeminiContent(data: {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}): { content: string; truncated: boolean } {
  const candidate = data.candidates?.[0];
  const content = candidate?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('') ?? '';
  return { content, truncated: candidate?.finishReason === 'MAX_TOKENS' };
}

export function parseMealJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Parse the entire response: extracting through the last brace can silently
  // discard a truncated second ingredient and accept an incomplete meal.
  return JSON.parse(trimmed);
}