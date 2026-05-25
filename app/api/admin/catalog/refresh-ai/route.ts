import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Catalog, CatalogStats } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { searchTavily } from '@/lib/tavily';

interface AIModelSuggestion {
  name: string;
  vendor?: string;
  contextWindow?: number;
  pricePerMInputTokens?: number;
  pricePerMOutputTokens?: number;
  deploymentMode?: 'cloud_api' | 'on_premise' | 'hybrid';
  paramCountB?: number;
  rationale?: string;
}

interface GpuSuggestion {
  name: string;
  tdpW?: number;
  vramGb?: number;
  priceEur?: number;
  rationale?: string;
}

interface RefreshResult {
  aiModels: AIModelSuggestion[];
  gpus: GpuSuggestion[];
  globalRationale: string;
}

/**
 * POST /api/admin/catalog/refresh-ai  — admin only.
 *
 * Asks Mistral to propose updated specs/prices for every active catalog entry.
 * The AI sees only the names (so it can't extract any sensitive data) and is
 * asked to return current public-knowledge specs.
 *
 * Updates only fields where the AI returned a value, marks each touched row
 * with `aiUpdatedAt = now` and `aiRationale = ...`. The previous human-entered
 * values stay if the AI omitted a field.
 *
 * Body (optional): { ids?: string[] } — restricts the refresh to a subset.
 */
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbConnect();
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const idFilter = Array.isArray(body.ids) && body.ids.length ? { _id: { $in: body.ids } } : {};
    const items = await Catalog.find({ isActive: true, ...idFilter }).lean();
    if (items.length === 0) {
      return NextResponse.json({ error: 'No active catalog entries to refresh' }, { status: 422 });
    }

    const aiModels = items.filter(i => i.kind === 'ai_model');
    const gpus = items.filter(i => i.kind === 'gpu');

    const today = new Date().toISOString().slice(0, 10);
    const tavilyResults = await searchTavily(
      'latest AI models GPU pricing specs 2026 ' +
      aiModels.map(m => m.name).slice(0, 5).join(' ')
    );

    const prompt = `You MUST search the web RIGHT NOW to get the latest specs and prices
for each item listed below.
Do NOT rely on your training data — it may be outdated.
Use official vendor pages as primary source.
Search first, then return updated data.

You are a market analyst maintaining a catalog of LLMs and AI inference hardware. Today is ${today}. Update the public-knowledge specs and current list prices for each item below.

${tavilyResults ? `## CURRENT MARKET DATA (from web search):
${tavilyResults}

