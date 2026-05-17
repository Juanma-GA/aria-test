import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process, Audit } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { createProcessSchema, validationErrorResponse } from '@/lib/validators';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

function getSovereigntyIndex(b2: any): number | null {
  if (!b2?.axes) return null;
  const vals = (Object.values(b2.axes) as any[])
    .map((a) =>
      a.status === 'green' ? 5 : a.status === 'amber' ? 3 : a.status === 'red' ? 1 : null
    )
    .filter((v) => v !== null) as number[];
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  try {
    await dbConnect();
    const { auditId } = await params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const processes = await Process.find({ auditId }).sort({ procId: 1 }).lean();

    const enriched = processes.map((p) => ({
      ...p,
      sovereigntyIndex: getSovereigntyIndex(p.b2),
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  try {
    await dbConnect();
    const { auditId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const parsed = createProcessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: 400 });
    }

    const audit = await Audit.findById(auditId).select('auditCode').lean() as any;
    const prefix = audit?.auditCode ?? 'AUD';
    const seq = await nextSequence(`process:${auditId}`);
    const procId = `${prefix}-P${String(seq).padStart(2, '0')}`;

    const input = parsed.data;
    const process = await Process.create({
      auditId,
      procId,
      name: input.name,
      department: input.department,
      responsible: input.responsible,
      sector: input.sector,
      applicableNorms: input.applicableNorms,
      activeCertifications: input.activeCertifications,
      priority: input.priority,
      status: input.status,
    });

    return NextResponse.json(process, { status: 201 });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
