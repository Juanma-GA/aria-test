import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Catalog } from '@/lib/models';

const AI_MODEL_FIELDS = [
  'vendor', 'contextWindow', 'pricePerMInputTokens', 'pricePerMOutputTokens', 'deploymentMode', 'paramCountB',
] as const;
const GPU_FIELDS = ['tdpW', 'vramGb', 'priceEur'] as const;
const COMMON = ['name', 'isActive', 'notes'] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: { entryId: string } }
) {
  const role = req.headers.get('x-user-role');
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mongoose.isValidObjectId(params.entryId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  try {
    await dbConnect();
    const item = await Catalog.findById(params.entryId).lean();
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    console.error('[API] catalog GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { entryId: string } }
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!mongoose.isValidObjectId(params.entryId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    await dbConnect();
    const existing = await Catalog.findById(params.entryId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const update: Record<string, unknown> = {};
    for (const k of COMMON) if (k in body) update[k] = body[k];
    const kindFields = existing.kind === 'ai_model' ? AI_MODEL_FIELDS : GPU_FIELDS;
    for (const k of kindFields) if (k in body) update[k] = body[k];

    if (typeof update.name === 'string') update.name = update.name.trim();

    if (typeof update.name === 'string' && update.name) {
      const clash = await Catalog.findOne({
        kind: existing.kind, name: update.name, _id: { $ne: params.entryId },
      });
      if (clash) return NextResponse.json({ error: 'Another entry with that name exists' }, { status: 409 });
    }

    const updated = await Catalog.findByIdAndUpdate(params.entryId, update, { new: true }).lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API] catalog PATCH', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { entryId: string } }
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!mongoose.isValidObjectId(params.entryId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    await dbConnect();
    const item = await Catalog.findById(params.entryId);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await item.deleteOne();
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[API] catalog DELETE', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
