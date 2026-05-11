import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Roadmap, Audit, UseCase } from '@/lib/models';
import { visibilityFilter } from '@/lib/auditAccess';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const visibility = visibilityFilter(req);
    if (!visibility) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const visibleAudits = await Audit.find(visibility).select('_id').lean();
    const visibleIds = visibleAudits.map(a => a._id);
    const roadmaps = await Roadmap.find({ auditId: { $in: visibleIds } }).lean();

    const auditIds = roadmaps.map((r) => String(r.auditId));
    const audits = await Audit.find({ _id: { $in: auditIds } }).select('name client').lean();
    const auditMap = Object.fromEntries(audits.map((a) => [String(a._id), a]));

    // Collect all useCaseIds across all initiatives
    const allInitiatives = roadmaps.flatMap((r) => [
      ...(r.horizons?.h1_quickWins ?? []),
      ...(r.horizons?.h2_midTerm ?? []),
      ...(r.horizons?.h3_strategic ?? []),
    ]);
    const ucIds = [...new Set(allInitiatives.map((i) => String(i.useCaseId)).filter(Boolean))];
    const useCases = await UseCase.find({ _id: { $in: ucIds } }).select('cuId').lean();
    const ucMap = Object.fromEntries(useCases.map((u) => [String(u._id), u]));

    const enriched = roadmaps.map((r) => {
      const audit = auditMap[String(r.auditId)] ?? null;
      const enrichHorizon = (items: any[]) =>
        (items ?? []).map((i) => ({
          ...i,
          useCase: ucMap[String(i.useCaseId)] ?? null,
        }));
      return {
        ...r,
        audit,
        horizons: {
          h1_quickWins: enrichHorizon(r.horizons?.h1_quickWins),
          h2_midTerm: enrichHorizon(r.horizons?.h2_midTerm),
          h3_strategic: enrichHorizon(r.horizons?.h3_strategic),
        },
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
