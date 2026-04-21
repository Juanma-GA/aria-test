import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase, Audit, Process } from '@/lib/models';

export async function GET() {
  try {
    await dbConnect();
    const useCases = await UseCase.find({}).sort({ createdAt: -1 }).lean();

    const auditIds = Array.from(new Set(useCases.map((u) => String((u as any).auditId))));
    const processIds = Array.from(new Set(useCases.map((u) => String((u as any).processId))));

    const [audits, processes] = await Promise.all([
      Audit.find({ _id: { $in: auditIds } }).select('name client').lean(),
      Process.find({ _id: { $in: processIds } }).select('procId name b1 b3').lean(),
    ]);

    const auditMap = Object.fromEntries(audits.map((a) => [String(a._id), a]));
    const processMap = Object.fromEntries(processes.map((p) => [String(p._id), p]));

    const enriched = useCases.map((u) => {
      const proc = processMap[String((u as any).processId)] ?? null;
      return {
        ...u,
        audit: auditMap[String((u as any).auditId)] ?? null,
        process: proc
          ? { _id: (proc as any)._id, procId: (proc as any).procId, name: (proc as any).name }
          : null,
        processData: proc
          ? {
              b1Profiles: (proc as any).b1?.profiles ?? [],
              annualRepetitions: (proc as any).b3?.annualRepetitions ?? 0,
              totalProcessHoursPerRun: ((proc as any).b3?.activities ?? []).reduce(
                (s: number, a: any) => s + (a.estimatedTimeHours ?? 0), 0
              ),
              activities: ((proc as any).b3?.activities ?? []).map((a: any) => ({
                id: a.id,
                name: a.name,
              })),
            }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
