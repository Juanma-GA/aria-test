import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Roadmap, Audit, UseCase } from '@/lib/models';

export async function GET() {
  try {
    await dbConnect();

    const roadmaps = await Roadmap.find({}).lean();

    const auditIds = roadmaps.map((r) => String(r.auditId));
    const audits = await Audit.find({ _id: { $in: auditIds } })
      .select('name client')
      .lean();
    const auditMap = Object.fromEntries(audits.map((a) => [String(a._id), a]));

    // Collect all useCaseIds across all initiatives
    const allInitiatives = roadmaps.flatMap((r) => [
      ...(r.horizons?.h1_quickWins ?? []),
      ...(r.horizons?.h2_midTerm ?? []),
      ...(r.horizons?.h3_strategic ?? []),
    ]);
    const ucIds = Array.from(
      new Set(
        allInitiatives.map((i: any) => String(i.useCaseId)).filter(Boolean),
      ),
    );
    const useCases = await UseCase.find({ _id: { $in: ucIds } })
      .select('cuId')
      .lean();
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
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
