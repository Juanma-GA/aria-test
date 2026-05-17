import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const poc = await POC.findOne({ auditId, _id: pocId })
      .populate('useCaseId', 'cuId description')
      .populate('processId', 'procId name')
      .lean();
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    return NextResponse.json(poc);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    // Deep merge nested objects (design, execution, evaluation, decision)
    const nestedFields = ['design', 'execution', 'evaluation', 'decision'] as const;
    for (const field of nestedFields) {
      if (body[field] !== undefined) {
        const existing = (poc[field] as any)?.toObject?.() ?? poc[field] ?? {};
        (poc as any)[field] = { ...existing, ...body[field] };
        delete body[field];
      }
    }

    // Compute calculator: server-side recompute of computedAnnualEur from the
    // breakdown inputs, so the persisted euro figure always matches the inputs.
    if (body.computeBreakdown !== undefined) {
      const existing = ((poc as any).computeBreakdown?.toObject?.() ?? (poc as any).computeBreakdown ?? {}) as Record<string, unknown>;
      const merged = { ...existing, ...body.computeBreakdown };
      const calc = computeAnnualCompute(merged as any);
      (poc as any).computeBreakdown = { ...merged, computedAnnualEur: calc.totalEur };
      delete body.computeBreakdown;
    }

    // Stamp archivedAt whenever isArchived flips, so the audit log is implicit.
    if ('isArchived' in body) {
      (poc as any).archivedAt = body.isArchived ? new Date() : undefined;
    }

    // Apply remaining scalar fields
    Object.assign(poc, body);

    await poc.save();

    // If decision is set to 'no_go_discard', block the linked use case
    const decision = (poc.decision as any)?.decision;
    if (decision === 'no_go_discard' && poc.useCaseId) {
      await UseCase.findByIdAndUpdate(poc.useCaseId, {
        status: 'blocked',
        blockedReason: 'POC decision: no_go_discard',
      });
    }

    return NextResponse.json(poc.toObject());
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const cascade = searchParams.get('cascade') === 'true';

    const indCount = await Industrialization.countDocuments({ pocId });
    if (indCount > 0 && !cascade) {
      return NextResponse.json({
        error: 'POC has a dependent industrialization',
        dependents: { industrializations: indCount },
        hint: 'Archive the POC, or pass ?cascade=true to delete the linked industrialization too.',
      }, { status: 409 });
    }

    if (cascade) {
      await Industrialization.deleteMany({ pocId });
    }

    await poc.deleteOne();
    return NextResponse.json({ message: 'POC deleted successfully', cascaded: cascade ? { industrializations: indCount } : undefined });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
