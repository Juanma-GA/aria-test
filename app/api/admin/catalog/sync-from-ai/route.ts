import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Catalog } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';

interface AIModelEntry {
  name: string;
  vendor: string;
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
  concurrentUsersPerGpu?: number;
  notes?: string;
}

interface SyncResult {
  aiModels: AIModelEntry[];
  gpus: GpuEntry[];
  exclusionRationale: string;
  globalRationale: string;
}

/**
 * Normalise a name for case-insensitive matching against catalog rows.
 * Catalog uniqueness is `(kind, name)` exact-match — but the AI may emit
 * "Mistral Large" vs "mistral-large-latest" between calls, so we collapse
 * common separators when looking for an existing row.
 */
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[\s_./-]+/g, '').trim();
}

/**
 * POST /api/admin/catalog/sync-from-ai  — admin only.
 *
 * Asks Mistral to return the canonical *current* market list of LLMs and
 * inference GPUs (residual / deprecated entries explicitly excluded), then:
 *   - Upserts each entry by (kind, normalised name): existing rows updated
 *     in place, missing rows created.
 *   - Optionally archives existing active rows the AI did NOT return
 *     (controlled by `?archiveResiduals=true`). Snapshots in industrializations
 *     are unaffected — archiving only hides from new dropdowns.
 *
 * Body (optional): {} — no required fields. Idempotent.
 */
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const archiveResiduals = searchParams.get('archiveResiduals') === 'true';

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `You are a market analyst maintaining the canonical catalog of currently-relevant AI models and inference hardware for an enterprise consultancy. Today is ${today}. Return the COMPLETE current market list as of today, EXCLUDING residual / deprecated / niche entries.

DATA SOURCE PRIORITY (read carefully):
- If you have access to web search, USE IT to fetch the latest publicly-available specs and prices from vendor pages (mistral.ai/pricing, openai.com/api/pricing, anthropic.com/api, ai.google.dev/pricing, deepseek.com, qwen pricing, xai.com, nvidia.com, amd.com, intel.com), tech news, or pricing aggregators. Prefer the official vendor page when available.
- Without web access, use your most recent training-data knowledge and explicitly note in the rationale fields when a value may be stale (e.g. "list price as of Q3 2024, may have changed").

INCLUDE for AI models:
- Production frontier and mid-tier models from major vendors with active commercial availability as of your knowledge cutoff: Mistral, OpenAI, Anthropic, Google (Gemini), Meta (Llama 3.x and later), DeepSeek, Qwen, Cohere, xAI, Microsoft (Phi).
- Both closed-source (cloud_api) and open-weights (on_premise / hybrid) entries.
- For each vendor, include the headline production tiers (e.g. for OpenAI: gpt-4o, gpt-4o-mini, o1, o3 — but not legacy gpt-3.5).
- 15–25 entries total — be comprehensive across vendors but quality over quantity.

EXCLUDE for AI models:
- Deprecated, retired, or end-of-life models (e.g. GPT-3, gpt-3.5-turbo legacy, Claude 1/2, original Llama 1/2, PaLM, code-davinci).
- Research-only / non-production checkpoints.
- Internal-only or paper-only models without public availability.
- Per-vendor variants beyond the ~3 most relevant (no exhaustive listing of every fine-tune).

INCLUDE for GPUs (inference hardware suitable for LLM workloads):
- NVIDIA: current data-center (H100, H200, B100/B200 if released, A100 still relevant for cost-tier), top consumer/pro (RTX 4090, RTX 6000 Ada, L40S, L4).
- AMD Instinct: MI300X, MI325X if available.
- Intel Gaudi: Gaudi 2, Gaudi 3 if available.
- 8–15 entries — current generation only.

EXCLUDE for GPUs:
- K80, P100, V100, T4 first-gen and similar legacy datacenter GPUs.
- Pre-RTX consumer cards.
- Anything end-of-sale.

For each AI model provide:
- name: the canonical API/model id when available (e.g. "mistral-large-latest", "gpt-4o", "claude-sonnet-4.5"), otherwise the marketing name.
- vendor: short vendor name (e.g. "Mistral", "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Qwen").
- contextWindow: tokens (e.g. 128000).
- pricePerMInputTokens / pricePerMOutputTokens: EUR per 1,000,000 tokens. For open-weights with no API price, use the cheapest representative hosted price; if truly N/A, omit.
- deploymentMode: cloud_api (vendor-hosted only), on_premise (open-weights, can be self-hosted), hybrid (both available).
- paramCountB: approximate active-parameter count in billions. Use the publicly stated estimate for closed models.
- notes: optional 1-line caveat (e.g. "preview", "vision-capable", "thinking model").

For each GPU provide:
- name: vendor + model (e.g. "NVIDIA H100 80GB", "AMD MI300X").
- tdpW: rated TDP in watts.
- vramGb: HBM/VRAM in GB.
- priceEur: representative new-unit list price in EUR (use most recent figure you have).
- concurrentUsersPerGpu: estimated number of concurrent inference users this GPU can serve for a typical LLM workload (7B-13B parameter model, FP16). Based on VRAM and compute specs.
- notes: optional 1-line caveat (e.g. "datacenter", "workstation").

Return ONLY a JSON object with this exact shape:
{
  "aiModels": [
    { "name": "...", "vendor": "...", "contextWindow": 0, "pricePerMInputTokens": 0, "pricePerMOutputTokens": 0, "deploymentMode": "cloud_api", "paramCountB": 0, "notes": "..." }
  ],
  "gpus": [
    { "name": "...", "tdpW": 0, "vramGb": 0, "priceEur": 0, "notes": "..." }
  ],
  "exclusionRationale": "1 sentence on what was deliberately excluded and why.",
  "globalRationale": "1-2 sentences on overall confidence and any market shifts noted."
}

FORMATTING — read carefully:
- All string values MUST be single-line. Do not use literal newlines, tabs or carriage returns inside any string value. Use spaces instead.
- All numeric fields MUST be plain JSON numbers. Do NOT prefix with "~" / "≈" / "approx" / "about". Do NOT use ranges like "100-200" — pick one value. Do NOT wrap numbers in quotes. Do NOT use units like "k", "M", "B" inside the value (write 128000, not 128k; write 70 for paramCountB, not "70B"). Do NOT use underscore separators (write 1000000, not 1_000_000).
- If you don't know a number with reasonable confidence, OMIT the field. Do not invent a value just to fill the slot.`;

    const text = await callMistral(
      [{ role: 'user', content: prompt }],
      { maxTokens: 4500, temperature: 0.2, webSearch: true },
    );
    const parsed = parseLLMJson<SyncResult>(text);

    const now = new Date();
    const summary = {
      aiModels: { created: 0, updated: 0, skipped: [] as string[] },
      gpus:     { created: 0, updated: 0, skipped: [] as string[] },
      archived: { aiModels: [] as string[], gpus: [] as string[] },
      exclusionRationale: parsed.exclusionRationale ?? '',
      globalRationale:    parsed.globalRationale ?? '',
    };

    // Pull all existing entries once to avoid N round-trips for upsert lookups.
    const existing = await Catalog.find({}).lean();
    const existingByKindAndNorm = new Map<string, any>();
    for (const e of existing) {
      existingByKindAndNorm.set(`${e.kind}::${normaliseName(e.name)}`, e);
    }

    // Track which existing rows the AI returned, so we can flag the residuals.
    const seen = new Set<string>();

    // ── AI models ────────────────────────────────────────────────────────────
    for (const m of parsed.aiModels ?? []) {
      if (!m.name?.trim() || !m.vendor?.trim()) {
        summary.aiModels.skipped.push(`(missing name/vendor): ${JSON.stringify(m).slice(0, 60)}`);
        continue;
      }
      const key = `ai_model::${normaliseName(m.name)}`;
      seen.add(key);
      const fields: Record<string, unknown> = {
        name: m.name.trim(),
        vendor: m.vendor.trim(),
        aiUpdatedAt: now,
        aiRationale: m.notes ?? '',
        isActive: true,
      };
      const numFields = ['contextWindow', 'pricePerMInputTokens', 'pricePerMOutputTokens', 'paramCountB'] as const;
      for (const f of numFields) {
        const v = (m as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields[f] = v;
      }
      if (m.deploymentMode && ['cloud_api', 'on_premise', 'hybrid'].includes(m.deploymentMode)) {
        fields.deploymentMode = m.deploymentMode;
      }

      const prior = existingByKindAndNorm.get(key);
      if (prior) {
        await Catalog.updateOne({ _id: prior._id }, { $set: fields });
        summary.aiModels.updated++;
      } else {
        await Catalog.create({ kind: 'ai_model', ...fields });
        summary.aiModels.created++;
      }
    }

    // ── GPUs ─────────────────────────────────────────────────────────────────
    for (const g of parsed.gpus ?? []) {
      if (!g.name?.trim()) {
        summary.gpus.skipped.push(`(missing name): ${JSON.stringify(g).slice(0, 60)}`);
        continue;
      }
      const key = `gpu::${normaliseName(g.name)}`;
      seen.add(key);
      const fields: Record<string, unknown> = {
        name: g.name.trim(),
        aiUpdatedAt: now,
        aiRationale: g.notes ?? '',
        isActive: true,
      };
      const numFields = ['tdpW', 'vramGb', 'priceEur', 'concurrentUsersPerGpu'] as const;
      for (const f of numFields) {
        const v = (g as any)[f];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields[f] = v;
      }

      const prior = existingByKindAndNorm.get(key);
      if (prior) {
        await Catalog.updateOne({ _id: prior._id }, { $set: fields });
        summary.gpus.updated++;
      } else {
        await Catalog.create({ kind: 'gpu', ...fields });
        summary.gpus.created++;
      }
    }

    // ── Optional residual archiving ──────────────────────────────────────────
    // An "active row the AI didn't return" is treated as residual. We never
    // hard-delete (snapshots in industrializations rely on the row existing).
    if (archiveResiduals) {
      for (const e of existing) {
        if (!e.isActive) continue;
        const key = `${e.kind}::${normaliseName(e.name)}`;
        if (seen.has(key)) continue;
        await Catalog.updateOne(
          { _id: e._id },
          { $set: { isActive: false, aiRationale: 'Archived as residual by AI sync.' } },
        );
        if (e.kind === 'ai_model') summary.archived.aiModels.push(e.name);
        else summary.archived.gpus.push(e.name);
      }
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[API] catalog sync-from-ai', err);
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
