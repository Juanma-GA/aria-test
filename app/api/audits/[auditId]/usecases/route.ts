import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase, Process } from '@/lib/models';
import { nextSequence } from '@/lib/models/Counter';
import { createUseCaseSchema, validationErrorResponse } from '@/lib/validators';
import { requireRole } from '@/lib/auth';

function getSovereigntyIndex(b2: any): number | null {
  if (!b2?.axes) return null;
  const vals = (Object.values(b2.axes) as any[])
    .map((a) =>
      a.status === 'green'
        ? 5
        : a.status === 'amber'
          ? 3
          : a.status === 'red'
            ? 1
            : null,
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
  { params }: { params: Promise<{ auditId: string }> },
) {
  try {
    await dbConnect();
    const { auditId } = await params;
    const { searchParams } = new URL(req.url);
    const processId = searchParams.get('processId');

    const query: Record<string, any> = { auditId };
    if (processId) query.processId = processId;

    const useCases = await UseCase.find(query)
      .populate('processId', 'procId name b1')
      .lean();

    return NextResponse.json(useCases);
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
  { params }: { params: Promise<{ auditId: string }> },
) {
  const forbidden = requireRole(req, ['admin', 'consultant']);
  if (forbidden) return forbidden;
  try {
    await dbConnect();
    const { auditId } = await params;
    const body = await req.json();
    const parsed = createUseCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), {
        status: 400,
      });
    }

    // Auto-generate cuId unique per process, compound with procId
    const proc = body.processId
      ? ((await Process.findById(body.processId)
          .select('procId')
          .lean()) as any)
      : null;
    const procIdStr = proc?.procId ?? 'PROC';
    const seq = await nextSequence(`usecase:${body.processId}`);
    const cuId = `${procIdStr}-C${String(seq).padStart(2, '0')}`;

    // Determine status based on B2 compatibility
    let status = body.status || 'eligible';
    let blockedReason: string | undefined;
    let blockedAxis: string | undefined;

    if (body.b2Compatible === 'no' && body.processId) {
      const process = await Process.findById(body.processId).lean();
      if (process && hasRedAxis(process.b2)) {
        status = 'blocked';
        blockedReason = 'B2 sovereignty axis marked red';
        blockedAxis = 'b2';
      }
    }

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
      estimatedImplWeeks: body.estimatedImplWeeks || 0,
      status,
      notes: body.notes || '',
    };

    if (blockedReason) useCaseData.blockedReason = blockedReason;
    if (blockedAxis) useCaseData.blockedAxis = blockedAxis;

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
            autoFilled:
              body.score.dimensions?.d5_sovereigntyIndex?.autoFilled ?? true,
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
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
