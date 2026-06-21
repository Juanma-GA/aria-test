import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC } from '@/lib/models';
import { calculateScore } from '@/lib/calculations';
import { computeUCRoi } from '@/lib/pocRoi';
import { nextSequence } from '@/lib/models/Counter';
import { createAuditSchema, validationErrorResponse } from '@/lib/validators';
import { requireRole } from '@/lib/auth';
import { visibilityFilter } from '@/lib/auditAccess';

export async function GET(_req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(_req.url);
    const showArchived = searchParams.get('archived') === 'true';
    const visibility = visibilityFilter(_req);
    if (!visibility) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const auditFilter = {
      ...visibility,
      ...(showArchived ? { isArchived: true } : { isArchived: { $ne: true } }),
    };
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
    const notArchived = { isArchived: { $ne: true } };
    const [allPocs, allProcesses, allUseCases] = await Promise.all([
      POC.find({ ...notArchived }).select('auditId phase useCaseIds useCaseId').lean(),
      Process.find({ auditId: { $in: auditIds } }).select('auditId _id b1 b3').lean(),
      UseCase.find({ auditId: { $in: auditIds }, ...notArchived })
        .select('auditId processId status isArchived score timeSavedPerProfile computeBreakdown estimatedDevCostEur additionalDevCostEur isInstance')
        .populate('processId', 'b1.profiles b3.annualRepetitions')
        .lean(),
    ]);

    // Build ucId → auditId map from ALL UCs referenced by POCs, INCLUDING archived ones.
    // A POC whose reference/instance UC is archived must still resolve its audit, otherwise
    // it is dropped from the count (allUseCases excludes archived, so it can't be used here).
    const referencedUcIds = new Set<string>();
    for (const poc of allPocs) {
      for (const id of ((poc as any).useCaseIds ?? [])) referencedUcIds.add(String(id));
      if ((poc as any).useCaseId) referencedUcIds.add(String((poc as any).useCaseId));
    }
    const ucAuditMap = new Map<string, string>();
    if (referencedUcIds.size > 0) {
      const refUcs = await UseCase.find({ _id: { $in: [...referencedUcIds] } })
        .select('auditId')
        .lean();
      for (const uc of refUcs) {
        ucAuditMap.set(String((uc as any)._id), String((uc as any).auditId));
      }
    }
    // Group POCs by EVERY audit any of their UCs (parent or instance) belongs to.
    // Mirrors the /pocs view ($in over the whole useCaseIds array): a POC with
    // instances in multiple audits is counted in each of them — but only once per
    // audit (dedupe via a Set), since multiple UCs may share the same audit.
    const pocsByAudit = new Map<string, { design: number; execution: number; evaluation: number; closed: number }>();
    for (const poc of allPocs) {
      const ucIds: string[] = [
        ...((poc as any).useCaseIds ?? []).map((id: any) => String(id)),
        ...((poc as any).useCaseId ? [String((poc as any).useCaseId)] : []),
      ];
      const auditsForPoc = new Set<string>();
      for (const ucId of ucIds) {
        const aid = ucAuditMap.get(ucId);
        if (aid) auditsForPoc.add(aid);
      }
      const phase = (poc as any).phase as string;
      for (const aid of auditsForPoc) {
        if (!pocsByAudit.has(aid)) pocsByAudit.set(aid, { design: 0, execution: 0, evaluation: 0, closed: 0 });
        const entry = pocsByAudit.get(aid)!;
        if (phase in entry) (entry as any)[phase]++;
      }
    }

    // Group processes by audit
    const processesByAudit = new Map<string, any[]>();
    for (const proc of allProcesses) {
      const aid = String((proc as any).auditId);
      if (!processesByAudit.has(aid)) processesByAudit.set(aid, []);
      processesByAudit.get(aid)!.push(proc);
    }

    // Group use cases by audit (scoped: eligible/in_poc, not archived)
    const scopedUcsByAudit = new Map<string, any[]>();
    for (const uc of allUseCases) {
      const aid = String((uc as any).auditId);
      // In-scope: eligible/in_poc, not archived
      if ((uc as any).status === 'eligible' || (uc as any).status === 'in_poc') {
        if (!(uc as any).isArchived) {
          if (!scopedUcsByAudit.has(aid)) scopedUcsByAudit.set(aid, []);
          scopedUcsByAudit.get(aid)!.push(uc);
        }
      }
    }

    // Helper to resolve process for UC (populated or fallback)
    const getUCProcess = (uc: any, procMap: Map<string, any>): any => {
      const procId = (uc as any).processId;
      if (procId && typeof procId === 'object' && (procId.b1 || procId.b3)) {
        return procId;
      }
      return procMap.get(String(procId)) ?? null;
    };

    const enriched = audits.map((a) => {
      const aid = String(a._id);
      const procs = processesByAudit.get(aid) ?? [];
      const scopedUCs = scopedUcsByAudit.get(aid) ?? [];

      const procMap = new Map(procs.map((p: any) => [String(p._id), p]));

      // People impacted: from scoped UCs only
      let totalPeople = 0;
      const profiled = new Set<string>();
      for (const uc of scopedUCs) {
        const ucProcess = getUCProcess(uc, procMap);
        const profiles: any[] = (typeof ucProcess === 'object' ? ucProcess?.b1?.profiles : null) ?? [];
        for (const profile of profiles) {
          const key = `${aid}-${profile.id}`;
          if (!profiled.has(key)) {
            totalPeople += profile.count ?? 0;
            profiled.add(key);
          }
        }
      }

      // Sum all activity hours per run across all processes in this audit
      let totalProcessHoursPerRun = 0;
      for (const proc of procs) {
        const acts: any[] = proc.b3?.activities ?? [];
        totalProcessHoursPerRun += acts.reduce((s: number, act: any) => s + (act.estimatedTimeHours ?? 0), 0);
      }

      // Calculate annual process cost per audit (Σ hours × avgRate × annualReps per process)
      let totalProcessCostPerYear = 0;
      for (const proc of procs) {
        const acts: any[] = proc.b3?.activities ?? [];
        const totalProcHours = acts.reduce((s: number, act: any) => s + (act.estimatedTimeHours ?? 0), 0);
        const profiles: any[] = proc.b1?.profiles ?? [];
        const rates = profiles.map((p: any) => p.hourlyRateEur ?? 0).filter((r: number) => r > 0);
        const avgRate = rates.length > 0 ? rates.reduce((s: number, r: number) => s + r, 0) / rates.length : 0;
        const annualReps: number = proc.b3?.annualRepetitions ?? 0;
        totalProcessCostPerYear += totalProcHours * avgRate * annualReps;
      }

      // Compute savings per use case (scoped) and classify by score category
      let totalAnnualSavingEur = 0;
      let totalHoursSavedPerRun = 0;
      const byCategory = { quickWin: 0, midTerm: 0, strategic: 0 };
      const savingsByCategory = { quickWin: 0, midTerm: 0, strategic: 0 };

      for (const uc of scopedUCs) {
        const proc = getUCProcess(uc, procMap);
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

      // New metrics: scoped ROI aggregates
      let totalNetAnnualSaving = 0;
      let totalComputeCostPerYear = 0;
      let totalDevCost = 0;
      for (const uc of scopedUCs) {
        const ucProcess = getUCProcess(uc, procMap);
        const roi = computeUCRoi(uc, ucProcess);
        totalNetAnnualSaving += roi.net;
        totalComputeCostPerYear += roi.compute;
        totalDevCost += roi.dev;
      }
      const paybackMonths = totalDevCost > 0 && totalNetAnnualSaving > 0
        ? totalDevCost / (totalNetAnnualSaving / 12)
        : 0;

      // POC count: non-archived only
      const pocPhases = pocsByAudit.get(aid) ?? { design: 0, execution: 0, evaluation: 0, closed: 0 };
      const pocCount = Object.values(pocPhases).reduce((s, n) => s + n, 0);

      return {
        ...a,
        processCount: procs.length,
        useCaseCount: scopedUCs.length,
        pocCount,
        totalPeople,
        pocsByPhase: pocPhases,
        useCasesByCategory: byCategory,
        savingsByCategory,
        totalAnnualSavingEur,
        totalHoursSavedPerRun,
        totalProcessHoursPerRun,
        totalNetAnnualSaving,
        totalComputeCostPerYear,
        totalDevCost,
        paybackMonths,
        totalProcessCostPerYear,
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
    const { name, client, project, sector, classification, startDate, targetEndDate, firstProcess, team: extraTeam } = parsed.data;

    const auditSeq = await nextSequence('audit');
    const auditCode = `AUD-${String(auditSeq).padStart(3, '0')}`;

    // Always include the creator as owner; merge extra members from the form (deduped by userId).
    const now = new Date();
    const seen = new Set<string>();
    const team: { userId: mongoose.Types.ObjectId; role: 'owner' | 'editor' | 'viewer'; addedAt: Date; addedBy?: mongoose.Types.ObjectId }[] = [];
    if (userId) {
      team.push({ userId: new mongoose.Types.ObjectId(userId), role: 'owner', addedAt: now, addedBy: new mongoose.Types.ObjectId(userId) });
      seen.add(userId);
    }
    for (const m of extraTeam ?? []) {
      if (seen.has(m.userId)) continue;
      team.push({ userId: new mongoose.Types.ObjectId(m.userId), role: m.role, addedAt: now, addedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined });
      seen.add(m.userId);
    }

    const audit = await Audit.create({
      name,
      client,
      project: project || '',
      sector,
      classification,
      leadConsultant: userId,
      team,
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
