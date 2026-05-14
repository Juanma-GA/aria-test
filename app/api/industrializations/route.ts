import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, Audit, UseCase, POC } from '@/lib/models';
import { visibilityFilter } from '@/lib/auditAccess';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const visibility = visibilityFilter(req);
    if (!visibility) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const showArchived = searchParams.get('archived') === 'true';
    const visibleAudits = await Audit.find(visibility).select('_id').lean();
    const visibleIds = visibleAudits.map(a => a._id);
    const items = await Industrialization.find({
      auditId: { $in: visibleIds },
      isArchived: showArchived ? true : { $ne: true },
    })
      .populate('processId', 'procId name')
      .sort({ createdAt: -1 })
      .lean();

    const auditIds = [...new Set(items.map((i) => String(i.auditId)))];
    const ucIds = [...new Set(items.map((i) => String(i.useCaseId)))];
    const pocIds = [...new Set(items.map((i) => String(i.pocId)))];

    const [audits, useCases, pocs] = await Promise.all([
      Audit.find({ _id: { $in: auditIds } }).select('name client startDate targetEndDate').lean(),
      UseCase.find({ _id: { $in: ucIds } }).select('cuId description').lean(),
      POC.find({ _id: { $in: pocIds } }).select('pocId name phase decision design').lean(),
    ]);

    const auditMap = Object.fromEntries(audits.map((a) => [String(a._id), a]));
    const ucMap = Object.fromEntries(useCases.map((u) => [String(u._id), u]));
    const pocMap = Object.fromEntries(pocs.map((p) => [String(p._id), p]));

    const enriched = items.map((i) => ({
      ...i,
      audit: auditMap[String(i.auditId)] ?? null,
      useCase: ucMap[String(i.useCaseId)] ?? null,
      poc: pocMap[String(i.pocId)] ?? null,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