` : ''}DATA SOURCE PRIORITY (read carefully):
- If you have access to web search, USE IT to fetch the latest publicly-available specs and prices from the vendor's official pricing page or product page first. Prefer official vendor sources over third-party aggregators.
- Without web access, use your most recent training-data knowledge and note in the rationale when a value may be stale (e.g. "as of Q3 2024").

CRITICAL RULES:
- Use only widely-published vendor information. If you do not know a value with reasonable confidence, OMIT that field — do not guess. Omitted fields stay at their current value.
- pricePerMInputTokens / pricePerMOutputTokens are in EUR per 1,000,000 tokens. Convert from USD if needed (assume 1 USD ≈ 0.92 EUR unless you have a more current figure).
- contextWindow is in tokens (e.g. 128000 for 128k).
- paramCountB is approximate active-parameter count in billions (e.g. 8 for an 8B model). For closed-source models use the most-credible publicly-stated estimate.
- deploymentMode is one of: cloud_api (vendor-hosted only), on_premise (open-weights, can be self-hosted), hybrid (both available).
- For GPUs: tdpW in watts, vramGb in GB, priceEur is the new-unit list price in EUR.

CURRENT AI MODELS (refresh):
${aiModels.map(m => `- ${m.name} | vendor=${m.vendor ?? '?'} | ctx=${m.contextWindow ?? '?'} | inEUR/M=${m.pricePerMInputTokens ?? '?'} | outEUR/M=${m.pricePerMOutputTokens ?? '?'} | mode=${m.deploymentMode ?? '?'} | params=${m.paramCountB ?? '?'}B`).join('\n') || '(none)'}

CURRENT GPUS (refresh):
${gpus.map(g => `- ${g.name} | TDP=${g.tdpW ?? '?'}W | VRAM=${g.vramGb ?? '?'}GB | priceEUR=${g.priceEur ?? '?'}`).join('\n') || '(none)'}

Return ONLY a JSON object with this exact shape (use the EXACT same name as input so we can match):
{
  "aiModels": [
    { "name": "...", "vendor": "...", "contextWindow": 0, "pricePerMInputTokens": 0, "pricePerMOutputTokens": 0, "deploymentMode": "cloud_api", "paramCountB": 0, "rationale": "1 sentence explaining the source/changes" }
  ],
  "gpus": [
    { "name": "...", "tdpW": 0, "vramGb": 0, "priceEur": 0, "concurrentUsersPerGpu": 0, "rationale": "1 sentence explaining the source/changes" }
  ],
  "globalRationale": "1-2 sentences on overall confidence, market shifts noted, what was omitted."
}

FORMATTING — read carefully:
- All rationale strings MUST be single-line. No literal newlines, tabs or carriage returns inside string values. Use spaces.
- All numeric fields MUST be plain JSON numbers. No "~", "≈", "approx", "about" prefixes. No ranges. No quoted numbers. No "k"/"M"/"B" units (write 128000 not 128k). No underscore separators.
- If you don't know a number with reasonable confidence, OMIT the field — do not guess.`;

    const text = await callMistral(
      [{ role: 'user', content: prompt }],
      { maxTokens: 8000, temperature: 0.2 },
    );
    const parsed = parseLLMJson<RefreshResult>(text);

    const now = new Date();
    let aiModelsUpdated = 0;
    let gpusUpdated = 0;
    const skipped: string[] = [];

    // Update AI models
    for (const sug of parsed.aiModels ?? []) {
      const target = aiModels.find(m => m.name === sug.name);
      if (!target) { skipped.push(`ai_model:${sug.name}`); continue; }
      const update: Record<string, unknown> = { aiUpdatedAt: now, aiRationale: sug.rationale ?? '' };
      const numFields = ['contextWindow', 'pricePerMInputTokens', 'pricePerMOutputTokens', 'paramCountB'] as const;
      for (const f of numFields) {
        const v = (sug as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) update[f] = v;
      }
      if (typeof sug.vendor === 'string' && sug.vendor.trim()) update.vendor = sug.vendor.trim();
      if (sug.deploymentMode && ['cloud_api', 'on_premise', 'hybrid'].includes(sug.deploymentMode)) {
        update.deploymentMode = sug.deploymentMode;
      }
      await Catalog.updateOne({ _id: (target as any)._id }, { $set: update });
      aiModelsUpdated++;
    }

    // Update GPUs
    for (const sug of parsed.gpus ?? []) {
      const target = gpus.find(g => g.name === sug.name);
      if (!target) { skipped.push(`gpu:${sug.name}`); continue; }
      const update: Record<string, unknown> = { aiUpdatedAt: now, aiRationale: sug.rationale ?? '' };
      const numFields = ['tdpW', 'vramGb', 'priceEur', 'concurrentUsersPerGpu'] as const;
      for (const f of numFields) {
        const v = (sug as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) update[f] = v;
      }
      await Catalog.updateOne({ _id: (target as any)._id }, { $set: update });
      gpusUpdated++;
    }

    const updatedCount = aiModelsUpdated + gpusUpdated;

    // Save refresh stats for display on admin page
    await CatalogStats.findOneAndUpdate(
      { type: 'refresh' },
      {
        type: 'refresh',
        executedAt: new Date(),
        webSearchOk: tavilyResults.length > 0,
        aiModelsCreated: 0,
        aiModelsUpdated: aiModelsUpdated,
        gpusCreated: 0,
        gpusUpdated: gpusUpdated,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      updatedCount,
      skipped,
      globalRationale: parsed.globalRationale ?? '',
    });
  } catch (err) {
    console.error('[API] catalog refresh-ai', err);
    const message = err instanceof Error ? err.message : 'Refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
