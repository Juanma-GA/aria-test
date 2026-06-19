import { computeAnnualCompute } from '@/lib/calculations';

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmt = (d: Date | string | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

export const fmtEur = (n: number) =>
  n >= 1_000_000
    ? `€${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `€${Math.round(n / 1000)}k`
      : `€${Math.round(n)}`;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function implWeeksForUC(uc: any): number {
  if (uc.isInstance) {
    return Math.round(((uc.additionalDevCostEur ?? 0) / (uc.devRateEur ?? 450)) / 5 * 10) / 10;
  }
  return uc.estimatedImplWeeks ?? 0;
}

function scoreTotal(score: any): number {
  if (!score?.dimensions) return 0;
  return Object.values(score.dimensions).reduce(
    (s: number, d: any) => s + (d?.value ?? 0),
    0,
  ) as number;
}

function scoreCategory(score: any): string {
  if (!score?.dimensions) return 'Strategic';
  const total = scoreTotal(score);
  const d6 = score.dimensions?.d6_governanceComplexity?.value ?? 0;
  if (total >= 22 && d6 >= 4) return 'Quick Win';
  if (total >= 14) return 'Mid-term';
  return 'Strategic';
}

function sovereigntyLevel(axes: Record<string, any>): {
  index: number;
  level: string;
} {
  const vals = Object.values(axes)
    .map((a: any) =>
      a.status === 'green'
        ? 5
        : a.status === 'amber'
          ? 3
          : a.status === 'red'
            ? 1
            : 0,
    )
    .filter((v) => v > 0);
  if (!vals.length) return { index: 0, level: 'Not assessed' };
  const index = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
  const level =
    index >= 4.5
      ? 'Full Autonomy'
      : index >= 3.5
        ? 'Managed'
        : index >= 2.5
          ? 'Conditioned'
          : index >= 1.5
            ? 'Restricted'
            : 'Critical';
  return { index: Math.round(index * 10) / 10, level };
}

function industrializationOneTime(ind: any): number {
  const o = ind?.cost?.oneTime ?? {};
  const sub =
    (o.developmentEur ?? 0) +
    (o.integrationEur ?? 0) +
    (o.infraSetupEur ?? 0) +
    (o.securityComplianceEur ?? 0) +
    (o.trainingChangeMgmtEur ?? 0);
  const contingency = sub * ((o.contingencyPct ?? 0) / 100);
  return sub + contingency;
}

function milestoneProgressPct(m: any): number {
  if (m?.status === 'done') return 100;
  if (m?.status === 'missed' || m?.status === 'pending')
    return Math.max(0, Math.min(100, m?.progressPct ?? 0));
  // work_in_progress (or unknown active state): trust the explicit value, else assume halfway.
  const explicit = m?.progressPct;
  return explicit > 0 ? Math.min(100, explicit) : 50;
}

function industrializationRecurringAnnual(ind: any): number {
  const r = ind?.cost?.recurringAnnual ?? {};
  const m = r.maintenance ?? {};
  return (
    (r.computeEur ?? 0) +
    (r.licensesEur ?? 0) +
    (r.monitoringObservabilityEur ?? 0) +
    (m.correctiveEur ?? 0) +
    (m.evolutiveEur ?? 0) +
    (m.modelRetrainingEur ?? 0) +
    (m.driftMonitoringEur ?? 0) +
    (m.revalidationEur ?? 0) +
    (m.l1l2SupportEur ?? 0) +
    (m.vendorSlaEur ?? 0)
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AXIS_LABELS: Record<string, string> = {
  axis1_InfoClassification: 'Info Classification',
  axis2_ProcessSovereignty: 'Process Sovereignty',
  axis3_ToolSovereignty: 'Tool Sovereignty',
  axis4_DataSovereignty: 'Data Sovereignty',
  axis5_Infrastructure: 'Infrastructure',
};

const IND_STATUS_LABELS: Record<string, string> = {
  pending_customer_validation: 'Pending customer validation',
  planned: 'Planned',
  work_in_progress: 'Work in progress',
  go_for_run: 'Go for run',
  stand_by: 'Stand by',
  cancelled: 'Cancelled',
};

// ─── Main computation ──────────────────────────────────────────────────────────

export function computeAuditReportData(
  audit: any,
  processes: any[],
  useCases: any[],
  pocs: any[],
  industrializations: any[],
) {
  // ── Global metrics ──────────────────────────────────────────────────────────
  let totalPeople = 0;
  let totalAnnualHours = 0;
  let totalAnnualCostEur = 0;
  let totalAnnualSaving = 0;
  let totalComputeCostEur = 0;
  let totalDevCost = 0;
  let qwCount = 0,
    mtCount = 0,
    stCount = 0;

  const ucByProcess: Record<string, any[]> = {};
  const pocByUC: Record<string, any[]> = {};
  for (const uc of useCases) {
    const pid = String(uc.processId);
    if (!ucByProcess[pid]) ucByProcess[pid] = [];
    ucByProcess[pid].push(uc);
  }
  for (const poc of pocs) {
    const uid = String(poc.useCaseId?._id ?? poc.useCaseId);
    if (!pocByUC[uid]) pocByUC[uid] = [];
    pocByUC[uid].push(poc);
  }

  // Per-process metrics
  const processMetrics: Record<
    string,
    { annualReps: number; profiles: any[]; avgRate: number }
  > = {};
  for (const p of processes) {
    const profiles: any[] = p.b1?.profiles ?? [];
    const annualReps = p.b3?.annualRepetitions ?? 0;
    const rates = profiles
      .map((pr: any) => pr.hourlyRateEur ?? 0)
      .filter((r) => r > 0);
    const avgRate = rates.length
      ? rates.reduce((s: number, r: number) => s + r, 0) / rates.length
      : 0;
    processMetrics[String(p._id)] = { annualReps, profiles, avgRate };

    totalPeople += profiles.reduce(
      (s: number, pr: any) => s + (pr.count ?? 0),
      0,
    );
    const activities: any[] = p.b3?.activities ?? [];
    for (const act of activities) {
      const hrs = act.estimatedTimeHours ?? 0;
      const stepReps = act.stepRepetitions ?? 1;
      totalAnnualHours += hrs * annualReps;
      for (const ph of act.profileHours ?? []) {
        const profile = profiles.find((pr: any) => pr.id === ph.profileId);
        totalAnnualCostEur +=
          (ph.hours ?? 0) *
          stepReps *
          annualReps *
          (profile?.hourlyRateEur ?? 0);
      }
    }
  }

  // Per-UC compute cost — derived from the unified `computeBreakdown` calculator.
  function computeAnnualCostForUC(uc: any): number {
    return computeAnnualCompute(uc?.computeBreakdown ?? null).totalEur;
  }

  const eligibleUCs = useCases.filter((u) => u.status === 'eligible');
  const inPocUCs = useCases.filter((u) => u.status === 'in_poc');
  const discardedUCs = useCases.filter((u) => u.status === 'discarded');

  for (const uc of eligibleUCs) {
    const total = scoreTotal(uc.score);
    const cat = scoreCategory(uc.score);
    if (cat === 'Quick Win') qwCount++;
    else if (cat === 'Mid-term') mtCount++;
    else stCount++;
    totalDevCost += uc.estimatedDevCostEur ?? 0;

    const pid = String(uc.processId);
    const m = processMetrics[pid];
    if (m) {
      const timeSaved = (uc.timeSavedPerProfile ?? []).reduce(
        (s: number, e: any) => s + (e.hoursPerExecution ?? 0),
        0,
      );
      totalAnnualSaving += timeSaved * m.avgRate * m.annualReps;
    }
    totalComputeCostEur += computeAnnualCostForUC(uc);
  }

  const netAnnualSaving = Math.max(totalAnnualSaving - totalComputeCostEur, 0);
  const paybackMonths =
    totalDevCost > 0 && netAnnualSaving > 0
      ? Math.round((totalDevCost / netAnnualSaving) * 12)
      : null;

  const pocGo = pocs.filter(
    (p) =>
      p.decision?.decision === 'go' ||
      p.decision?.decision === 'go_conditional',
  ).length;
  const pocClosed = pocs.filter((p) => p.phase === 'closed' || p.phase === 'decision').length;
  const pocActive = pocs.filter((p) => p.phase !== 'closed' && p.phase !== 'decision').length;

  // ── Global sovereignty ──────────────────────────────────────────────────────
  const axisCountByStatus: Record<string, Record<string, number>> = {};
  for (const key of Object.keys(AXIS_LABELS)) {
    axisCountByStatus[key] = { green: 0, amber: 0, red: 0 };
  }
  let globalSovIndex = 0;
  let globalSovCount = 0;
  for (const p of processes) {
    const axes = p.b2?.axes ?? {};
    const { index } = sovereigntyLevel(axes);
    if (index > 0) {
      globalSovIndex += index;
      globalSovCount++;
    }
    for (const key of Object.keys(AXIS_LABELS)) {
      const status = axes[key]?.status;
      if (status && axisCountByStatus[key]) axisCountByStatus[key][status]++;
    }
  }
  const avgSovIndex = globalSovCount > 0 ? globalSovIndex / globalSovCount : 0;
  const globalSovLevel = sovereigntyLevel({
    _: {
      status:
        avgSovIndex >= 4.5
          ? 'green'
          : avgSovIndex >= 3.5
            ? 'green'
            : avgSovIndex >= 2.5
              ? 'amber'
              : 'red',
    },
  });
  const sovLevelLabel =
    avgSovIndex >= 4.5
      ? 'Full Autonomy'
      : avgSovIndex >= 3.5
        ? 'Managed'
        : avgSovIndex >= 2.5
          ? 'Conditioned'
          : avgSovIndex >= 1.5
            ? 'Restricted'
            : 'Critical';

  const sovereigntyTableRows = Object.entries(AXIS_LABELS)
    .map(([key, label]) => {
      const c = axisCountByStatus[key] ?? { green: 0, amber: 0, red: 0 };
      return `| ${label} | ${c.green} ✅ | ${c.amber} 🟡 | ${c.red} 🔴 |`;
    })
    .join('\n');

  const ucRequiresClientIT = useCases.filter((u) => u.requiresClientIT).length;

  // ── Process sections ────────────────────────────────────────────────────────
  const processSections = processes
    .map((p) => {
      const profiles: any[] = p.b1?.profiles ?? [];
      const peopleCount = profiles.reduce(
        (s: number, pr: any) => s + (pr.count ?? 0),
        0,
      );
      const profilesStr =
        profiles
          .map((pr: any) => `${pr.role} (×${pr.count}, €${pr.hourlyRateEur}/h)`)
          .join(', ') || '—';
      const activities: any[] = p.b3?.activities ?? [];
      const annualReps = p.b3?.annualRepetitions ?? 0;
      const totalHrsRun = activities.reduce(
        (s: number, a: any) =>
          s + (a.estimatedTimeHours ?? 0) * (a.stepRepetitions ?? 1),
        0,
      );
      const decisionPoints = activities.filter((a) => a.isDecisionPoint).length;

      const axes = p.b2?.axes ?? {};
      const { index: sovIdx, level: sovLevel } = sovereigntyLevel(axes);
      const axisLines = Object.entries(AXIS_LABELS)
        .map(([key, label]) => {
          const ax = axes[key];
          const status = ax?.status ?? 'not assessed';
          const icon =
            status === 'green'
              ? '✅'
              : status === 'amber'
                ? '🟡'
                : status === 'red'
                  ? '🔴'
                  : '⬜';
          const fw =
            (
              ax?.normativeFrameworks ??
              (ax?.normativeFramework ? [ax.normativeFramework] : [])
            ).join(', ') || '—';
          return `  ${icon} ${label}: ${status.toUpperCase()} | Frameworks: ${fw}${ax?.findings ? ` | "${ax.findings.slice(0, 120)}"` : ''}`;
        })
        .join('\n');

      const procUCs = ucByProcess[String(p._id)] ?? [];
      const m = processMetrics[String(p._id)];

      const ucLines = procUCs
        .map((uc: any) => {
          const total = scoreTotal(uc.score);
          const cat = scoreCategory(uc.score);
          const timeSaved = (uc.timeSavedPerProfile ?? []).reduce(
            (s: number, e: any) => s + (e.hoursPerExecution ?? 0),
            0,
          );
          const annualSaving =
            timeSaved * (m?.avgRate ?? 0) * (m?.annualReps ?? 0);
          const computeCost = computeAnnualCostForUC(uc);
          const payback =
            (uc.estimatedDevCostEur ?? 0) > 0 && annualSaving > 0
              ? Math.round((uc.estimatedDevCostEur / annualSaving) * 12)
              : null;
          const dims = uc.score?.dimensions ?? {};
          const dimStr = [
            'd1_efficiencyImpact',
            'd2_qualityImpact',
            'd3_techMaturity',
            'd4_dataReadiness',
            'd5_sovereigntyIndex',
          ]
            .map((k, i) => `D${i + 1}=${dims[k]?.value ?? '?'}`)
            .join(' ');
          return `  • ${uc.cuId} [${(uc.aiTypes ?? []).join('/')}] | Score: ${total}/30 (${cat}) | ${uc.status.toUpperCase()}
    Time saved: ${timeSaved}h/run → ${fmtEur(annualSaving)}/yr gross | Compute: ${fmtEur(computeCost)}/yr | Dev: ${fmtEur(uc.estimatedDevCostEur ?? 0)}${payback !== null ? ` | Payback: ${payback}m` : ''}
    ${dimStr} | Client IT: ${uc.requiresClientIT ? 'Yes' : 'No'}
    ${uc.sovereigntyAnalysis ? `Sovereignty note: "${uc.sovereigntyAnalysis.slice(0, 200)}"` : ''}`;
        })
        .join('\n');

      return `### ${p.procId} — ${p.name}
Department: ${p.b1?.clientDepartment ?? p.department ?? '—'} | Client contact: ${p.b1?.clientResponsible ?? p.responsible ?? '—'} | Tech Director: ${p.b1?.technicalDirectorResponsible ?? '—'}
People impacted: ${peopleCount} | Annual repetitions: ${annualReps}
Profiles: ${profilesStr}
Process map: ${activities.length} activities (${decisionPoints} decision points) | ${totalHrsRun.toFixed(1)}h/run | ${(totalHrsRun * annualReps).toFixed(0)}h/yr total
Activities: ${activities.map((a: any) => `${a.name}(${a.estimatedTimeHours ?? 0}h${a.isDecisionPoint ? ', DP' : ''})`).join(' → ') || '—'}
Sovereignty [${sovIdx}/5 — ${sovLevel}]:
${axisLines}
Use cases (${procUCs.length}):
${ucLines || '  (none identified)'}`;
    })
    .join('\n\n');

  // ── UC ranking table ────────────────────────────────────────────────────────
  const allUCsRanked = [...useCases].sort(
    (a, b) => scoreTotal(b.score) - scoreTotal(a.score),
  );
  const ucTableRows = allUCsRanked
    .map((uc) => {
      const total = scoreTotal(uc.score);
      const cat = scoreCategory(uc.score);
      const pid = String(uc.processId);
      const m = processMetrics[pid];
      const timeSaved = (uc.timeSavedPerProfile ?? []).reduce(
        (s: number, e: any) => s + (e.hoursPerExecution ?? 0),
        0,
      );
      const annualSaving = timeSaved * (m?.avgRate ?? 0) * (m?.annualReps ?? 0);
      const payback =
        (uc.estimatedDevCostEur ?? 0) > 0 && annualSaving > 0
          ? `${Math.round((uc.estimatedDevCostEur / annualSaving) * 12)}m`
          : '—';
      const proc = processes.find((p) => String(p._id) === pid);
      return `| ${uc.cuId} | ${uc.description.slice(0, 50)}… | ${(uc.aiTypes ?? []).join('/')} | ${total}/30 | ${cat} | ${fmtEur(annualSaving)}/yr | ${fmtEur(uc.estimatedDevCostEur ?? 0)} | ${payback} | ${uc.status} |`;
    })
    .join('\n');

  // ── Compute cost table ──────────────────────────────────────────────────────
  const computeTableRows = eligibleUCs
    .map((uc) => {
      const cb = (uc as any).computeBreakdown ?? {};
      const cost = computeAnnualCostForUC(uc);
      return `| ${uc.cuId} | ${cb.mode || '—'} | ${(cb.annualReps ?? 0).toLocaleString()} | ${fmtEur(cost)}/yr |`;
    })
    .join('\n');

  // ── Industrialization metrics & section ─────────────────────────────────────
  const indByStatus: Record<string, number> = {};
  let totalIndOneTime = 0;
  let totalIndRecurring = 0;
  let totalIndExpectedSaving = 0;
  let totalIndConfirmedSaving = 0;
  let indAtRun = 0;
  let indWip = 0;

  for (const ind of industrializations) {
    indByStatus[ind.status] = (indByStatus[ind.status] ?? 0) + 1;
    totalIndOneTime += industrializationOneTime(ind);
    totalIndRecurring += industrializationRecurringAnnual(ind);
    totalIndExpectedSaving += ind?.roi?.expected?.annualSavingEur ?? 0;
    totalIndConfirmedSaving += ind?.roi?.confirmed?.annualSavingEur ?? 0;
    if (ind.status === 'go_for_run') indAtRun++;
    if (ind.status === 'work_in_progress') indWip++;
  }

  const indTableRows = industrializations
    .map((ind: any) => {
      const ucRef = ind.useCaseId?.cuId ?? '—';
      const procRef = ind.processId?.procId ?? '—';
      const pocRef = ind.pocId?.pocId ?? '—';
      const target = ind.plan?.targetGoLiveDate
        ? fmt(ind.plan.targetGoLiveDate)
        : '—';
      const owner = ind.plan?.ownerBusiness || ind.plan?.ownerTechnical || '—';
      const oneTime = industrializationOneTime(ind);
      const recurring = industrializationRecurringAnnual(ind);
      const expSaving = ind.roi?.expected?.annualSavingEur ?? 0;
      const payback = ind.roi?.expected?.paybackMonths ?? 0;
      const milestones = ind.milestones ?? [];
      const done = milestones.filter((m: any) => m.status === 'done').length;
      const aggregatedPct =
        milestones.length > 0
          ? Math.round(
              milestones.reduce(
                (s: number, m: any) => s + milestoneProgressPct(m),
                0,
              ) / milestones.length,
            )
          : 0;
      const progress =
        ind.status === 'go_for_run'
          ? '100%'
          : milestones.length > 0
            ? `${aggregatedPct}% (${done}/${milestones.length} done)`
            : '—';
      return `| ${ind.industrializationId} | ${(ind.name || '—').slice(0, 40)} | ${pocRef} | ${ucRef} | ${procRef} | ${IND_STATUS_LABELS[ind.status] ?? ind.status} | ${owner} | ${target} | ${fmtEur(oneTime)} | ${fmtEur(recurring)}/yr | ${fmtEur(expSaving)}/yr | ${payback > 0 ? `${payback}m` : '—'} | ${progress} |`;
    })
    .join('\n');

  const indDetail = industrializations
    .map((ind: any) => {
      const ucRef = ind.useCaseId?.cuId ?? '—';
      const procRef = ind.processId?.procId ?? '—';
      const pocRef = ind.pocId?.pocId ?? '—';
      const milestones = ind.milestones ?? [];
      const doneM = milestones.filter((m: any) => m.status === 'done').length;
      const missedM = milestones.filter(
        (m: any) => m.status === 'missed',
      ).length;
      const risks =
        (ind.risks ?? [])
          .map((r: any) => `${r.severity?.toUpperCase()}: ${r.description}`)
          .join(' | ') || '—';
      const lines = [
        `### ${ind.industrializationId} — ${ind.name || '(no name)'}`,
        `Linked: POC ${pocRef} | UC ${ucRef} | Process ${procRef}`,
        `Status: ${IND_STATUS_LABELS[ind.status] ?? ind.status}${ind.statusReason ? ` (${ind.statusReason})` : ''}`,
        `Owners: business=${ind.plan?.ownerBusiness || '—'} | technical=${ind.plan?.ownerTechnical || '—'}`,
        `Plan: start=${fmt(ind.plan?.startDate)} | target go-live=${fmt(ind.plan?.targetGoLiveDate)} | actual go-live=${fmt(ind.plan?.actualGoLiveDate)}`,
        ind.plan?.scope ? `Scope: ${ind.plan.scope.slice(0, 240)}` : '',
        ind.plan?.dependencies
          ? `Dependencies: ${ind.plan.dependencies.slice(0, 240)}`
          : '',
        ind.plan?.sovereigntyConstraints
          ? `Sovereignty constraints: ${ind.plan.sovereigntyConstraints.slice(0, 240)}`
          : '',
        `Milestones: ${milestones.length} total (${doneM} done, ${missedM} missed)`,
        `Cost — One-time: ${fmtEur(industrializationOneTime(ind))} | Recurring: ${fmtEur(industrializationRecurringAnnual(ind))}/yr (horizon ${ind.cost?.horizonYears ?? 3}y)`,
        `ROI — Expected: ${fmtEur(ind.roi?.expected?.annualSavingEur ?? 0)}/yr | payback ${ind.roi?.expected?.paybackMonths ?? 0}m | time saving ${ind.roi?.expected?.timeSavingPct ?? 0}%`,
        (ind.roi?.confirmed?.annualSavingEur ?? 0) > 0
          ? `ROI — Confirmed: ${fmtEur(ind.roi.confirmed.annualSavingEur)}/yr | net ${fmtEur(ind.roi.confirmed.netAnnualBenefitEur ?? 0)} | actual payback ${ind.roi.confirmed.paybackMonthsActual ?? 0}m`
          : '',
        ind.production?.monitoredKpis
          ? `Monitored KPIs: ${ind.production.monitoredKpis.slice(0, 200)}`
          : '',
        ind.production?.incidentsLog
          ? `Incidents: ${ind.production.incidentsLog.slice(0, 200)}`
          : '',
        `Risks: ${risks}`,
        ind.changeManagement?.trainingPlan
          ? `Training plan: ${ind.changeManagement.trainingPlan.slice(0, 200)}`
          : '',
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');

  const indStatusSummary = Object.entries(IND_STATUS_LABELS)
    .map(([k, label]) => `${label}: ${indByStatus[k] ?? 0}`)
    .join(' | ');

  // ── POC section ─────────────────────────────────────────────────────────────
  const pocLines = pocs
    .map((poc: any) => {
      const ucRef = poc.useCaseId?.cuId ?? String(poc.useCaseId);
      const procRef = poc.processId?.procId ?? String(poc.processId);
      const milestones: any[] = poc.execution?.milestones ?? [];
      const doneMilestones = milestones.filter(
        (m) => m.status === 'done',
      ).length;
      const progressStr =
        milestones.length > 0
          ? `${doneMilestones}/${milestones.length} milestones`
          : 'no milestones';
      const lines = [
        `### ${poc.pocId} → UC: ${ucRef} | Process: ${procRef}`,
        `Phase: ${poc.phase} | Decision: ${poc.decision?.decision ?? 'pending'} | Progress: ${progressStr}`,
        `Objective: ${poc.design?.measurableObjective ?? '—'}`,
        poc.design?.activeB2Restrictions
          ? `B2 restrictions: ${poc.design.activeB2Restrictions}`
          : '',
      ];
      if (poc.phase === 'closed' || poc.evaluation?.resultsVsCriteria) {
        lines.push(
          `Results vs criteria: ${poc.evaluation?.resultsVsCriteria ?? '—'}`,
        );
        lines.push(
          `Technical lessons: ${poc.evaluation?.technicalLessons ?? '—'}`,
        );
        lines.push(
          `Actual cost: ${fmtEur(poc.evaluation?.actualCostEur ?? 0)}`,
        );
        if (poc.decision?.justification)
          lines.push(`Decision rationale: ${poc.decision.justification}`);
      }
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');

  // Build processDetail array for Process Detail section
  const processDetail = processes.map((proc: any) => {
    const pcsUCs = ucByProcess[String(proc._id)] ?? [];
    const m = processMetrics[String(proc._id)] ?? {};

    // Calculate peopleCount from profiles
    const profiles: any[] = proc.b1?.profiles ?? [];
    const peopleCount = profiles.reduce(
      (s: number, pr: any) => s + (pr.count ?? 0),
      0,
    );

    // Calculate totalHrsRun from activities
    const activities: any[] = proc.b3?.activities ?? [];
    const totalHrsRun = activities.reduce(
      (s: number, a: any) =>
        s + (a.estimatedTimeHours ?? 0) * (a.stepRepetitions ?? 1),
      0,
    );

    // Extract decision points
    const b2Restrictions = proc.b2?.restrictions ?? [];
    const decisionPoints = b2Restrictions
      .filter((r: any) => r.isDecisionPoint)
      .map((r: any) => r.description)
      .filter(Boolean);

    const ucs = pcsUCs.map((uc: any) => {
      // Calculate ROI metrics for this UC
      const timeSaved = (uc.timeSavedPerProfile ?? []).reduce(
        (s: number, e: any) => s + (e.hoursPerExecution ?? 0),
        0,
      );
      const grossSaving = timeSaved * (m?.avgRate ?? 0) * (m?.annualReps ?? 0);
      const computeCost = computeAnnualCostForUC(uc);
      const netSaving = Math.max(grossSaving - computeCost, 0);
      const devCost = uc.isInstance
        ? (uc.additionalDevCostEur ?? 0)
        : (uc.estimatedDevCostEur ?? 0);

      const costLabel = devCost > 0 ? `€${Math.round(devCost / 1000)}k` : '—';

      return {
        cuId: uc.cuId,
        name: uc.description ?? '—',
        hSaved: netSaving > 0 ? Math.round(netSaving / (m?.avgRate ?? 1)) : 0,
        costLabel,
        costEur: devCost,
        implWeeks: implWeeksForUC(uc),
      };
    });

    return {
      procId: proc.procId,
      name: proc.name,
      department: proc.department ?? 'Other',
      clientContact: proc.b1?.clientContact ?? '—',
      techDirector: proc.b1?.techDirector ?? '—',
      peopleCount,
      annualReps: m?.annualReps ?? 0,
      activitiesCount: activities.length,
      decisionPoints,
      totalHrsRun: Math.round(totalHrsRun),
      activitiesNames: activities.map((a: any) => a.name).filter(Boolean),
      ucs,
    };
  });

  return {
    totalPeople,
    totalAnnualHours,
    totalAnnualCostEur,
    eligibleUCs,
    inPocUCs,
    discardedUCs,
    qwCount,
    mtCount,
    stCount,
    totalAnnualSaving,
    totalComputeCostEur,
    netAnnualSaving,
    totalDevCost,
    paybackMonths,
    ucRequiresClientIT,
    pocGo,
    pocClosed,
    pocActive,
    avgSovIndex,
    sovLevelLabel,
    sovereigntyTableRows,
    processSections,
    ucTableRows,
    computeTableRows,
    totalIndOneTime,
    totalIndRecurring,
    totalIndExpectedSaving,
    totalIndConfirmedSaving,
    indAtRun,
    indWip,
    indTableRows,
    indDetail,
    indStatusSummary,
    pocLines,
    processDetail,
    processCount: processes.length,
    indCount: industrializations.length,
  };
}

// ─── Deterministic markdown builder (no LLM) ───────────────────────────────────

function fmtEurDe(n: number): string {
  return `€${Math.round(n).toLocaleString('de-DE')}`;
}
