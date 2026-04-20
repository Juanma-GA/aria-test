import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase, Process, Audit } from '@/lib/models';

function scoreTotal(score: any): number {
  if (!score?.dimensions) return 0;
  return Object.values(score.dimensions).reduce((s: number, d: any) => s + (d?.value ?? 0), 0) as number;
}

function scoreCategory(total: number, d6: number): string {
  if (total >= 22 && d6 >= 4) return 'Quick Win';
  if (total >= 14) return 'Mid-term';
  return 'Strategic';
}

function escapeCsv(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: any[]): string {
  return cells.map(escapeCsv).join(',');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;

    const [audit, useCases, processes] = await Promise.all([
      Audit.findById(auditId).select('name client').lean() as any,
      UseCase.find({ auditId }).sort({ cuId: 1 }).lean(),
      Process.find({ auditId }).select('_id procId name b1 b3').lean(),
    ]);

    const procMap = new Map(processes.map((p: any) => [String(p._id), p]));

    const headers = [
      'UC ID', 'Process', 'Description', 'AI Types',
      'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'Total Score', 'Category',
      'Time Saved (h/run)', 'Annual Saving (€)', 'Dev Cost (€)', 'Impl. Weeks', 'Status', 'Notes',
    ];

    const rows: string[] = [row(headers)];

    for (const uc of useCases as any[]) {
      const proc = procMap.get(String(uc.processId));
      const d = uc.score?.dimensions ?? {};
      const d1 = d.d1_efficiencyImpact?.value ?? 0;
      const d2 = d.d2_qualityImpact?.value ?? 0;
      const d3 = d.d3_techMaturity?.value ?? 0;
      const d4 = d.d4_dataReadiness?.value ?? 0;
      const d5 = d.d5_sovereigntyIndex?.value ?? 0;
      const d6 = d.d6_governanceComplexity?.value ?? 0;
      const total = scoreTotal(uc.score);
      const category = scoreCategory(total, d6);

      const timeSaved = (uc.timeSavedPerProfile ?? []).reduce((s: number, e: any) => s + (e.hoursPerExecution ?? 0), 0);
      const annualReps = proc?.b3?.annualRepetitions ?? 0;
      const profiles: any[] = proc?.b1?.profiles ?? [];
      const rates = profiles.map((p: any) => p.hourlyRateEur ?? 0).filter((r: number) => r > 0);
      const avgRate = rates.length ? rates.reduce((s: number, r: number) => s + r, 0) / rates.length : 0;
      const annualSaving = Math.round(timeSaved * avgRate * annualReps);

      rows.push(row([
        uc.cuId,
        proc ? `${proc.procId} – ${proc.name}` : '—',
        uc.description,
        (uc.aiTypes ?? []).join('; '),
        d1, d2, d3, d4, d5, d6,
        total,
        category,
        timeSaved,
        annualSaving,
        uc.estimatedDevCostEur ?? 0,
        uc.estimatedImplWeeks ?? 0,
        uc.status,
        uc.notes ?? '',
      ]));
    }

    const csv = '\uFEFF' + rows.join('\r\n'); // BOM for Excel UTF-8
    const auditName = (audit?.name ?? 'audit').replace(/[^a-z0-9]/gi, '_');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${auditName}_use_cases.csv"`,
      },
    });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
