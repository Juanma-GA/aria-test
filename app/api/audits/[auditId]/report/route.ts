import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';
import { getStateOfTheArt, getUseCases } from '@/lib/references';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const index = vals.reduce((s, v) => s + v, 0) / vals.length;
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

const fmt = (d: Date | string | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

const fmtEur = (n: number) =>
  n >= 1_000_000
    ? `€${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `€${Math.round(n / 1000)}k`
      : `€${Math.round(n)}`;

const AXIS_LABELS: Record<string, string> = {
  axis1_InfoClassification: 'Info Classification',
  axis2_ProcessSovereignty: 'Process Sovereignty',
  axis3_ToolSovereignty: 'Tool Sovereignty',
  axis4_DataSovereignty: 'Data Sovereignty',
  axis5_Infrastructure: 'Infrastructure',
};

// ─── Prompt builder ───────────────────────────────────────────────────────────

const IND_STATUS_LABELS: Record<string, string> = {
  pending_customer_validation: 'Pending customer validation',
  planned: 'Planned',
  work_in_progress: 'Work in progress',
  go_for_run: 'Go for run',
  stand_by: 'Stand by',
  cancelled: 'Cancelled',
};

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

function buildPrompt(
  audit: any,
  processes: any[],
  useCases: any[],
  pocs: any[],
  industrializations: any[],
): string {
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
      totalAnnualHours += hrs * stepReps * annualReps;
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
  const blockedUCs = useCases.filter((u) => u.status === 'blocked');
  const pendingUCs = useCases.filter((u) => u.status === 'pending_review');

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
  const pocClosed = pocs.filter((p) => p.phase === 'closed').length;
  const pocActive = pocs.filter((p) => p.phase !== 'closed').length;

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

  // ── Prompt ──────────────────────────────────────────────────────────────────
  return `You are a senior digital transformation consultant specialised in industrial AI for the defence, aerospace, naval, and railway sectors.

Generate a comprehensive, professional AI Audit Report based on the structured data below.
CRITICAL RULES:
- Do NOT invent or extrapolate metrics. Use only the data provided.
- If a field is missing ("—"), say "Not available" in the report.
- Use a professional, direct, action-oriented tone in English.
- Output ONLY the report in Markdown. No preamble, no meta-commentary.
- Every section must be present, even if data is sparse (write "No data available" where needed).
- Scores are out of 25 (5 dimensions × max 5). Quick Win ≥18, Mid-term ≥11, Strategic <11.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUDIT METADATA:
- Name: ${audit.name}
- Client: ${audit.client}
- Project: ${audit.project || '—'}
- Sector: ${audit.sector}
- Period: ${fmt(audit.startDate)} → ${fmt(audit.targetEndDate)}

GLOBAL METRICS:
- Audited processes: ${processes.length}
- Total people impacted: ${totalPeople}
- Total annual hours in scope: ${Math.round(totalAnnualHours)}h | Annual labour cost: ${fmtEur(totalAnnualCostEur)}
- Use cases: ${useCases.length} total | ${eligibleUCs.length} eligible | ${blockedUCs.length} blocked | ${pendingUCs.length} pending
- Quick Wins: ${qwCount} | Mid-term: ${mtCount} | Strategic: ${stCount}
- Projected gross annual saving: ${fmtEur(totalAnnualSaving)}
- Estimated annual compute cost: ${fmtEur(totalComputeCostEur)}
- Net annual saving: ${fmtEur(netAnnualSaving)}
- Total development investment: ${fmtEur(totalDevCost)}
- Overall payback: ${paybackMonths !== null ? `${paybackMonths} months` : 'N/A'}
- Use cases requiring client IT approval: ${ucRequiresClientIT}
- POCs: ${pocs.length} total | ${pocActive} active | ${pocClosed} closed | ${pocGo} with GO decision
- Industrializations: ${industrializations.length} total | ${indWip} work-in-progress | ${indAtRun} go-for-run
- Industrialization status mix: ${indStatusSummary}
- Industrialization investment (sum across all): one-time ${fmtEur(totalIndOneTime)} | recurring ${fmtEur(totalIndRecurring)}/yr
- Industrialization expected annual saving: ${fmtEur(totalIndExpectedSaving)} | confirmed annual saving: ${fmtEur(totalIndConfirmedSaving)}

GLOBAL SOVEREIGNTY:
Average index: ${avgSovIndex.toFixed(1)}/5 — Level: ${sovLevelLabel}

Axis summary (counts per status across all ${processes.length} process(es)):
| Axis | ✅ Green | 🟡 Amber | 🔴 Red |
|------|---------|---------|--------|
${sovereigntyTableRows}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROCESS DETAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${processSections}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USE CASE RANKING (ALL, ordered by score DESC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| ID | Description | AI Types | Score/30 | Category | Saving/yr | Dev Cost | Payback | Status |
|----|-------------|----------|----------|----------|-----------|----------|---------|--------|
${ucTableRows || '| — | No use cases | — | — | — | — | — | — | — |'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPUTE COST (eligible UCs only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| UC ID | Deployment | Annual Executions | Estimated Cost/yr |
|-------|-----------|-------------------|-------------------|
${computeTableRows || '| — | — | — | — |'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POCS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${pocLines || 'No POCs recorded.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INDUSTRIALIZATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary table:

| IND ID | Name | POC | UC | Process | Status | Owner | Target Go-Live | One-time | Recurring | Expected saving | Payback | Progress |
|--------|------|-----|----|---------|--------|-------|----------------|----------|-----------|-----------------|---------|----------|
${indTableRows || '| — | No industrializations | — | — | — | — | — | — | — | — | — | — | — |'}

Detail per industrialization:

${indDetail || 'No industrializations recorded.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERATE THE REPORT WITH EXACTLY THESE 11 SECTIONS IN THIS ORDER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# AI Audit Report — ${audit.name}
*Generated: ${fmt(new Date())} | Tool: ARIA v2 | Model: mistral-medium-latest*

---

## 0. Project Fact Sheet

Produce a clean two-column Markdown table with these rows (use the data above):
Client | Sector | Project | Audit period | Processes audited | People impacted | Total hours in scope | Annual labour cost | Eligible use cases | Total dev investment | Projected net saving/yr | Overall payback | POCs | Industrializations (total / WIP / Go-for-run) | Industrialization investment (one-time + recurring/yr) | Sovereignty level

---

## 1. Executive Summary

Write exactly 3 paragraphs:
- P1: Scope and context — what was audited, client, sector, number of processes and people.
- P2: Key findings — number and quality of use cases identified, sovereignty level, POC and industrialization progress (how many POCs reached GO and how many industrializations are in progress / live), and most significant saving/risk.
- P3: Top recommendation — the single most impactful action the client should take, with urgency.

---

## 2. Sovereignty Assessment

2a. Write a paragraph interpreting the global sovereignty level (${sovLevelLabel}, index ${avgSovIndex.toFixed(1)}/5) and what it means for AI deployment.

2b. Insert this exact table (already computed — reproduce it verbatim):
| Axis | ✅ Green | 🟡 Amber | 🔴 Red |
|------|---------|---------|--------|
${sovereigntyTableRows}

2c. List the 3 most critical sovereignty constraints found (with specific process/axis references from the data).

2d. State clearly: ${ucRequiresClientIT} use case(s) require Client IT approval due to sovereignty restrictions.

---

## 3. Process-by-Process Analysis

For EACH process in the data, write a subsection with this fixed structure:

### 3.X — {procId}: {process name}

**B1 — Context:** Responsible(s), department, profiles (roles × headcount × rate), annual repetitions.
**B3 — Process Map:** Number of activities, decision points, total hours/run, key tools, main bottleneck activity.
**B2 — Sovereignty:** Reproduce the 5-axis assessment with status icons. Highlight any amber/red axes and their specific findings.
**Use Cases:** For each UC in this process, one bullet: ID, AI types, score/30, category, gross saving/yr, payback.

---

## 4. Use Case Ranking

4a. Reproduce the full ranking table (already computed above — reproduce it verbatim, sorted by score DESC).

4b. Write subsections:
### Quick Wins (≥22/30 AND D6 ≥4)
For each Quick Win UC: 2-sentence justification of why it qualifies and what makes it immediately actionable.

### Mid-term (14–21/30)
For each Mid-term UC: 1-sentence description of the main prerequisite before implementation.

### Strategic (<14/30)
For each Strategic UC: 1-sentence justification for keeping it in the roadmap.

### Blocked
For each blocked UC: reason for blockage and specific condition required to unblock.

---

## 5. ROI & Compute Analysis

5a. Global financial summary table:
| Metric | Value |
|--------|-------|
| Gross annual saving | ${fmtEur(totalAnnualSaving)} |
| Annual compute cost | ${fmtEur(totalComputeCostEur)} |
| Net annual saving | ${fmtEur(netAnnualSaving)} |
| Total dev investment | ${fmtEur(totalDevCost)} |
| Overall payback | ${paybackMonths !== null ? `${paybackMonths} months` : 'N/A'} |

5b. Reproduce the compute cost table (already computed — reproduce verbatim).

5c. Write 2 paragraphs: (1) interpret the ROI figures — which processes/UCs drive the most value; (2) comment on the compute cost structure and whether cloud vs on-premise vs hybrid is appropriate given the sovereignty level.

---

## 6. POC Status

${
  pocs.length > 0
    ? `6a. Reproduce a summary table: | POC ID | UC | Phase | Decision | Milestones |
For each closed POC: summarise results vs criteria, key lessons learned, and whether the decision was GO/No-Go.
For each active POC: state current phase, next milestone, and any blockers.`
    : `No POCs have been recorded for this audit. Recommend the top 2-3 eligible use cases that should be launched as POCs immediately, with justification based on score, saving potential, and technical maturity (D3/D4 dimensions).`
}

---

## 7. Industrialization Portfolio

${
  industrializations.length > 0
    ? `7a. Reproduce the industrialization summary table verbatim (already computed above):

| IND ID | Name | POC | UC | Process | Status | Owner | Target Go-Live | One-time | Recurring | Expected saving | Payback | Progress |
|--------|------|-----|----|---------|--------|-------|----------------|----------|-----------|-----------------|---------|----------|
${indTableRows}

7b. Status overview — write 1 paragraph interpreting the status mix (${indStatusSummary}). Highlight industrializations at risk (Stand by, Cancelled, or with statusReason explaining a blocker).

7c. For each industrialization in **work_in_progress** or **go_for_run**, write a short subsection:
### {industrializationId} — {name}
- **Linkage:** POC → UC → Process
- **Plan:** owners, scope, target go-live (flag if past target with no actual go-live)
- **Milestones:** progress (done / total / missed) and the next critical milestone
- **Cost & ROI:** one-time + recurring/yr, expected saving/yr and payback. If confirmed ROI is available, contrast it with the expected ROI.
- **Risks & sovereignty constraints:** the most critical 1-2 items
- **Production status (only if go_for_run):** monitored KPIs, incidents, decommissioning plan

7d. Aggregated industrialization economics:
| Metric | Value |
|--------|-------|
| Total one-time investment | ${fmtEur(totalIndOneTime)} |
| Total recurring cost / yr | ${fmtEur(totalIndRecurring)} |
| Expected annual saving (sum) | ${fmtEur(totalIndExpectedSaving)} |
| Confirmed annual saving (sum) | ${fmtEur(totalIndConfirmedSaving)} |
| Industrializations at run | ${indAtRun} of ${industrializations.length} |

7e. Recommendation paragraph: which industrializations should be accelerated, paused, or re-scoped, and why — grounded only in the data above.`
    : `No industrializations have been recorded yet. Identify the 1-3 POCs with GO / GO Conditional decisions that should be promoted to industrialization next, and explain the prerequisites (owner assignment, scope definition, sovereignty constraints carried over from B2/POC) that must be addressed before launch.`
}

---

## 8. Risks & Constraints

Produce a normalised risk table with EXACTLY these columns and at least one row per risk category:

| Risk | Category | Severity | Affected UC(s) / Process(es) | Mitigation |
|------|----------|----------|------------------------------|------------|

Risk categories to cover (add rows only where data supports it):
1. Sovereignty / regulatory compliance
2. Technology maturity (low D3 scores)
3. Data readiness (low D4 scores)
4. Client IT dependency
5. Sector-specific regulation (defence, export control, etc.)
6. Change management / user adoption

Severity: High / Medium / Low based on the actual data.

Include any industrialization-specific risks recorded in the data (with severity).

---

## 9. Implementation Roadmap

Produce a timeline table with EXACTLY these 4 horizons:

| Horizon | Period | Actions |
|---------|--------|---------|

- Immediate (0–3 months): List specific Quick Win UCs to launch + any POCs to initiate + industrializations to push to go-for-run if their target go-live falls in this horizon
- Short-term (3–6 months): Mid-term UCs to prepare, POCs to start, industrializations whose target go-live falls here
- Medium-term (6–12 months): Mid-term UCs to implement, POC evaluations, industrialization roll-outs scheduled in this horizon
- Long-term (12+ months): Strategic UCs and any industrialization whose target go-live is beyond 12 months

Use actual UC IDs, POC IDs and Industrialization IDs from the data.

---

## 10. Recommendations

Produce a numbered list of exactly 5–8 prioritised recommendations. For each:
**#N. [Action in imperative form]**
- Owner: Atexis / Client / Joint
- Urgency: Immediate / 30 days / 90 days
- Rationale: 1 sentence grounded in the audit data.

Order by urgency descending. At least one recommendation must address industrialization governance (promotion of validated POCs, milestone discipline, or maintenance assessment) when industrialization data exists.

---

## 11. Conclusion

Write exactly 1 paragraph (4–6 sentences) assessing:
- Overall AI maturity level of the audited scope (including how far the portfolio has progressed from use-case identification through POCs to industrialization)
- Most significant opportunity identified
- Main barrier to overcome
- Overall verdict (positive/cautious/negative) with a closing forward-looking statement

---
END OF REPORT
`;
}

// ─── GET — fetch existing report ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const audit = (await Audit.findById(params.auditId)
      .select('report')
      .lean()) as any;
    if (!audit)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!audit.report?.markdown) return NextResponse.json({ exists: false });
    return NextResponse.json({ exists: true, report: audit.report });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST — generate report ───────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  const params = await Promise.resolve(context.params);
  const { auditId } = params;

  try {
    await dbConnect();
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const [audit, processes, useCases, pocs, industrializations] =
      await Promise.all([
        Audit.findById(auditId).lean(),
        Process.find({ auditId }).lean(),
        UseCase.find({ auditId }).lean(),
        POC.find({ auditId })
          .populate('useCaseId', 'cuId description aiTypes')
          .populate('processId', 'procId name')
          .lean(),
        Industrialization.find({ auditId })
          .populate('useCaseId', 'cuId description')
          .populate('processId', 'procId name')
          .populate('pocId', 'pocId name')
          .lean(),
      ]);

    if (!audit)
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    const isTechpubs =
      ((audit as any)?.projectType || 'techpubs') === 'techpubs';

    let basePrompt = buildPrompt(
      audit,
      processes as any[],
      useCases as any[],
      pocs as any[],
      industrializations as any[],
    );

    // Inject TechPubs reference context if applicable
    let prompt = basePrompt;
    if (isTechpubs) {
      const [stateOfTheArt, useCases] = await Promise.all([
        getStateOfTheArt(),
        getUseCases(),
      ]);

      const techpubsSection = `## TECHPUBS KNOWLEDGE BASE
==========================

### Estado del Arte Tecnológico
${stateOfTheArt}

### Casos de Uso para Publicaciones Técnicas
${useCases}

---

`;
      prompt = techpubsSection + basePrompt;
    }

    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: 'MISTRAL_API_KEY no configurada en .env.local' },
        { status: 500 },
      );
    }

    const mistralRes = await fetch(
      'https://api.2a91ec1812a1.dc.mistral.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'mistral-medium-latest',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: isTechpubs ? 8000 : 6000,
          temperature: 0.2,
        }),
      },
    );

    if (!mistralRes.ok) {
      const errText = await mistralRes.text();
      return NextResponse.json(
        { error: `Mistral API error: ${errText}` },
        { status: 500 },
      );
    }

    const mistralData = await mistralRes.json();
    const markdown = (mistralData.choices?.[0]?.message?.content ??
      '') as string;

    await Audit.findByIdAndUpdate(auditId, {
      'report.generatedAt': new Date(),
      'report.model': 'mistral-medium-latest',
      'report.markdown': markdown,
    });

    return NextResponse.json({ markdown, model: 'mistral-medium-latest' });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
