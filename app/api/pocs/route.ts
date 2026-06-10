import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit, UseCase } from '@/lib/models';
import { getVisibleUCIds } from '@/lib/pocHelpers';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const visibleUCIds = await getVisibleUCIds(req);
    if (!visibleUCIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pocs = await POC.find({
      $or: [
        { useCaseIds: { $in: visibleUCIds } },
        { useCaseId: { $in: visibleUCIds } },
      ],
    })
      .populate('processId', 'procId name')
      .sort({ createdAt: -1 })
      .lean();

    // Resolve reference UC for each POC: useCaseIds[0] with fallback to legacy useCaseId
    const refUCIds = [
      ...new Set(
        (pocs as any[])
          .map(p =>
            (p.useCaseIds ?? []).length > 0
              ? String(p.useCaseIds[0])
              : p.useCaseId ? String(p.useCaseId) : null
          )
          .filter(Boolean) as string[]
      ),
    ];

    const refUCs = await UseCase.find({ _id: { $in: refUCIds } })
      .select('cuId description auditId')
      .lean() as any[];

    const refUCMap = Object.fromEntries(refUCs.map(u => [String((u as any)._id), u]));

    // Collect distinct audit IDs from reference UCs and fetch them
    const auditIds = [...new Set(refUCs.map(u => String((u as any).auditId)).filter(Boolean))];
    const audits = await Audit.find({ _id: { $in: auditIds } })
      .select('name client startDate targetEndDate')
      .lean() as any[];
    const auditMap = Object.fromEntries(audits.map(a => [String((a as any)._id), a]));

    // Enrich: audit and useCase resolved from reference UC (same response shape as before)
    const enriched = (pocs as any[]).map(p => {
      const refId =
        (p.useCaseIds ?? []).length > 0
          ? String(p.useCaseIds[0])
          : p.useCaseId ? String(p.useCaseId) : null;
      const refUC = refId ? (refUCMap[refId] as any) : null;
      return {
        ...p,
        audit: refUC ? (auditMap[String(refUC.auditId)] ?? null) : null,
        useCase: refUC
          ? { _id: refUC._id, cuId: refUC.cuId, description: refUC.description }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
