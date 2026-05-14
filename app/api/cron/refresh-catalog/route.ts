import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Catalog } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';

/**
 * Scheduled catalog refresh — designed to be hit by a cron / scheduler that
 * cannot present an admin session cookie.
 *
 * Auth: any of
 *   - Authorization: Bearer <CRON_SECRET>
 *   - X-Cron-Secret: <CRON_SECRET>
 *   - ?secret=<CRON_SECRET>  (last-resort, prefer headers)
 *
 * If `CRON_SECRET` is not set in the environment, the endpoint returns 503 —
 * the operator must explicitly enable scheduled access.
 *
 * Modes (?mode=…):
 *   - refresh (default) → only updates rows that already exist
 *   - sync              → also creates missing entries from the AI's market list
 *   - sync-archive      → sync + archive any active row the AI didn't return
 *
 * Vercel Cron compatibility: Vercel sends `Authorization: Bearer ${CRON_SECRET}`
 * on every cron call when the env var is named CRON_SECRET, so the endpoint
 * works out of the box with `vercel.json`:
 *
 *   { "crons": [{ "path": "/api/cron/refresh-catalog", "schedule": "0 4 1 * *" }] }
 */

interface AIModelEntry {
  name: string;
  vendor?: string;
  contextWindow?: number;
  pricePerMInputTokens?: number;
  pricePerMOutputTokens?: number;
  deploymentMode?: 'cloud_api' | 'on_premise' | 'hybrid';
  paramCountB?: number;
  notes?: string;
}
interface GpuEntry {
  name: string;
  tdpW?: number;
  vramGb?: number;
  priceEur?: number;
  notes?: string;
}
interface SyncResult {
  aiModels: AIModelEntry[];
  gpus: GpuEntry[];
  globalRationale?: string;
  exclusionRationale?: string;
}

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[\s_./-]+/g, '').trim();
}

function checkAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: 'CRON_SECRET not configured' };
  const authHeader = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  const querySecret = new URL(req.url).searchParams.get('secret');
  const presented =
    (authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null) ??
    headerSecret ??
    querySecret ??
    null;
  if (!presented || presented !== secret) return { ok: false, reason: 'invalid secret' };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  return runRefresh(req);
}

// Vercel Cron uses GET; some external schedulers default to GET too.
export async function GET(req: NextRequest) {
  return runRefresh(req);
}

