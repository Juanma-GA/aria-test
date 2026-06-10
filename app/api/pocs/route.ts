import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit, UseCase, User } from '@/lib/models';
import { getVisibleUCIds, OBJECT_ID_RE } from '@/lib/pocHelpers';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const visibleUCIds = await getVisibleUCIds(req);
    if (!visibleUCIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const showArchived = searchParams.get('archived') === 'true';
    const auditIdParam = searchParams.get('auditId');

    let effectiveUCIds = visibleUCIds;

    if (auditIdParam) {
      if (!OBJECT_ID_RE.test(auditIdParam)) {
        return NextResponse.json({ error: 'Invalid auditId' }, { status: 400 });
      }
      // Intersect: only UCs belonging to the requested audit AND visible to the caller
      const auditUCs = await UseCase.find({ auditId: auditIdParam }).select('_id').lean();
      const auditUCIdStrs = new Set(auditUCs.map((u: any) => String(u._id)));
      effectiveUCIds = visibleUCIds.filter(id => auditUCIdStrs.has(String(id)));
    }

    const pocs = await POC.find({
      $or: [
        { useCaseIds: { $in: effectiveUCIds } },
        { useCaseId: { $in: effectiveUCIds } },
      ],
      isArchived: showArchived ? true : { $ne: true },
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

    const auditIds = [...new Set(refUCs.map(u => String((u as any).auditId)).filter(Boolean))];
    const audits = await Audit.find({ _id: { $in: auditIds } })
      .select('name client startDate targetEndDate')
      .lean() as any[];
    const auditMap = Object.fromEntries(audits.map(a => [String((a as any)._id), a]));

    // Batch-resolve ObjectId-shaped responsibleUserId → display name
    const idsToResolve = new Set<string>();
    for (const p of pocs as any[]) {
      const v = p?.design?.responsibleUserId;
      if (typeof v === 'string' && OBJECT_ID_RE.test(v)) idsToResolve.add(v);
    }
    let nameById = new Map<string, string>();
    if (idsToResolve.size > 0) {
      const users = await User.find({ _id: { $in: [...idsToResolve] } })
        .select('name email').lean() as any[];
      nameById = new Map(users.map((u: any) => [String(u._id), u.name || u.email || '']));
    }

    const enriched = (pocs as any[]).map(p => {
      const refId =
        (p.useCaseIds ?? []).length > 0
          ? String(p.useCaseIds[0])
          : p.useCaseId ? String(p.useCaseId) : null;
      const refUC = refId ? (refUCMap[refId] as any) : null;
      const v = p?.design?.responsibleUserId;
      return {
        ...p,
        ...(typeof v === 'string' && nameById.has(v) ? { responsibleName: nameById.get(v) } : {}),
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
