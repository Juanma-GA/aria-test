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
  /**
   * Enable Mistral's built-in `web_search` connector. When supported by the
   * deployment the model can issue live searches before answering — useful for
   * "fetch current market data" use cases (catalog refresh / sync).
   * If the deployment doesn't accept the connectors field, we transparently
   * retry without it so the call doesn't fail on older endpoints.
   */
  webSearch?: boolean;
}

export async function callMistral(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY no configurada en .env.local');

  const baseBody: Record<string, unknown> = {
    model: options.model ?? DEFAULT_MODEL,
    messages,
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.3,
  };

  // First attempt: with the web_search connector if requested.
  if (options.webSearch) {
    const withTools = {
      ...baseBody,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
    };
    const res = await fetch(MISTRAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(withTools),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.choices?.[0]?.message?.content ?? '') as string;
    }
    // 4xx with the tool present usually means the deployment doesn't support
    // connectors. Log and fall through to the plain call so the feature
    // degrades gracefully instead of hard-failing.
    if (res.status >= 400 && res.status < 500) {
      const errText = await res.text();
      console.warn('[LLM] web_search tool rejected, falling back to plain call:', errText.slice(0, 200));
    } else {
      const errText = await res.text();
      throw new Error(`Mistral API error: ${errText}`);
    }
  }

  // Plain call (no tools).
  const res = await fetch(MISTRAL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(baseBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mistral API error: ${errText}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '') as string;
}

/**
 * Parse JSON from an LLM response. Tolerates the most common LLM-induced
 * malformations:
 *  - Surrounding markdown code fences (``` or ```json …```)
 *  - Leading/trailing prose ("Here is the JSON: { … } Hope this helps!")
 *  - Literal newlines / tabs inside string values
 *  - "Approximately" prefixes on numbers (`~1200`, `≈ 1.5`, `~=42`)
 *  - Trailing commas (`{ "a": 1, }`)
 *  - JS-style numeric separators (`1_000` → `1000`)
 *  - Single-line `// ...` and block `/* ... *​/` comments
 *  - Smart-quote string delimiters (`“…”` → `"…"`)
 *
 * Tries each repair pass in turn; throws with the LAST parse error and the
 * first 200 chars of the original response if every pass fails.
 */
export function parseLLMJson<T>(text: string): T {
  const stripped = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
    .replace(/\s*```[\s\S]*$/, '')
    .trim();

  // If response starts with '[', parse array directly
  if (stripped.startsWith('[')) {
    try {
      return JSON.parse(stripped) as T;
    } catch {}
  }

  const candidates = [
    stripped.length ? stripped : null,
    extractBalancedJson(text),
  ].filter(Boolean) as string[];

  // Each repair is additive. If a repair converts the candidate into valid JSON
  // we return immediately; otherwise we layer on the next repair and retry.
  const repairs: Array<(s: string) => string> = [
    (s) => s,                              // raw
    repairCommonJsonIssues,                // structural cleanup
    escapeControlCharsInStrings,           // unescaped newlines
    (s) => escapeControlCharsInStrings(repairCommonJsonIssues(s)), // both
  ];

  let lastError: unknown;
  for (const cand of candidates) {
    for (const repair of repairs) {
      try {
        return JSON.parse(repair(cand)) as T;
      } catch (err) {
        lastError = err;
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'unknown parse error';
  throw new Error(`LLM response is not valid JSON (${detail}). First 200 chars: ${text.slice(0, 200)}`);
}

/**
 * Best-effort repair of common LLM-induced JSON sins. Operates outside string
 * literals only — string contents are left untouched so we don't corrupt
 * legitimate `~` or `,` inside text values.
 */
function repairCommonJsonIssues(s: string): string {
  // 1. Smart quotes around string delimiters → straight quotes.
  //    Mistral / GPT sometimes emit “key”: “value”.
  let out = s
    .replace(/[“”]/g, '"')   // “ ”
    .replace(/[‘’]/g, "'");  // ‘ ’ (we don't convert to " — could be apostrophe inside a string)

  // 2. Strip line + block comments OUTSIDE string literals.
  out = stripCommentsOutsideStrings(out);

  // 3. Walk the JSON, applying number-only repairs outside strings.
  //    - "~1200" / "≈1200" / "~=1200" → 1200
  //    - "1_000" / "1_000_000" → 1000 / 1000000
  //    - "1.2k" / "5M" → leave alone (caller should reject ambiguous units)
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (escape) { result += c; escape = false; continue; }
    if (c === '\\') { result += c; escape = true; continue; }
    if (c === '"')  { inString = !inString; result += c; continue; }
    if (inString) { result += c; continue; }

    // Outside strings: strip approximation prefixes when followed by a digit / decimal.
    if ((c === '~' || c === '≈') && /[\s]*[-+0-9.]/.test(out.slice(i + 1, i + 5))) {
      // Skip the prefix and any following spaces; also skip "~=" form.
      let j = i + 1;
      if (out[j] === '=') j++;
      while (j < out.length && out[j] === ' ') j++;
      i = j - 1;
      continue;
    }
    result += c;
  }

  // 4. Strip JS-style underscore separators inside numbers (1_000 → 1000),
  //    again only outside strings. Cheap regex pass on the partially repaired
  //    string — strings are already balanced, the regex matches digits + `_`
  //    + digits which is unlikely to appear meaningfully in prose strings.
  result = result.replace(/(\d)_(?=\d)/g, '$1');

  // 5. Remove trailing commas before } or ].
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return result;
}

function stripCommentsOutsideStrings(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { out += c; escape = false; continue; }
    if (c === '\\') { out += c; escape = true; continue; }
    if (c === '"')  { inString = !inString; out += c; continue; }
    if (inString) { out += c; continue; }
    // Block comment
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    // Line comment
    if (c === '/' && s[i + 1] === '/') {
      const end = s.indexOf('\n', i + 2);
      if (end === -1) return out;
      i = end - 1;
      continue;
    }
    out += c;
  }
  return out;
}

function extractBalancedJson(text: string): string | null {
  // Find the outermost opening bracket: look for '[' first (arrays), then '{'
  let startIndex = -1;
  let outerBracket: '[' | '{' | null = null;

  // Search for '[' first (prioritize arrays)
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') {
      startIndex = i;
      outerBracket = '[';
      break;
    }
  }

  // If no '[' found, search for '{'
  if (startIndex === -1) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        startIndex = i;
        outerBracket = '{';
        break;
      }
    }
  }

  if (startIndex === -1 || !outerBracket) return null;

  const close = outerBracket === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let j = startIndex; j < text.length; j++) {
    const c = text[j];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === outerBracket) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(startIndex, j + 1);
    }
  }

  return null;
}

/**
 * Walk the JSON text tracking string boundaries, and replace literal control characters
 * (newline / CR / tab / backspace / form feed / other ASCII < 0x20) that appear *inside
 * a string literal* with their escape sequences. Outside string literals (and inside an
 * already-escaped sequence) we leave the text untouched.
 */
function escapeControlCharsInStrings(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { out += c; escape = false; continue; }
    if (c === '\\') { out += c; escape = true; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString && c.charCodeAt(0) < 0x20) {
      if (c === '\n')      out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (c === '\b') out += '\\b';
      else if (c === '\f') out += '\\f';
      else                 out += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
      continue;
    }
    out += c;
  }
  return out;
}
