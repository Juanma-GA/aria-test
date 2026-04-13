import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Roadmap } from '@/lib/models';

function getSovereigntyIndex(b2: any): number | null {
  if (!b2?.axes) return null;
  const vals = (Object.values(b2.axes) as any[])
    .map((a) =>
      a.status === 'green' ? 5 : a.status === 'amber' ? 3 : a.status === 'red' ? 1 : null
    )
    .filter((v) => v !== null) as number[];
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;

    const audit = await Audit.findById(auditId)
      .populate('leadConsultant', 'name')
      .lean();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const [processCount, useCaseCount, pocCount, processes, allUseCases] = await Promise.all([
      Process.countDocuments({ auditId }),
      UseCase.countDocuments({ auditId }),
      POC.countDocuments({ auditId }),
      Process.find({ auditId }).lean(),
      UseCase.find({ auditId, status: 'eligible' }).lean(),
    ]);

    const ucByProcess: Record<string, any[]> = {};
    for (const uc of allUseCases) {
      const pid = String(uc.processId);
      if (!ucByProcess[pid]) ucByProcess[pid] = [];
      ucByProcess[pid].push(uc);
    }

    const processesWithMetrics = processes.map((p) => {
      const activities: any[] = (p.b3 as any)?.activities ?? [];
      const annualReps: number = (p.b3 as any)?.annualRepetitions ?? 1;

      // Total annual hours per process
      // estimatedTimeHours already includes stepRepetitions (recalcTime = sum(ph.hours) × stepReps)
      const totalAnnualHours = activities.reduce((s: number, a: any) =>
        s + (Number(a.estimatedTimeHours) || 0) * annualReps, 0
      );

      // Profile cost: hours × hourlyRate per profile
      const profiles: any[] = (p.b1 as any)?.profiles ?? [];
      const profileCostMap: Record<string, number> = {};
      for (const pr of profiles) profileCostMap[pr.id] = pr.hourlyRateEur ?? 0;

      let totalAnnualCostEur = 0;
      for (const a of activities) {
        const phList: any[] = a.profileHours ?? [];
        for (const ph of phList) {
          const rate = profileCostMap[ph.profileId] ?? 0;
          totalAnnualCostEur += (ph.hours ?? 0) * (Number(a.stepRepetitions) || 1) * annualReps * rate;
        }
      }

      // Eligible use case metrics
      const pUCs = ucByProcess[String(p._id)] ?? [];
      const totalDevCostEur = pUCs.reduce((s: number, u: any) => s + (u.estimatedDevCostEur ?? 0), 0);
      const totalTimeSavedHoursPerRun = pUCs.reduce((s: number, u: any) =>
        s + (u.timeSavedPerProfile ?? []).reduce((ss: number, e: any) => ss + (e.hoursPerExecution ?? 0), 0), 0
      );
      const projectedAnnualSavingEur = pUCs.reduce((s: number, u: any) =>
        s + (u.timeSavedPerProfile ?? []).reduce((ss: number, e: any) => {
          const rate = profileCostMap[e.profileId] ?? 0;
          return ss + (e.hoursPerExecution ?? 0) * annualReps * rate;
        }, 0), 0
      );
      const roi = totalDevCostEur > 0 && projectedAnnualSavingEur > 0
        ? Math.round(((projectedAnnualSavingEur - totalDevCostEur) / totalDevCostEur) * 100)
        : null;

      const peopleCount = profiles.reduce((s: number, pr: any) => s + (pr.count ?? 0), 0);

      return {
        ...p,
        sovereigntyIndex: getSovereigntyIndex(p.b2),
        peopleCount,
        metrics: {
          totalAnnualHours: Math.round(totalAnnualHours * 10) / 10,
          totalHoursPerRun: Math.round(activities.reduce((s: number, a: any) =>
            s + (Number(a.estimatedTimeHours) || 0), 0) * 10) / 10,
          annualReps,
          totalAnnualCostEur: Math.round(totalAnnualCostEur),
          eligibleUCCount: pUCs.length,
          totalDevCostEur,
          totalTimeSavedHoursPerRun: Math.round(totalTimeSavedHoursPerRun * 10) / 10,
          projectedAnnualSavingEur: Math.round(projectedAnnualSavingEur),
          roiPercent: roi,
        },
      };
    });

    return NextResponse.json({
      ...audit,
      processCount,
      useCaseCount,
      pocCount,
      processes: processesWithMetrics,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const body = await req.json();
    const { name, client, project, sector, classification, status, startDate, targetEndDate, isArchived } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (client !== undefined) updateData.client = client;
    if (project !== undefined) updateData.project = project;
    if (sector !== undefined) updateData.sector = sector;
    if (classification !== undefined) updateData.classification = classification;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (targetEndDate !== undefined) updateData.targetEndDate = new Date(targetEndDate);
    if (isArchived !== undefined) updateData.isArchived = isArchived;

    const audit = await Audit.findByIdAndUpdate(auditId, updateData, { new: true }).lean();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    return NextResponse.json(audit);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const userRole = req.headers.get('x-user-role');

    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const audit = await Audit.findById(auditId);
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    await Promise.all([
      Process.deleteMany({ auditId }),
      UseCase.deleteMany({ auditId }),
      POC.deleteMany({ auditId }),
      Roadmap.deleteOne({ auditId }),
    ]);
    await Audit.findByIdAndDelete(auditId);

    return NextResponse.json({ message: 'Audit deleted successfully' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
