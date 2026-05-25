import { NextRequest, NextResponse } from 'next/server';
import { callMistral, parseLLMJson } from '@/lib/llm';

interface SearchRequest {
  query: string;
  kind: 'ai_model' | 'gpu';
}

interface SearchResult {
  name?: string;
  vendor?: string;
  contextWindow?: number;
  pricePerMInputTokens?: number;
  pricePerMOutputTokens?: number;
  deploymentMode?: 'cloud_api' | 'on_premise' | 'hybrid';
  paramCountB?: number;
  tdpW?: number;
  vramGb?: number;
  priceEur?: number;
  concurrentUsersPerGpu?: number;
  notes?: string;
  searchedWeb?: boolean;
}

async function searchDuckDuckGo(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();

    // Extract text snippets from search results
    // DuckDuckGo HTML results have class "result__snippet"
    const snippets: string[] = [];
    const titleRegex = /class="result__title"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g;
    const urlRegex = /class="result__url"[^>]*>\s*([^\s<]+)/g;

    let titleMatch, snippetMatch, urlMatch;
    const titles: string[] = [];
    const urls: string[] = [];

    while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < 5) {
      titles.push(titleMatch[1].replace(/&amp;/g, '&').trim());
    }
    while ((urlMatch = urlRegex.exec(html)) !== null && urls.length < 5) {
      urls.push(urlMatch[1].trim());
    }
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      const text = snippetMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 20) snippets.push(text);
    }

    // Build context string
    const results = titles
      .map((title, i) => `[${i + 1}] ${title}\n${urls[i] ?? ''}\n${snippets[i] ?? ''}`)
      .join('\n\n');

    return results || '';
  } catch {
    return '';
  }
}

/**
 * POST /api/admin/catalog/search-ai — search for a model/GPU specs via AI
 */
export async function POST(req: NextRequest) {
  try {
    const body: SearchRequest = await req.json();
    const { query, kind } = body;

<<<<<<< HEAD
    console.log('[SEARCH-AI] Starting search for:', body.query, body.kind);

=======
>>>>>>> claude/relaxed-johnson-l3I5d
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const searchQuery =
      kind === 'ai_model'
        ? `${query} AI model pricing specs API`
        : `${query} GPU specs price VRAM`;
    const webResults = await searchDuckDuckGo(searchQuery);

<<<<<<< HEAD
    console.log('[SEARCH-AI] DuckDuckGo results length:', webResults.length);
    console.log('[SEARCH-AI] DuckDuckGo first 200 chars:', webResults.slice(0, 200));

=======
>>>>>>> claude/relaxed-johnson-l3I5d
    const prompt =
      kind === 'ai_model'
        ? `You MUST search the web RIGHT NOW to get the latest specs and pricing for: "${query}".
Do NOT rely on your training data — it may be outdated.
Use official vendor pages as primary source (mistral.ai/pricing,
openai.com/api/pricing, anthropic.com/api, ai.google.dev/pricing,
deepseek.com, xai.com).
Search first, then return the data in this format:

${
  webResults
    ? `## WEB SEARCH RESULTS (use these as primary source):
${webResults}

## YOUR TASK:
Based on the web search results above, extract and structure the data.
If the results don't have a specific field, use your training knowledge to fill it.
Prefer web results over training data for prices and recent specs.

`
    : ''
}Return ONLY valid JSON with these fields (omit if unknown):
{ "name": "...", "vendor": "...", "contextWindow": 0, "pricePerMInputTokens": 0, "pricePerMOutputTokens": 0, "deploymentMode": "cloud_api", "paramCountB": 0, "notes": "..." }

Rules:
- name: canonical API/model id or marketing name
- vendor: short vendor name (Mistral, OpenAI, Anthropic, etc.)
- contextWindow: tokens (e.g. 128000)
- pricePerMInputTokens / pricePerMOutputTokens: EUR per 1M tokens
- deploymentMode: cloud_api, on_premise, or hybrid
- paramCountB: approximate billions of parameters
- notes: optional 1-line caveat
- All numeric fields must be plain numbers, no units or ranges
- If you don't know a field with confidence, omit it`
        : `You MUST search the web RIGHT NOW to get the latest specs and pricing for: "${query}".
Do NOT rely on your training data — it may be outdated.
Use official vendor pages as primary source (nvidia.com, amd.com, intel.com).
Search first, then return the data in this format:

${
  webResults
    ? `## WEB SEARCH RESULTS (use these as primary source):
${webResults}

## YOUR TASK:
Based on the web search results above, extract and structure the data.
If the results don't have a specific field, use your training knowledge to fill it.
Prefer web results over training data for prices and recent specs.

`
    : ''
}Return ONLY valid JSON with these fields (omit if unknown):
{ "name": "...", "tdpW": 0, "vramGb": 0, "priceEur": 0, "concurrentUsersPerGpu": 0, "notes": "..." }

Rules:
- name: vendor + model (e.g. "NVIDIA H100 80GB")
- tdpW: rated TDP in watts
- vramGb: VRAM in GB
- priceEur: new-unit list price in EUR (convert from USD if needed)
- concurrentUsersPerGpu: estimated concurrent users for 7B-13B FP16 workload
- notes: optional 1-line caveat
- All numeric fields must be plain numbers, no units or ranges
- If you don't know a field with confidence, omit it`;

    let text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: 500,
      temperature: 0.1,
      webSearch: true,
    });

    let result: SearchResult = {};
    try {
      result = parseLLMJson<SearchResult>(text);
    } catch {
      // If JSON parsing fails, return empty result
      // UI will show "Not found" instead of error
    }
    const searchedWeb = webResults.length > 0;

    return NextResponse.json({ ...result, searchedWeb });
  } catch (err) {
    console.error('[SEARCH-AI] Full error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
