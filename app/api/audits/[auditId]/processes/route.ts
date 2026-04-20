import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process, Audit } from '@/lib/models';

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
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;

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
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const body = await req.json();

    const [count, audit] = await Promise.all([
      Process.countDocuments({ auditId }),
      Audit.findById(auditId).select('auditCode').lean() as any,
    ]);
    const prefix = audit?.auditCode ?? 'AUD';
    const procId = `${prefix}-P${String(count + 1).padStart(2, '0')}`;

    const process = await Process.create({
      auditId,
      procId,
      name: body.name,
      department: body.department || '',
      responsible: body.responsible || '',
      sector: body.sector || '',
      applicableNorms: body.applicableNorms || [],
      activeCertifications: body.activeCertifications || [],
      priority: body.priority || 'medium',
      status: body.status || 'pending',
    });

    return NextResponse.json(process, { status: 201 });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
