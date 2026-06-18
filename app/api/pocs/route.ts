import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit, UseCase, User, Process } from '@/lib/models';
import { getVisibleUCIds, OBJECT_ID_RE } from '@/lib/pocHelpers';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const visibleUCIds = await getVisibleUCIds(req);
    if (!visibleUCIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const showArchived = searchParams.get('archived') === 'true';
    const auditIdParam = searchParams.get('auditId');
    const includeMockups = searchParams.get('include') === 'mockups';

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

    let query: any = POC.find({
      $or: [
        { useCaseIds: { $in: effectiveUCIds } },
        { useCaseId: { $in: effectiveUCIds } },
      ],
      isArchived: showArchived ? true : { $ne: true },
    });

    if (!includeMockups) {
      query = query.select('-mockups');
    }

    const pocs = await query
      .populate('processId', 'procId name b1.profiles b3.annualRepetitions b3.activities.id b3.activities.name b3.activities.profileHours')
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
      .select('cuId description auditId targetActivities timeSavedPerProfile computeBreakdown estimatedDevCostEur additionalDevCostEur isInstance estimatedImplWeeks')
      .lean() as any[];
    const refUCMap = Object.fromEntries(refUCs.map(u => [String((u as any)._id), u]));

    const auditIds = [...new Set(refUCs.map(u => String((u as any).auditId)).filter(Boolean))];
    const audits = await Audit.find({ _id: { $in: auditIds } })
      .select('name client startDate targetEndDate')
      .lean() as any[];
    const auditMap = Object.fromEntries(audits.map(a => [String((a as any)._id), a]));

    // Batch-resolve instances (useCaseIds[1..n]): UCs + their own audits + their own processes
    // (instances can be cross-audit, so audit/process come from each instance UC, not the POC)
    const instanceUCIds = new Set<string>();
    for (const p of pocs as any[]) {
      const ids = p.useCaseIds ?? [];
      for (let i = 1; i < ids.length; i++) instanceUCIds.add(String(ids[i]));
    }

    let instanceUCMap: Record<string, any> = {};
    let instanceAuditMap = new Map<string, any>();
    let instanceProcessMap = new Map<string, any>();

    if (instanceUCIds.size > 0) {
      const instanceUCs = await UseCase.find({ _id: { $in: [...instanceUCIds] } })
        .select('_id cuId description auditId processId targetActivities timeSavedPerProfile computeBreakdown estimatedDevCostEur additionalDevCostEur isInstance estimatedImplWeeks devRateEur')
        .lean() as any[];
      instanceUCMap = Object.fromEntries(instanceUCs.map(u => [String(u._id), u]));

      const instAuditIds = [...new Set(instanceUCs.map(u => String(u.auditId)).filter(Boolean))];
      const instAudits = await Audit.find({ _id: { $in: instAuditIds } })
        .select('name client')
        .lean() as any[];
      instanceAuditMap = new Map(instAudits.map(a => [String(a._id), a]));

      const instProcessIds = [...new Set(instanceUCs.map(u => String(u.processId)).filter(Boolean))];
      const instProcesses = await Process.find({ _id: { $in: instProcessIds } })
        .select('_id procId name b1.profiles b3.annualRepetitions b3.activities.id b3.activities.name b3.activities.profileHours')
        .lean() as any[];
      instanceProcessMap = new Map(instProcesses.map(pr => [String(pr._id), pr]));
    }

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

      const instances = ((p.useCaseIds ?? []) as any[]).slice(1).map(ucId => {
        const uc = instanceUCMap[String(ucId)];
        if (!uc) return null;
        const audit = instanceAuditMap.get(String(uc.auditId));
        const process = instanceProcessMap.get(String(uc.processId));
        return {
          _id: uc._id,
          cuId: uc.cuId,
          description: uc.description,
          targetActivities: uc.targetActivities,
          timeSavedPerProfile: uc.timeSavedPerProfile,
          computeBreakdown: uc.computeBreakdown,
          estimatedDevCostEur: uc.estimatedDevCostEur,
          additionalDevCostEur: uc.additionalDevCostEur,
          isInstance: uc.isInstance,
          devRateEur: uc.devRateEur,
          estimatedImplWeeks: uc.estimatedImplWeeks,
          audit: audit ? { _id: uc.auditId, name: audit.name, client: audit.client } : null,
          process: process ? { _id: process._id, procId: process.procId, name: process.name, b1: process.b1, b3: process.b3 } : null,
        };
      }).filter(Boolean);

      return {
        ...p,
        ...(typeof v === 'string' && nameById.has(v) ? { responsibleName: nameById.get(v) } : {}),
        audit: refUC ? (auditMap[String(refUC.auditId)] ?? null) : null,
        useCase: refUC
          ? {
              _id: refUC._id,
              cuId: refUC.cuId,
              description: refUC.description,
              targetActivities: refUC.targetActivities,
              timeSavedPerProfile: refUC.timeSavedPerProfile,
              computeBreakdown: refUC.computeBreakdown,
              estimatedDevCostEur: refUC.estimatedDevCostEur,
              additionalDevCostEur: refUC.additionalDevCostEur,
              isInstance: refUC.isInstance,
              estimatedImplWeeks: refUC.estimatedImplWeeks,
            }
          : null,
        ...(instances.length > 0 ? { instances } : {}),
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
