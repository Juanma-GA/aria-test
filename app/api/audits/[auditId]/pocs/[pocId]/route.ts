import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

export async function GET(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; pocId: string }>
      | { auditId: string; pocId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, pocId } = params;
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
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; pocId: string }>
      | { auditId: string; pocId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, pocId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const poc = await POC.findOne({ auditId, _id: pocId }).lean() as any;
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    // Build $set from body, handling nested field merges
    const $set: Record<string, any> = {};

    // Deep merge nested objects (design, execution, evaluation, decision)
    const nestedFields = ['design', 'execution', 'evaluation', 'decision'];
    for (const field of nestedFields) {
      if (body[field] !== undefined) {
        const existing = (poc as any)[field] ?? {};
        $set[field] = { ...existing, ...body[field] };
        delete body[field];
      }
    }

    // Add remaining scalar fields to $set
    for (const [key, value] of Object.entries(body)) {
      if (key !== '_id') $set[key] = value;
    }

    // Compute calculator: server-side recompute of computedAnnualEur from the
    // breakdown inputs, so the persisted euro figure always matches the inputs.
    if ($set.computeBreakdown) {
      const calc = computeAnnualCompute($set.computeBreakdown);
      $set.computeBreakdown = { ...$set.computeBreakdown, computedAnnualEur: calc.totalEur };
    }

    // Stamp archivedAt whenever isArchived flips, so the audit log is implicit.
    if (typeof $set.isArchived === 'boolean') {
      $set.archivedAt = $set.isArchived ? new Date() : undefined;
    }

    // Use MongoDB native driver to bypass Mongoose strict mode
    await POC.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(pocId) },
      { $set }
    );

    // If decision is set to 'no_go_discard', block the linked use case
    const decision = ($set.decision as any)?.decision;
    if (decision === 'no_go_discard' && poc.useCaseId) {
      await UseCase.findByIdAndUpdate(poc.useCaseId, {
        status: 'blocked',
        blockedReason: 'POC decision: no_go_discard',
      });
    }

    // Fetch updated document and return
    const updated = await POC.findOne({ auditId, _id: pocId }).lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; pocId: string }>
      | { auditId: string; pocId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, pocId } = params;
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
      return NextResponse.json(
        {
          error: 'POC has a dependent industrialization',
          dependents: { industrializations: indCount },
          hint: 'Archive the POC, or pass ?cascade=true to delete the linked industrialization too.',
        },
        { status: 409 },
      );
    }

    if (cascade) {
      await Industrialization.deleteMany({ pocId });
    }

    await poc.deleteOne();
    return NextResponse.json({
      message: 'POC deleted successfully',
      cascaded: cascade ? { industrializations: indCount } : undefined,
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