async function runRefresh(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    const status = auth.reason === 'CRON_SECRET not configured' ? 503 : 401;
    return NextResponse.json({ error: auth.reason }, { status });
  }

  try {
    await dbConnect();
    const url = new URL(req.url);
    const mode = (url.searchParams.get('mode') ?? 'refresh') as 'refresh' | 'sync' | 'sync-archive';

    const allActive = await Catalog.find({ isActive: true }).lean();
    const aiModels = allActive.filter(i => i.kind === 'ai_model');
    const gpus = allActive.filter(i => i.kind === 'gpu');

    if (mode === 'refresh' && allActive.length === 0) {
      return NextResponse.json({ error: 'No active entries to refresh', mode }, { status: 422 });
    }

    const prompt = mode === 'refresh'
      ? buildRefreshPrompt(aiModels, gpus)
      : buildSyncPrompt();

    const text = await callMistral(
      [{ role: 'user', content: prompt }],
      { maxTokens: mode === 'refresh' ? 2000 : 4500, temperature: 0.2, webSearch: true },
    );
    const parsed = parseLLMJson<SyncResult>(text);

    const now = new Date();
    const summary = {
      mode,
      aiModels: { created: 0, updated: 0 },
      gpus:     { created: 0, updated: 0 },
      archived: { aiModels: [] as string[], gpus: [] as string[] },
      globalRationale: parsed.globalRationale ?? '',
      exclusionRationale: parsed.exclusionRationale ?? '',
    };

    const existingByKey = new Map<string, any>();
    for (const e of allActive) existingByKey.set(`${e.kind}::${normaliseName(e.name)}`, e);
    const seen = new Set<string>();

    for (const m of parsed.aiModels ?? []) {
      if (!m.name?.trim()) continue;
      const key = `ai_model::${normaliseName(m.name)}`;
      seen.add(key);
      const fields: Record<string, unknown> = { aiUpdatedAt: now, aiRationale: m.notes ?? '' };
      const numFields = ['contextWindow', 'pricePerMInputTokens', 'pricePerMOutputTokens', 'paramCountB'] as const;
      for (const f of numFields) {
        const v = (m as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields[f] = v;
      }
      if (typeof m.vendor === 'string' && m.vendor.trim()) fields.vendor = m.vendor.trim();
      if (m.deploymentMode && ['cloud_api', 'on_premise', 'hybrid'].includes(m.deploymentMode)) {
        fields.deploymentMode = m.deploymentMode;
      }
      const prior = existingByKey.get(key);
      if (prior) {
        await Catalog.updateOne({ _id: prior._id }, { $set: fields });
        summary.aiModels.updated++;
      } else if (mode !== 'refresh') {
        await Catalog.create({ kind: 'ai_model', name: m.name.trim(), isActive: true, ...fields });
        summary.aiModels.created++;
      }
    }

    for (const g of parsed.gpus ?? []) {
      if (!g.name?.trim()) continue;
      const key = `gpu::${normaliseName(g.name)}`;
      seen.add(key);
      const fields: Record<string, unknown> = { aiUpdatedAt: now, aiRationale: g.notes ?? '' };
      const numFields = ['tdpW', 'vramGb', 'priceEur'] as const;
      for (const f of numFields) {
        const v = (g as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields[f] = v;
      }
      const prior = existingByKey.get(key);
      if (prior) {
        await Catalog.updateOne({ _id: prior._id }, { $set: fields });
        summary.gpus.updated++;
      } else if (mode !== 'refresh') {
        await Catalog.create({ kind: 'gpu', name: g.name.trim(), isActive: true, ...fields });
        summary.gpus.created++;
      }
    }

    if (mode === 'sync-archive') {
      for (const e of allActive) {
        const key = `${e.kind}::${normaliseName(e.name)}`;
        if (seen.has(key)) continue;
        await Catalog.updateOne(
          { _id: e._id },
          { $set: { isActive: false, aiRationale: 'Archived as residual by scheduled sync.' } },
        );
        if (e.kind === 'ai_model') summary.archived.aiModels.push(e.name);
        else summary.archived.gpus.push(e.name);
      }
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[CRON] refresh-catalog', err);
    const message = err instanceof Error ? err.message : 'Refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildRefreshPrompt(aiModels: any[], gpus: any[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are a market analyst maintaining a catalog of LLMs and AI inference hardware. Today is ${today}. Update the public-knowledge specs and current list prices for each item below.

DATA SOURCE PRIORITY:
- If web search is available, USE IT to fetch the latest specs and prices from official vendor pricing pages first.
- Without web access, use your most recent training-data knowledge and note in the rationale when a value may be stale.

CRITICAL RULES:
- Use only widely-published vendor information. If you do not know a value with reasonable confidence, OMIT that field — do not guess. Omitted fields stay at their current value.
- pricePerMInputTokens / pricePerMOutputTokens are in EUR per 1,000,000 tokens. Convert from USD if needed (assume 1 USD ≈ 0.92 EUR unless you have a more current figure).
- contextWindow is in tokens (e.g. 128000 for 128k).
- paramCountB is approximate active-parameter count in billions.
- deploymentMode is one of: cloud_api, on_premise, hybrid.
- For GPUs: tdpW in watts, vramGb in GB, priceEur is the new-unit list price in EUR.

CURRENT AI MODELS (refresh):
${aiModels.map(m => `- ${m.name} | vendor=${m.vendor ?? '?'} | ctx=${m.contextWindow ?? '?'} | inEUR/M=${m.pricePerMInputTokens ?? '?'} | outEUR/M=${m.pricePerMOutputTokens ?? '?'} | mode=${m.deploymentMode ?? '?'} | params=${m.paramCountB ?? '?'}B`).join('\n') || '(none)'}

CURRENT GPUS (refresh):
${gpus.map(g => `- ${g.name} | TDP=${g.tdpW ?? '?'}W | VRAM=${g.vramGb ?? '?'}GB | priceEUR=${g.priceEur ?? '?'}`).join('\n') || '(none)'}

Return ONLY a JSON object with this exact shape (use the EXACT same name as input):
{
  "aiModels": [
    { "name": "...", "vendor": "...", "contextWindow": 0, "pricePerMInputTokens": 0, "pricePerMOutputTokens": 0, "deploymentMode": "cloud_api", "paramCountB": 0, "notes": "1 sentence" }
  ],
  "gpus": [
    { "name": "...", "tdpW": 0, "vramGb": 0, "priceEur": 0, "notes": "1 sentence" }
  ],
  "globalRationale": "1-2 sentences"
}

FORMATTING — read carefully:
- All string values MUST be single-line. No literal newlines/tabs/CR.
- All numeric fields MUST be plain JSON numbers. No "~", "≈", "approx" prefixes. No ranges. No quoted numbers. No "k"/"M"/"B" units. No underscore separators.
- If you don't know a number with reasonable confidence, OMIT the field.`;
}

function buildSyncPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are a market analyst maintaining the canonical catalog of currently-relevant AI models and inference hardware. Today is ${today}. Return the COMPLETE current market list as of today, EXCLUDING residual / deprecated / niche entries.

DATA SOURCE PRIORITY:
- If web search is available, USE IT to fetch the latest specs and prices from official vendor pricing pages first.
- Without web access, use your most recent training-data knowledge and note in the rationale when a value may be stale.

INCLUDE for AI models: production frontier and mid-tier models from Mistral, OpenAI, Anthropic, Google, Meta (Llama 3.x+), DeepSeek, Qwen, Cohere, xAI, Microsoft (Phi). Both closed-source and open-weights. 15–25 entries.
EXCLUDE: deprecated/retired/EOL models, research-only checkpoints, exhaustive per-vendor variants.

INCLUDE for GPUs: current NVIDIA datacenter (H100/H200/B100/A100), top consumer/pro (RTX 4090, RTX 6000 Ada, L40S, L4); AMD MI300X/MI325X; Intel Gaudi 2/3. 8–15 entries.
EXCLUDE: K80/P100/V100/T4 first-gen, pre-RTX consumer, end-of-sale.

Return ONLY a JSON object with this exact shape:
{
  "aiModels": [{ "name": "...", "vendor": "...", "contextWindow": 0, "pricePerMInputTokens": 0, "pricePerMOutputTokens": 0, "deploymentMode": "cloud_api", "paramCountB": 0, "notes": "..." }],
  "gpus":     [{ "name": "...", "tdpW": 0, "vramGb": 0, "priceEur": 0, "notes": "..." }],
  "exclusionRationale": "1 sentence",
  "globalRationale":    "1-2 sentences"
}

FORMATTING — read carefully:
- All string values MUST be single-line. No literal newlines/tabs/CR.
- All numeric fields MUST be plain JSON numbers. No "~", "≈", "approx" prefixes. No ranges. No quoted numbers. No "k"/"M"/"B" units. No underscore separators.
- If you don't know a number with reasonable confidence, OMIT the field.`;
}
