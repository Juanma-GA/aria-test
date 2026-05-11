import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Catalog } from '@/lib/models';
import type { CatalogKind } from '@/lib/types';

const KINDS: CatalogKind[] = ['ai_model', 'gpu'];

/**
 * GET /api/admin/catalog
 * - Any authenticated user can read the catalog (the cost editor needs it).
 * - `?kind=ai_model|gpu` filters by kind; `?activeOnly=true` skips archived.
 */
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const query: Record<string, unknown> = {};
    if (kind && (KINDS as string[]).includes(kind)) query.kind = kind;
    if (activeOnly) query.isActive = true;
    const items = await Catalog.find(query).sort({ kind: 1, isActive: -1, name: 1 }).lean();
    return NextResponse.json(items);
  } catch (err) {
    console.error('[API] catalog GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const AI_MODEL_FIELDS = [
  'vendor', 'contextWindow', 'pricePerMInputTokens', 'pricePerMOutputTokens', 'deploymentMode', 'paramCountB',
] as const;
const GPU_FIELDS = ['tdpW', 'vramGb', 'priceEur'] as const;
const COMMON = ['name', 'isActive', 'notes'] as const;

function pickByKind(body: any, kind: CatalogKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of COMMON) if (k in body) out[k] = body[k];
  const kindFields = kind === 'ai_model' ? AI_MODEL_FIELDS : GPU_FIELDS;
  for (const k of kindFields) if (k in body) out[k] = body[k];
  return out;
}

/** POST /api/admin/catalog — admin only */
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbConnect();
    const body = await req.json();
    const { kind } = body;
    if (!kind || !(KINDS as string[]).includes(kind)) {
      return NextResponse.json({ error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const data = { kind, ...pickByKind(body, kind) } as Record<string, unknown>;
    if (typeof data.name === 'string') data.name = data.name.trim();

    const clash = await Catalog.findOne({ kind, name: data.name });
    if (clash) return NextResponse.json({ error: `A ${kind} entry with that name already exists` }, { status: 409 });

    const created = await Catalog.create(data);
    return NextResponse.json(created.toObject(), { status: 201 });
  } catch (err) {
    console.error('[API] catalog POST', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
