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
      .populate({
        path: 'useCaseIds',
        select: 'cuId description targetActivities timeSavedPerProfile computeBreakdown estimatedDevCostEur processId isInstance additionalDevCostEur',
        populate: { path: 'processId', select: 'procId name' }
      })
      .populate('useCaseId', 'cuId description')
      .populate('processId', 'procId name b1 b3')
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
      { _id: poc._id },
      { $set }
    );

    // Handle UC status transitions — only if useCaseIds is being updated
    if (body.useCaseIds !== undefined) {
      const oldUseCaseIds = new Set<string>(
        (poc.useCaseIds || []).map((id: any) => String(id))
      );

      const newUseCaseIds = new Set<string>(
        (body.useCaseIds || []).map((id: any) => String(id))
      );

      const addedUCs = Array.from(newUseCaseIds).filter(id => !oldUseCaseIds.has(id));
      const removedUCs = Array.from(oldUseCaseIds).filter(id => !newUseCaseIds.has(id));

      // Added UCs → 'in_poc'
      if (addedUCs.length > 0) {
        await UseCase.updateMany(
          { _id: { $in: addedUCs } },
          { $set: { status: 'in_poc' } }
        );
      }

      // Removed UCs → 'eligible' only if no other active POCs contain them
      if (removedUCs.length > 0) {
        for (const ucId of removedUCs) {
          const remainingPocs = await POC.countDocuments({
            $or: [
              { useCaseIds: ucId },
              { useCaseId: ucId }
            ],
            isArchived: { $ne: true },
            _id: { $ne: poc._id }
          });
          if (remainingPocs === 0) {
            await UseCase.findByIdAndUpdate(ucId, { $set: { status: 'eligible' } });
          }
        }
      }
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

    // Revert UC to 'eligible' if no other POCs remain
    // Check both old useCaseId and new useCaseIds fields for backward compat
    const remainingPocs = await POC.countDocuments({
      $or: [
        { useCaseIds: { $in: [(poc as any).useCaseId] } },
        { useCaseId: (poc as any).useCaseId }
      ],
      _id: { $ne: poc._id }
    });
    if (remainingPocs === 0) {
      await UseCase.findByIdAndUpdate((poc as any).useCaseId, { $set: { status: 'eligible' } });
    }

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
