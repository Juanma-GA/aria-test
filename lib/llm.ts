// ── SHARED MISTRAL LLM HELPER ────────────────────────────────────────────────

const MISTRAL_ENDPOINT = 'https://api.2a91ec1812a1.dc.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-medium-latest';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callMistral(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY no configurada en .env.local');

  const res = await fetch(MISTRAL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mistral API error: ${errText}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '') as string;
}

/**
 * Parse JSON from LLM response, stripping markdown code fences if present.
 */
export function parseLLMJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}
