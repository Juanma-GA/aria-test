import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Audit } from '@/lib/models';

function escapeCsv(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: any[]): string {
  return cells.map(escapeCsv).join(',');
}

const fmt = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  try {
    await dbConnect();
    const { auditId } = await params;

    const [audit, pocs] = await Promise.all([
      Audit.findById(auditId).select('name').lean() as any,
      POC.find({ auditId })
        .populate('useCaseId', 'cuId description')
        .populate('processId', 'procId name')
        .lean(),
    ]);

    const headers = [
      'POC ID',
      'Use Case',
      'Process',
      'Phase',
      'Decision',
      'Objective',
      'Start',
      'Deadline',
      'Milestones Done',
      'Results',
      'Actual Cost (€)',
      'Technical Lessons',
      'Org. Lessons',
    ];

    const rows: string[] = [row(headers)];

    for (const poc of pocs as any[]) {
      const milestones: any[] = poc.execution?.milestones ?? [];
      const doneMilestones = milestones.filter(
        (m: any) => m.status === 'done',
      ).length;

      rows.push(
        row([
          poc.pocId,
          poc.useCaseId?.cuId ?? '—',
          poc.processId
            ? `${poc.processId.procId} – ${poc.processId.name}`
            : '—',
          poc.phase,
          poc.decision?.decision ?? 'pending',
          poc.design?.measurableObjective ?? '—',
          fmt(poc.design?.startDate),
          fmt(poc.design?.deadlineDate),
          `${doneMilestones}/${milestones.length}`,
          poc.evaluation?.resultsVsCriteria ?? '—',
          poc.evaluation?.actualCostEur ?? 0,
          poc.evaluation?.technicalLessons ?? '—',
          poc.evaluation?.organisationalLessons ?? '—',
        ]),
      );
    }

    const csv = '\uFEFF' + rows.join('\r\n');
    const auditName = (audit?.name ?? 'audit').replace(/[^a-z0-9]/gi, '_');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${auditName}_pocs.csv"`,
      },
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
