import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit, UseCase } from '@/lib/models';

export async function GET() {
  try {
    await dbConnect();
    const pocs = await POC.find({})
      .populate('processId', 'procId name')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with audit name and use case description
    const auditIds = Array.from(new Set(pocs.map((p) => String(p.auditId))));
    const ucIds = Array.from(new Set(pocs.map((p) => String(p.useCaseId))));

    const [audits, useCases] = await Promise.all([
      Audit.find({ _id: { $in: auditIds } })
        .select('name client')
        .lean(),
      UseCase.find({ _id: { $in: ucIds } })
        .select('cuId description')
        .lean(),
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
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
