import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, POC, User } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

export async function POST(
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

    const poc = await POC.findOne({ _id: pocId, auditId }).lean();
    if (!poc) {
      return NextResponse.json(
        { error: 'POC not found in this audit' },
        { status: 404 },
      );
    }

    const decision = (poc as any).decision?.decision;
    if (decision !== 'go' && decision !== 'go_conditional') {
      return NextResponse.json(
        {
          error:
            'POC must be validated (decision: go or go_conditional) before industrialization',
        },
        { status: 422 },
      );
    }

    const existing = await Industrialization.findOne({ pocId }).lean();
    if (existing) {
      return NextResponse.json(
        {
          error: 'An industrialization already exists for this POC',
          industrializationId: (existing as any)._id,
        },
        { status: 409 },
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const pocCode = (poc as any).pocId;
    const industrializationId = pocCode
      ? `IND-${pocCode}`
      : `IND-${String(await nextSequence('industrialization')).padStart(3, '0')}`;

    const sourceDesign = (poc as any).design ?? {};
    const sourceEval = (poc as any).evaluation ?? {};

    // Resolve POC's responsibleUserId (an ObjectId reference) to the user's name.
    // Without this resolution we'd persist an opaque hex id in a free-text "Technical lead" field.
    let resolvedTechnicalLead = '';
    if (body.plan?.ownerTechnical) {
      resolvedTechnicalLead = body.plan.ownerTechnical;
    } else if (
      sourceDesign.responsibleUserId &&
      mongoose.isValidObjectId(sourceDesign.responsibleUserId)
    ) {
      const user = (await User.findById(sourceDesign.responsibleUserId)
        .select('name email')
        .lean()) as any;
      resolvedTechnicalLead = user?.name || user?.email || '';
    }

    const aiGenerated: string[] = [
      'plan.scope',
      'plan.sovereigntyConstraints',
      'cost.oneTime.developmentEur',
    ];
    if (!body.plan?.ownerTechnical && resolvedTechnicalLead)
      aiGenerated.push('plan.ownerTechnical');

    // Carry the POC's catalog-driven compute breakdown across so the production
    // recurring cost starts from the POC projection rather than zero. Snapshots
    // of model/GPU stay frozen as they were when the POC was set.
    const sourceBreakdown = (poc as any).computeBreakdown;
    const carriedBreakdown =
      sourceBreakdown && (sourceBreakdown as any).mode
        ? {
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
          }
        : undefined;
    if (carriedBreakdown)
      aiGenerated.push('cost.recurringAnnual.computeBreakdown');

    const created = await Industrialization.create({
      auditId,
      useCaseId: (poc as any).useCaseId,
      processId: (poc as any).processId,
      pocId,
      industrializationId,
      name: body.name ?? (poc as any).name ?? '',
      status: body.status ?? 'planned',
      plan: {
        ownerBusiness: body.plan?.ownerBusiness ?? '',
        ownerTechnical: resolvedTechnicalLead,
        scope: body.plan?.scope ?? sourceDesign.scopeDescription ?? '',
        sovereigntyConstraints:
          body.plan?.sovereigntyConstraints ??
          sourceDesign.activeB2Restrictions ??
          '',
        dependencies: body.plan?.dependencies ?? '',
      },
      cost: {
        oneTime: {
          developmentEur:
            sourceEval.actualCostEur ?? sourceDesign.estimatedDevCostEur ?? 0,
        },
        recurringAnnual: carriedBreakdown
          ? {
              computeBreakdown: carriedBreakdown,
              computeEur: sourceBreakdown.computedAnnualEur ?? 0,
            }
          : undefined,
      },
      aiGeneratedFields: aiGenerated,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
