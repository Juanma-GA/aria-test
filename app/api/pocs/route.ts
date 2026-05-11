import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit, UseCase } from '@/lib/models';
import { visibilityFilter } from '@/lib/auditAccess';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const visibility = visibilityFilter(req);
    if (!visibility) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const visibleAudits = await Audit.find(visibility).select('_id').lean();
    const visibleIds = visibleAudits.map(a => a._id);
    const pocs = await POC.find({ auditId: { $in: visibleIds } })
      .populate('processId', 'procId name')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with audit name and use case description
    const auditIds = [...new Set(pocs.map((p) => String(p.auditId)))];
    const ucIds = [...new Set(pocs.map((p) => String(p.useCaseId)))];

    const [audits, useCases] = await Promise.all([
      Audit.find({ _id: { $in: auditIds } }).select('name client startDate targetEndDate').lean(),
      UseCase.find({ _id: { $in: ucIds } }).select('cuId description').lean(),
    ]);

    const auditMap = Object.fromEntries(audits.map((a) => [String(a._id), a]));
    const ucMap = Object.fromEntries(useCases.map((u) => [String(u._id), u]));

    const enriched = pocs.map((p) => ({
      ...p,
      audit: auditMap[String(p.auditId)] ?? null,
      useCase: ucMap[String(p.useCaseId)] ?? null,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
