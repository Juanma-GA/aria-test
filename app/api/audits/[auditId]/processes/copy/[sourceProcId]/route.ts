import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process, Audit } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ auditId: string; sourceProcId: string }> | { auditId: string; sourceProcId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, sourceProcId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    // Fetch source process
    const sourceProcess = await Process.findOne({
      auditId,
      _id: sourceProcId,
    }).lean();

    if (!sourceProcess) {
      return NextResponse.json(
        { error: 'Source process not found' },
        { status: 404 },
      );
    }

    // Generate new procId
    const audit = (await Audit.findById(auditId)
      .select('auditCode')
      .lean()) as any;
    const prefix = audit?.auditCode ?? 'AUD';
    const seq = await nextSequence(`process:${auditId}`);
    const procId = `${prefix}-P${String(seq).padStart(2, '0')}`;

    // Create new process with copied data
    const newProcess = await Process.create({
      auditId,
      procId,
      name: '', // Empty name — user will fill in B1
      department: sourceProcess.department,
      responsible: sourceProcess.responsible,
      sector: sourceProcess.sector,
      applicableNorms: sourceProcess.applicableNorms,
      activeCertifications: sourceProcess.activeCertifications,
      priority: sourceProcess.priority,
      status: 'pending', // Reset status
      b1: sourceProcess.b1,
      b2: sourceProcess.b2,
      b3: sourceProcess.b3,
    });

    return NextResponse.json(newProcess, { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
