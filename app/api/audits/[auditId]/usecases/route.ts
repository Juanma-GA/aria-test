import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase, Process } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { createUseCaseSchema, validationErrorResponse } from '@/lib/validators';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

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

function hasRedAxis(b2: any): boolean {
  if (!b2?.axes) return false;
  return (Object.values(b2.axes) as any[]).some((a) => a.status === 'red');
}

/** Map a 1–5 float sovereignty index to a rounded 1–5 integer score */
function sovereigntyToD5(index: number | null): number {
  if (index === null) return 3;
  return Math.min(5, Math.max(1, Math.round(index)));
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

    const { searchParams } = new URL(req.url);
    const processId = searchParams.get('processId');
    const showArchived = searchParams.get('archived') === 'true';

    const query: Record<string, any> = { auditId };
    if (processId) query.processId = processId;
    query.isArchived = showArchived ? true : { $ne: true };

    const useCases = await UseCase.find(query)
      .populate('processId', 'procId name b1')
      .lean();

    return NextResponse.json(useCases);
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
    const parsed = createUseCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: 400 });
    }

    // Instance validation: if creating an instance, parent must exist and not be an instance
    if (body.isInstance === true) {
      if (!body.parentUCId) {
        return NextResponse.json(
          { error: 'isInstance requires parentUCId' },
          { status: 400 },
        );
      }
      const parent = await UseCase.findById(body.parentUCId).lean() as any;
      if (!parent) {
        return NextResponse.json(
          { error: 'Parent use case not found' },
          { status: 400 },
        );
      }
      if (parent.isInstance === true) {
        return NextResponse.json(
          { error: 'Cannot create instance of an instance. Parent must be an original use case.' },
          { status: 400 },
        );
      }
    }

    // Auto-generate cuId unique per process, compound with procId
    const proc = body.processId
      ? await Process.findById(body.processId).select('procId').lean() as any
      : null;
    const procIdStr = proc?.procId ?? 'PROC';
    const seq = await nextSequence(`usecase:${body.processId}`);
    const cuId = `${procIdStr}-C${String(seq).padStart(2, '0')}`;

    // All new use cases start as eligible
    const status = 'eligible';

    // Pre-fill D5 sovereigntyIndex from process b2
    let d5Value = 3;
    if (body.processId) {
      const process = await Process.findById(body.processId).lean();
      if (process) {
        const idx = getSovereigntyIndex(process.b2);
        d5Value = sovereigntyToD5(idx);
      }
    }

    // Support both aiTypes (new) and aiType (legacy migration)
    const aiTypes = body.aiTypes?.length
      ? body.aiTypes
      : body.aiType
      ? [body.aiType]
      : ['generative_llm'];

    // Support both targetActivities (new, array) and targetActivity (legacy, string)
    const targetActivities = body.targetActivities?.length
      ? body.targetActivities
      : body.targetActivity
      ? [body.targetActivity]
      : [];

    const useCaseData: Record<string, any> = {
      auditId,
      processId: body.processId,
      cuId,
      description: body.description,
      aiTypes,
      targetActivities,
      b2Compatible: body.b2Compatible || 'yes',
      requiresClientIT: body.requiresClientIT ?? false,
      timeSavedPerProfile: body.timeSavedPerProfile || [],
      estimatedDevCostEur: body.estimatedDevCostEur || 0,
      devCostExplanation: body.devCostExplanation || '',
      devRateEur: body.devRateEur ?? 450,
      nDevs: body.nDevs ?? 1,
      estimatedImplWeeks: body.estimatedImplWeeks || 0,
      status,
      notes: body.notes || '',
      requiredPreconditions: body.requiredPreconditions ?? { requiresClientIT: false, text: '' },
      parentUCId: body.parentUCId || null,
      isInstance: body.isInstance ?? false,
      additionalDevCostEur: body.additionalDevCostEur ?? 0,
    };

    // Carry the calculator state from the create payload, recomputing the
    // annual figure server-side so the persisted snapshot is always coherent.
    if (body.computeBreakdown && typeof body.computeBreakdown === 'object') {
      const calc = computeAnnualCompute(body.computeBreakdown);
      useCaseData.computeBreakdown = { ...body.computeBreakdown, computedAnnualEur: calc.totalEur };
    }

    // Embed D5 auto-fill
    if (body.score) {
      useCaseData.score = {
        ...body.score,
        dimensions: {
          ...body.score.dimensions,
          d5_sovereigntyIndex: {
            value: body.score.dimensions?.d5_sovereigntyIndex?.value ?? d5Value,
            justification:
              body.score.dimensions?.d5_sovereigntyIndex?.justification ??
              'Auto-filled from B2 sovereignty index',
            autoFilled: body.score.dimensions?.d5_sovereigntyIndex?.autoFilled ?? true,
          },
        },
      };
    } else {
      useCaseData.score = {
        dimensions: {
          d5_sovereigntyIndex: {
            value: d5Value,
            justification: 'Auto-filled from B2 sovereignty index',
            autoFilled: true,
          },
        },
        scoringNotes: '',
        scoredBy: '',
      };
    }

    const useCase = await UseCase.create(useCaseData);
    return NextResponse.json(useCase, { status: 201 });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
