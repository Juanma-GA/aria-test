import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase, User } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const { searchParams } = new URL(req.url);
    const processId = searchParams.get('processId');
    const showArchived = searchParams.get('archived') === 'true';
    const query: Record<string, any> = { auditId };
    if (processId) query.processId = processId;
    query.isArchived = showArchived ? true : { $ne: true };

    const pocs = await POC.find(query)
      .populate('processId', 'procId name')
      .populate('useCaseId', 'cuId description')
      .lean();

    // POC.design.responsibleUserId is stored as a String (not a Mongoose ref),
    // and historically contains a User ObjectId. Resolve every distinct
    // ObjectId-shaped value to a human-readable name in a single batch query
    // so the tracker no longer shows "69d40bedb...".
    const idsToResolve = new Set<string>();
    for (const p of pocs as any[]) {
      const v = p?.design?.responsibleUserId;
      if (
        typeof v === 'string' &&
        OBJECT_ID_RE.test(v) &&
        mongoose.isValidObjectId(v)
      ) {
        idsToResolve.add(v);
      }
    }
    if (idsToResolve.size > 0) {
      const users = (await User.find({ _id: { $in: [...idsToResolve] } })
        .select('name email')
        .lean()) as any[];
      const nameById = new Map(
        users.map((u) => [String(u._id), u.name || u.email || '']),
      );
      for (const p of pocs as any[]) {
        const v = p?.design?.responsibleUserId;
        if (typeof v === 'string' && nameById.has(v)) {
          // Add a separate display field; leave the original id intact for save logic.
          p.responsibleName = nameById.get(v);
        }
      }
    }

    return NextResponse.json(pocs);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const { useCaseId, processId, cuId, ...rest } = body;

    if (!useCaseId || !processId || !cuId) {
      return NextResponse.json(
        { error: 'useCaseId, processId, and cuId are required' },
        { status: 400 },
      );
    }

    // Determine sequence number for this use case's POCs
    const existingCount = await POC.countDocuments({ auditId, useCaseId });
    const sequence = String(existingCount + 1).padStart(2, '0');
    const pocId = `POC-${cuId}-${sequence}`;

    // Fetch the UseCase once with all needed fields
    const uc = await UseCase.findById(useCaseId)
      .select('computeBreakdown estimatedImplWeeks nDevs devRateEur estimatedDevCostEur')
      .lean() as any;

    // Inherit the upstream UseCase calculator state when the client did not
    // supply one. Snapshots (model / GPU specs) flow through unchanged so the
    // POC starts from the same hypothesis the use case captured. The user can
    // still edit any field afterwards.
    if (!rest.computeBreakdown || !rest.computeBreakdown.mode) {
      const sourceBreakdown = uc?.computeBreakdown;
      if (sourceBreakdown && sourceBreakdown.mode) {
        rest.computeBreakdown = {
          mode: sourceBreakdown.mode,
          modelId: sourceBreakdown.modelId,
          modelNameSnapshot: sourceBreakdown.modelNameSnapshot ?? '',
          modelPriceInSnapshot: sourceBreakdown.modelPriceInSnapshot ?? 0,
          modelPriceOutSnapshot: sourceBreakdown.modelPriceOutSnapshot ?? 0,
          gpuId: sourceBreakdown.gpuId,
          gpuNameSnapshot: sourceBreakdown.gpuNameSnapshot ?? '',
          gpuPriceSnapshot: sourceBreakdown.gpuPriceSnapshot ?? 0,
          gpuTdpSnapshot: sourceBreakdown.gpuTdpSnapshot ?? 0,
          annualReps: sourceBreakdown.annualReps ?? 0,
          inputTokensPerExec: sourceBreakdown.inputTokensPerExec ?? 1000,
          outputTokensPerExec: sourceBreakdown.outputTokensPerExec ?? 500,
          nGpus: sourceBreakdown.nGpus ?? 1,
          amortizationYears: sourceBreakdown.amortizationYears ?? 4,
          electricityRateEur: sourceBreakdown.electricityRateEur ?? 0.15,
          onPremPct: sourceBreakdown.onPremPct ?? 100,
          concurrentUsersPerGpuSnapshot: sourceBreakdown.concurrentUsersPerGpuSnapshot ?? 0,
          workingHoursPerDay: sourceBreakdown.workingHoursPerDay ?? 10,
          workingDaysPerWeek: sourceBreakdown.workingDaysPerWeek ?? 5,
          workingWeeksPerYear: sourceBreakdown.workingWeeksPerYear ?? 48,
          maxConcurrentUsersSupported: sourceBreakdown.maxConcurrentUsersSupported ?? 0,
          peakConcurrentUsers: sourceBreakdown.peakConcurrentUsers ?? 0,
          peakUsageFractionOfWindow: sourceBreakdown.peakUsageFractionOfWindow ?? 25,
          hwPreexisting: sourceBreakdown.hwPreexisting ?? false,
        };
      }
    }

    // Recompute the calculator's annual euro figure server-side so the
    // persisted snapshot stays coherent regardless of what the client posts.
    if (rest.computeBreakdown && typeof rest.computeBreakdown === 'object') {
      const calc = computeAnnualCompute(rest.computeBreakdown);
      rest.computeBreakdown = {
        ...rest.computeBreakdown,
        computedAnnualEur: calc.totalEur,
      };
    }

    const poc = await POC.create({
      auditId,
      useCaseId,
      processId,
      pocId,
      ...rest,
      design: {
        ...(rest.design || {}),
        estimatedImplWeeks: uc?.estimatedImplWeeks ?? 0,
        nDevs: uc?.nDevs ?? 1,
        devRateEur: uc?.devRateEur ?? 450,
        estimatedDevCostEur: uc?.estimatedDevCostEur ?? 0,
      },
    });

    return NextResponse.json(poc.toObject(), { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
