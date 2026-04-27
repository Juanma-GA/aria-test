import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process, Audit } from '@/lib/models';

function escapeCsv(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: any[]): string {
  return cells.map(escapeCsv).join(',');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  try {
    await dbConnect();
    const { auditId } = await params;

    const [audit, processes] = await Promise.all([
      Audit.findById(auditId).select('name').lean() as any,
      Process.find({ auditId }).sort({ procId: 1 }).lean(),
    ]);

    const headers = [
      'Process ID',
      'Process Name',
      'Department',
      'Responsible',
      'Activity',
      'Tools',
      'Inputs',
      'Outputs',
      'Hours/Run',
      'Step Reps',
      'Annual Reps',
      'Total Hours/Year',
      'Profiles',
    ];

    const rows: string[] = [row(headers)];

    for (const proc of processes as any[]) {
      const activities: any[] = proc.b3?.activities ?? [];
      const annualReps: number = proc.b3?.annualRepetitions ?? 0;
      const profiles: any[] = proc.b1?.profiles ?? [];
      const profilesStr = profiles
        .map((p: any) => `${p.role} ×${p.count} @€${p.hourlyRateEur}/h`)
        .join('; ');

      if (activities.length === 0) {
        rows.push(
          row([
            proc.procId,
            proc.name,
            proc.department ?? '',
            proc.responsible ?? '',
            '—',
            '',
            '',
            '',
            '',
            '',
            annualReps,
            '',
            profilesStr,
          ]),
        );
      } else {
        activities.forEach((act: any, idx: number) => {
          const stepReps = act.stepRepetitions ?? 1;
          const hrsRun = act.estimatedTimeHours ?? 0;
          rows.push(
            row([
              idx === 0 ? proc.procId : '',
              idx === 0 ? proc.name : '',
              idx === 0 ? (proc.department ?? '') : '',
              idx === 0 ? (proc.responsible ?? '') : '',
              act.name ?? '',
              (act.tools ?? []).join('; '),
              (act.inputs ?? []).join('; '),
              (act.outputs ?? []).join('; '),
              hrsRun,
              stepReps,
              annualReps,
              Math.round(hrsRun * stepReps * annualReps * 10) / 10,
              idx === 0 ? profilesStr : '',
            ]),
          );
        });
      }
    }

    const csv = '\uFEFF' + rows.join('\r\n');
    const auditName = (audit?.name ?? 'audit').replace(/[^a-z0-9]/gi, '_');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${auditName}_processes.csv"`,
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
