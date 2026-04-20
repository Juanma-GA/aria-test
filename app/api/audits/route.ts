import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC } from '@/lib/models';
import { calculateScore } from '@/lib/calculations';
import { nextSequence } from '@/lib/models/Counter';
import { createAuditSchema, validationErrorResponse } from '@/lib/validators';
import { requireRole } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(_req.url);
    const showArchived = searchParams.get('archived') === 'true';
    const auditFilter = showArchived ? { isArchived: true } : { isArchived: { $ne: true } };
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limitRaw = parseInt(searchParams.get('limit') ?? '0', 10);
    const limit = limitRaw > 0 && limitRaw <= 100 ? limitRaw : 0;
    const skip = limit > 0 ? (page - 1) * limit : 0;

    const auditQuery = Audit.find(auditFilter)
      .sort({ updatedAt: -1 })
      .populate('leadConsultant', 'name');
    if (limit > 0) auditQuery.skip(skip).limit(limit);
    const audits = await auditQuery.lean();

    const auditIds = audits.map((a) => a._id);
    const [allPocs, allProcesses, allUseCases] = await Promise.all([
      POC.find({ auditId: { $in: auditIds } }).select('auditId phase').lean(),
      Process.find({ auditId: { $in: auditIds } }).select('auditId _id b1 b3').lean(),
      UseCase.find({ auditId: { $in: auditIds } }).select('auditId processId score status timeSavedPerProfile').lean(),
    ]);

    // Group POCs by audit → phase counts
    const pocsByAudit = new Map<string, { design: number; execution: number; evaluation: number; closed: number }>();
    for (const poc of allPocs) {
      const aid = String((poc as any).auditId);
      if (!pocsByAudit.has(aid)) pocsByAudit.set(aid, { design: 0, execution: 0, evaluation: 0, closed: 0 });
      const entry = pocsByAudit.get(aid)!;
      const phase = (poc as any).phase as string;
      if (phase in entry) (entry as any)[phase]++;
    }

    // Group processes by audit
    const processesByAudit = new Map<string, any[]>();
    for (const proc of allProcesses) {
      const aid = String((proc as any).auditId);
      if (!processesByAudit.has(aid)) processesByAudit.set(aid, []);
      processesByAudit.get(aid)!.push(proc);
    }

    // Group use cases by audit
    const ucsByAudit = new Map<string, any[]>();
    for (const uc of allUseCases) {
      const aid = String((uc as any).auditId);
      if (!ucsByAudit.has(aid)) ucsByAudit.set(aid, []);
      ucsByAudit.get(aid)!.push(uc);
    }

    const enriched = audits.map((a) => {
      const aid = String(a._id);
      const procs = processesByAudit.get(aid) ?? [];
      const useCases = ucsByAudit.get(aid) ?? [];
      const pocPhases = pocsByAudit.get(aid) ?? { design: 0, execution: 0, evaluation: 0, closed: 0 };
      const pocCount = Object.values(pocPhases).reduce((s, n) => s + n, 0);

      const procMap = new Map(procs.map((p: any) => [String(p._id), p]));

      // People impacted: sum of profile counts across all processes
      let totalPeople = 0;
      for (const proc of procs) {
        const profiles: any[] = proc.b1?.profiles ?? [];
        totalPeople += profiles.reduce((s: number, p: any) => s + (p.count ?? 0), 0);
      }

      // Sum all activity hours per run across all processes in this audit
      let totalProcessHoursPerRun = 0;
      for (const proc of procs) {
        const acts: any[] = proc.b3?.activities ?? [];
        totalProcessHoursPerRun += acts.reduce((s: number, act: any) => s + (act.estimatedTimeHours ?? 0), 0);
      }

      // Compute savings per use case and classify by score category
      let totalAnnualSavingEur = 0;
      let totalHoursSavedPerRun = 0;
      const byCategory = { quickWin: 0, midTerm: 0, strategic: 0 };
      const savingsByCategory = { quickWin: 0, midTerm: 0, strategic: 0 };

      for (const uc of useCases) {
        const proc = procMap.get(String((uc as any).processId));
        const annualReps: number = proc?.b3?.annualRepetitions ?? 0;
        const profiles: any[] = proc?.b1?.profiles ?? [];
        const rates = profiles.map((p: any) => p.hourlyRateEur ?? 0).filter((r: number) => r > 0);
        const avgRate = rates.length > 0 ? rates.reduce((s: number, r: number) => s + r, 0) / rates.length : 0;
        const timeSaved: number = ((uc as any).timeSavedPerProfile ?? []).reduce(
          (s: number, e: any) => s + (e.hoursPerExecution ?? 0), 0
        );
        const ucSaving = timeSaved * avgRate * annualReps;

        if (timeSaved > 0 && annualReps > 0 && avgRate > 0) {
          totalHoursSavedPerRun += timeSaved;
          totalAnnualSavingEur += ucSaving;
        }

        const dims = (uc as any).score?.dimensions;
        if (!dims) {
          byCategory.strategic++;
          savingsByCategory.strategic += ucSaving;
          continue;
        }
        const { category } = calculateScore(dims);
        if (category === 'quick_win') { byCategory.quickWin++; savingsByCategory.quickWin += ucSaving; }
        else if (category === 'mid_term') { byCategory.midTerm++; savingsByCategory.midTerm += ucSaving; }
        else { byCategory.strategic++; savingsByCategory.strategic += ucSaving; }
      }

      return {
        ...a,
        processCount: procs.length,
        useCaseCount: useCases.length,
        pocCount,
        totalPeople,
        pocsByPhase: pocPhases,
        useCasesByCategory: byCategory,
        savingsByCategory,
        totalAnnualSavingEur,
        totalHoursSavedPerRun,
        totalProcessHoursPerRun,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const forbidden = requireRole(req, ['admin', 'consultant']);
  if (forbidden) return forbidden;
  try {
    await dbConnect();
    const userId = req.headers.get('x-user-id');
    const body = await req.json();
    const parsed = createAuditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: 400 });
    }
    const { name, client, project, sector, classification, startDate, targetEndDate, firstProcess } = parsed.data;

    const auditSeq = await nextSequence('audit');
    const auditCode = `AUD-${String(auditSeq).padStart(3, '0')}`;

    const audit = await Audit.create({
      name,
      client,
      project: project || '',
      sector,
      classification,
      leadConsultant: userId,
      startDate: startDate ? new Date(startDate) : undefined,
      targetEndDate: targetEndDate ? new Date(targetEndDate) : undefined,
      status: 'active',
      auditCode,
    });

    let process = null;
    if (firstProcess?.name?.trim()) {
      const procSeq = await nextSequence(`process:${audit._id}`);
      process = await Process.create({
        auditId: audit._id,
        procId: `${auditCode}-P${String(procSeq).padStart(2, '0')}`,
        name: firstProcess.name,
        department: firstProcess.department || '',
        responsible: firstProcess.responsible || '',
        sector,
        applicableNorms: firstProcess.applicableNorms || [],
        priority: firstProcess.priority || 'medium',
        status: 'pending',
      });
    }

    return NextResponse.json({ audit, process }, { status: 201 });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
