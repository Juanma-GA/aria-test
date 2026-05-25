import { NextRequest, NextResponse } from 'next/server';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { searchTavily } from '@/lib/tavily';

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

    const searchQuery =
      kind === 'ai_model'
        ? `${query} AI model pricing specs API`
        : `${query} GPU specs price VRAM`;
    const webResults = await searchTavily(searchQuery);

    const prompt =
      kind === 'ai_model'
        ? webResults
          ? `You MUST search the web RIGHT NOW to get the latest specs and pricing for: "${query}".
Do NOT rely on your training data — it may be outdated.
Use official vendor pages as primary source (mistral.ai/pricing,
openai.com/api/pricing, anthropic.com/api, ai.google.dev/pricing,
deepseek.com, xai.com).
Search first, then return the data in this format:

## WEB SEARCH RESULTS (use these as primary source):
${webResults}

## YOUR TASK:
Based on the web search results above, extract and structure the data.
If the results don't have a specific field, use your training knowledge to fill it.
Prefer web results over training data for prices and recent specs.

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
          : `You are a market analyst. Return the specs for: "${query}"
Use your training knowledge.

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
        : webResults
          ? `You MUST search the web RIGHT NOW to get the latest specs and pricing for: "${query}".
Do NOT rely on your training data — it may be outdated.
Use official vendor pages as primary source (nvidia.com, amd.com, intel.com).
Search first, then return the data in this format:

## WEB SEARCH RESULTS (use these as primary source):
${webResults}

## YOUR TASK:
Based on the web search results above, extract and structure the data.
If the results don't have a specific field, use your training knowledge to fill it.
Prefer web results over training data for prices and recent specs.

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
- If you don't know a field with confidence, omit it`
          : `You are a market analyst. Return the specs for: "${query}"
Use your training knowledge.

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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
