import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

/** Recalculate total score and category from dimension values */
function recalculateScore(dimensions: Record<string, { value: number }>) {
  const DIM_KEYS = [
    'd1_efficiencyImpact',
    'd2_qualityImpact',
    'd3_techMaturity',
    'd4_dataReadiness',
    'd5_sovereigntyIndex',
    'd6_governanceComplexity',
  ];
  let total = 0;
  for (const key of DIM_KEYS) {
    total += dimensions[key]?.value ?? 0;
  }
  const d6 = dimensions.d6_governanceComplexity?.value ?? 0;

  let category: string;
  if (total >= 22 && d6 >= 4) {
    category = 'quick_win';
  } else if (total >= 14) {
    category = 'mid_term';
  } else {
    category = 'strategic';
  }

  return { total, category };
}

export async function GET(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; cuId: string }>
      | { auditId: string; cuId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, cuId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const useCase = await UseCase.findOne({ auditId, _id: cuId }).lean();
    if (!useCase) {
      return NextResponse.json(
        { error: 'Use case not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(useCase);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

const EDITABLE_FIELDS = [
  'description', 'aiTypes', 'targetActivities', 'b2Compatible', 'requiresClientIT',
  'timeSavedPerProfile', 'estimatedDevCostEur', 'devCostExplanation', 'devRateEur', 'estimatedImplWeeks',
  'reviewDate', 'notes',
  'computeBreakdown', 'sovereigntyAnalysis', 'isArchived', 'requiredPreconditions', 'score', 'nDevs',
] as const;

export async function PATCH(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; cuId: string }>
      | { auditId: string; cuId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, cuId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const existing = (await UseCase.findOne({
      auditId,
      _id: cuId,
    }).lean()) as any;
    if (!existing) {
      return NextResponse.json(
        { error: 'Use case not found' },
        { status: 404 },
      );
    }

    // Build $set from allowed fields only — avoids Mongoose errors on immutable fields (_id, etc.)
    const $set: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) $set[key] = body[key];
    }
    // Stamp archivedAt whenever isArchived flips, so the audit log is implicit.
    if ('isArchived' in body) {
      $set.archivedAt = body.isArchived ? new Date() : null;
    }

    // When computeBreakdown is supplied, recompute its annual euro figure
    // server-side so the persisted snapshot always matches the calculator.
    if ($set.computeBreakdown && typeof $set.computeBreakdown === 'object') {
      const merged = {
        ...(existing.computeBreakdown ?? {}),
        ...$set.computeBreakdown,
      };
      const calc = computeAnnualCompute(merged as any);
      $set.computeBreakdown = { ...merged, computedAnnualEur: calc.totalEur };
    }

    // Handle score: merge dimensions then recalculate
    if (body.score !== undefined) {
      const existingDims = existing.score?.dimensions ?? {};
      const mergedDimensions = {
        ...existingDims,
        ...(body.score.dimensions ?? {}),
      };
      const { total, category } = recalculateScore(mergedDimensions);
      $set['score'] = {
        ...(existing.score ?? {}),
        ...body.score,
        dimensions: mergedDimensions,
        total,
        category,
      };
    }

    // Use native MongoDB driver to bypass Mongoose strict-mode stripping on $set
    const oid = new mongoose.Types.ObjectId(cuId);
    const result = await UseCase.collection.updateOne({ _id: oid }, { $set });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Use case not found during update' },
        { status: 404 },
      );
    }

    const updated = await UseCase.findOne({ _id: cuId }).lean();
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
      | Promise<{ auditId: string; cuId: string }>
      | { auditId: string; cuId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, cuId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const useCase = await UseCase.findOne({ auditId, _id: cuId });
    if (!useCase) {
      return NextResponse.json(
        { error: 'Use case not found' },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const cascade = searchParams.get('cascade') === 'true';

    const [pocCount, indCount] = await Promise.all([
      POC.countDocuments({ useCaseId: cuId }),
      Industrialization.countDocuments({ useCaseId: cuId }),
    ]);

    if ((pocCount > 0 || indCount > 0) && !cascade) {
      return NextResponse.json(
        {
          error: 'Use case has dependent records',
          dependents: { pocs: pocCount, industrializations: indCount },
          hint: 'Archive the use case, or pass ?cascade=true to delete with all dependent POCs and industrializations.',
        },
        { status: 409 },
      );
    }

    if (cascade) {
      await Promise.all([
        Industrialization.deleteMany({ useCaseId: cuId }),
        POC.deleteMany({ useCaseId: cuId }),
      ]);
    }

    await useCase.deleteOne();
    return NextResponse.json({
      message: 'Use case deleted successfully',
      cascaded: cascade
        ? { pocs: pocCount, industrializations: indCount }
        : undefined,
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
