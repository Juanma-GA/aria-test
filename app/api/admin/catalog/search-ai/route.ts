import { NextRequest, NextResponse } from 'next/server';
import { parseLLMJson } from '@/lib/llm';

const MISTRAL_ENDPOINT = 'https://api.2a91ec1812a1.dc.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-medium-latest';

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

/**
 * POST /api/admin/catalog/search-ai — search for a model/GPU specs via AI
 */
export async function POST(req: NextRequest) {
  try {
    const body: SearchRequest = await req.json();
    const { query, kind } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

    const prompt =
      kind === 'ai_model'
        ? `Search the web for the latest specs and pricing for: "${query}"
Use official vendor pages as primary source (e.g. mistral.ai/pricing, openai.com/api/pricing, anthropic.com/api).
You are a market analyst. Return the specs in this format:

Return ONLY valid JSON with these fields (omit if unknown):
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
        : `Search the web for the latest specs and pricing for: "${query}"
Use official vendor pages as primary source (e.g. nvidia.com, amd.com, intel.com).
You are a market analyst. Return the specs in this format:

Return ONLY valid JSON with these fields (omit if unknown):
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

    let text = '';
    let searchedWeb = false;
    let forcedSuccess = false;

    // TEST: Try forced tool_choice first
    const forcedRes = await fetch(MISTRAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.1,
        tools: [{ type: 'web_search' }],
        tool_choice: { type: 'tool', name: 'web_search' },
      }),
    });

    if (forcedRes.ok) {
      const data = await forcedRes.json();
      text = (data.choices?.[0]?.message?.content ?? '') as string;
      searchedWeb = true;
      forcedSuccess = true;
      console.log('[SEARCH-AI] web search mode: forced (supported)');
    } else if (forcedRes.status >= 400 && forcedRes.status < 500) {
      // Forced not supported, fall back to auto
      console.log('[SEARCH-AI] forced tool_choice got 4xx, trying auto mode...');
      const autoRes = await fetch(MISTRAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.1,
          tools: [{ type: 'web_search' }],
          tool_choice: 'auto',
        }),
      });

      if (!autoRes.ok) {
        const errText = await autoRes.text();
        throw new Error(`Mistral API error (auto fallback): ${errText}`);
      }

      const data = await autoRes.json();
      text = (data.choices?.[0]?.message?.content ?? '') as string;
      searchedWeb = true;
      forcedSuccess = false;
      console.log('[SEARCH-AI] web search mode: auto (fallback)');
    } else {
      const errText = await forcedRes.text();
      throw new Error(`Mistral API error (forced): ${errText}`);
    }

    const result = parseLLMJson<SearchResult>(text);

    return NextResponse.json({ ...result, searchedWeb });
  } catch (err) {
    console.error('[API] catalog search-ai', err);
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
