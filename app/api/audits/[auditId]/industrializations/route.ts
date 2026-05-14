import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, POC } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { createIndustrializationSchema, validationErrorResponse } from '@/lib/validators';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
// fallback Counter retained for safety: only used if a POC has no human-readable code (legacy data).

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const { searchParams } = new URL(req.url);
    const processId = searchParams.get('processId');
    const useCaseId = searchParams.get('useCaseId');
    const status = searchParams.get('status');
    const showArchived = searchParams.get('archived') === 'true';
    const query: Record<string, any> = { auditId };
    if (processId) query.processId = processId;
    if (useCaseId) query.useCaseId = useCaseId;
    if (status) query.status = status;
    query.isArchived = showArchived ? true : { $ne: true };

    const items = await Industrialization.find(query)
      .populate('processId', 'procId name')
      .populate('useCaseId', 'cuId description')
      .populate('pocId', 'pocId name phase decision')
      .lean();

    return NextResponse.json(items);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const parsed = createIndustrializationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: 400 });
    }

    const poc = await POC.findOne({ _id: parsed.data.pocId, auditId }).lean();
    if (!poc) {
      return NextResponse.json({ error: 'POC not found in this audit' }, { status: 404 });
    }

    const decision = (poc as any).decision?.decision;
    if (decision !== 'go' && decision !== 'go_conditional') {
      return NextResponse.json(
        { error: 'POC must be validated (decision: go or go_conditional) before industrialization' },
        { status: 422 }
      );
    }

    const existing = await Industrialization.findOne({ pocId: parsed.data.pocId }).lean();
    if (existing) {
      return NextResponse.json(
        { error: 'An industrialization already exists for this POC' },
        { status: 409 }
      );
    }

    const pocCode = (poc as any).pocId; // e.g. "POC-CU-01-01"
    const industrializationId = pocCode ? `IND-${pocCode}` : `IND-${String(await nextSequence('industrialization')).padStart(3, '0')}`;

    const created = await Industrialization.create({
      auditId,
      useCaseId: (poc as any).useCaseId,
      processId: (poc as any).processId,
      pocId: parsed.data.pocId,
      industrializationId,
      name: parsed.data.name ?? '',
      status: parsed.data.status ?? 'planned',
      statusReason: parsed.data.statusReason ?? '',
      plan: parsed.data.plan ?? {},
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
