// ── SHARED MISTRAL LLM HELPER ────────────────────────────────────────────────

const MISTRAL_ENDPOINT =
  'https://api.2a91ec1812a1.dc.mistral.ai/v1/chat/completions';
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
  options: LLMOptions = {},
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
  let cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Fix literal newlines, tabs, and carriage returns inside JSON string values
  // We need to escape them properly for JSON.parse to work
  let fixed = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escaped) {
      fixed += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      fixed += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      fixed += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      // Inside a string, escape special characters
      if (char === '\n') {
        fixed += '\\n';
      } else if (char === '\r') {
        fixed += '\\r';
      } else if (char === '\t') {
        fixed += '\\t';
      } else {
        fixed += char;
      }
    } else {
      fixed += char;
    }
  }

  return JSON.parse(fixed) as T;
}
