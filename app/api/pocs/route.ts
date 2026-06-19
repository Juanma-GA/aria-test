import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase } from '@/lib/models';
import { getVisibleUCIds, OBJECT_ID_RE } from '@/lib/pocHelpers';
import { enrichPocs } from '@/lib/pocEnrichment';

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
      .populate('processId', 'procId name b1.profiles b3.annualRepetitions b3.activities.id b3.activities.name b3.activities.profileHours b3.activities.stepRepetitions')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = await enrichPocs(pocs as any[]);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
