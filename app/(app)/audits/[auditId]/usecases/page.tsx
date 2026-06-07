'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { AI_TYPE_LABELS } from '@/lib/types';
import { apiUrl } from '@/lib/utils';
import type { AIType, UseCaseStatus, B2CompatibilityType } from '@/lib/types';
import { calculateScore, computeAnnualCompute } from '@/lib/calculations';
import { TrendingUp, Download } from 'lucide-react';

interface AuditUseCase {
  _id: string;
  cuId: string;
  description: string;
  aiTypes: AIType[];
  status: UseCaseStatus;
  isArchived?: boolean;
  b2Compatible: B2CompatibilityType;
  estimatedDevCostEur: number;
  estimatedImplWeeks: number;
  timeSavedPerProfile: {
    profileId: string;
    role: string;
    hoursPerExecution: number;
  }[];
  targetActivities?: string[];
  computeBreakdown?: any;
  processId: {
    _id: string;
    procId: string;
    name?: string;
    b1?: { profiles: { id: string; count: number; role: string; hourlyRateEur: number }[] };
    b3?: { activities: { id: string; estimatedTimeHours: number }[]; annualRepetitions: number };
  } | null;
  score?: {
    dimensions: {
      d1_efficiencyImpact: { value: number };
      d2_qualityImpact: { value: number };
      d3_techMaturity: { value: number };
      d4_dataReadiness: { value: number };
      d5_sovereigntyIndex: { value: number };
      d6_governanceComplexity: { value: number };
    };
  };
}

const STATUS_VARIANTS: Record<UseCaseStatus, 'green' | 'blue' | 'slate'> = {
  eligible: 'green',
  in_poc: 'blue',
  discarded: 'slate',
};

const AI_TYPE_COLORS: Record<
  AIType,
  'purple' | 'blue' | 'teal' | 'amber' | 'green' | 'slate'
> = {
  generative_llm: 'purple',
  extraction_nlp: 'blue',
  classification_ml: 'teal',
  rag: 'blue',
  validation: 'amber',
  prediction: 'green',
  intelligent_automation: 'teal',
  agentic_ai: 'purple',
  other: 'slate',
};

function peopleImpacted(uc: AuditUseCase): number {
  const profiles = (uc.processId as any)?.b1?.profiles ?? [];
  return (uc.timeSavedPerProfile ?? []).reduce((sum, e) => {
    const p = profiles.find((p: any) => p.id === e.profileId);
    return sum + (p?.count ?? 0);
  }, 0);
}

function computeRoi(
  timeSaved: any[],
  b1Profiles: any[],
  devCost: number,
  annualReps: number,
  targetHours: number,
  computeCostPerYear: number = 0,
): { totalHours: number; annualSaving: number; computeCostPerYear: number; netAnnualSaving: number; paybackMonths: number; savingPct: number | null; avgRate: number; targetHours: number } | null {
  const totalHours = timeSaved.reduce((s: number, e: any) => s + (e.hoursPerExecution ?? 0), 0);
  if (totalHours === 0 || annualReps === 0) return null;
  const weightedSum = timeSaved.reduce((sum: number, e: any) => {
    const profile = b1Profiles.find(p => p.id === e.profileId);
    if (!profile || !profile.hourlyRateEur) return sum;
    return sum + (profile.count ?? 1) * profile.hourlyRateEur;
  }, 0);
  const totalCount = timeSaved.reduce((sum: number, e: any) => {
    const profile = b1Profiles.find(p => p.id === e.profileId);
    return sum + (profile?.count ?? 1);
  }, 0);
  const avgRate = totalCount > 0 ? weightedSum / totalCount : 0;
  if (avgRate === 0) return null;
  const annualSaving = totalHours * avgRate * annualReps;
  const netAnnualSaving = Math.max(annualSaving - computeCostPerYear, 0);
  const paybackMonths = devCost > 0 && netAnnualSaving > 0 ? (devCost / netAnnualSaving) * 12 : 0;
  const savingPct = targetHours > 0 ? Math.round((totalHours / targetHours) * 100) : null;
  return { totalHours, annualSaving, computeCostPerYear, netAnnualSaving, paybackMonths, savingPct, avgRate, targetHours };
}

function UCRoi({ uc, b1Profiles, annualReps, activities }: { uc: AuditUseCase; b1Profiles: any[]; annualReps: number; activities: any[] }) {
  const targetHours = activities
    .filter((a) => (uc.targetActivities ?? []).includes(a.id))
    .reduce((s, a) => s + (a.estimatedTimeHours ?? 0), 0);
  const ccPerYear = computeAnnualCompute((uc as any).computeBreakdown ?? null).totalEur;
  const roi = computeRoi(uc.timeSavedPerProfile ?? [], b1Profiles, uc.estimatedDevCostEur ?? 0, annualReps, targetHours, ccPerYear);
  if (!roi) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <TrendingUp size={10} />
        <span className="font-medium">Net: €{Math.round(roi.netAnnualSaving).toLocaleString('de-DE')}/yr</span>
      </div>
      {roi.computeCostPerYear > 0 && (
        <div className="text-amber-600">Compute: −€{Math.round(roi.computeCostPerYear).toLocaleString('de-DE')}/yr</div>
      )}
      {roi.savingPct !== null && (
        <div className="text-muted">{roi.savingPct}% of targeted activities</div>
      )}
      {roi.paybackMonths > 0 && (
        <div className="text-muted">Payback: {roi.paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} mo</div>
      )}
    </div>
  );
}

export default function AuditUseCasesPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [useCases, setUseCases] = useState<AuditUseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | UseCaseStatus>('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      apiUrl(
        `/api/audits/${auditId}/usecases${showArchived ? '?archived=true' : ''}`,
      ),
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((data) => {
        setUseCases(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, showArchived]);

  const filtered = useCases.filter((uc) => {
    if (filter !== 'all' && uc.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        uc.description.toLowerCase().includes(q) ||
        uc.cuId.toLowerCase().includes(q) ||
        (uc.processId as any)?.name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: useCases.length,
    eligible: useCases.filter((u) => u.status === 'eligible').length,
    in_poc: useCases.filter((u) => u.status === 'in_poc').length,
    discarded: useCases.filter((u) => u.status === 'discarded').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">
            Use Cases
          </h1>
          <p className="text-sm text-muted mt-0.5">
            All AI opportunities in this audit
          </p>
        </div>
        <a
          href={`/api/audits/${auditId}/export/usecases`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
        >
          <Download size={13} />
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          {(['all', 'eligible', 'in_poc', 'discarded'] as const).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}
              >
                {f === 'in_poc' ? 'In POC' : f} ({counts[f]})
              </button>
            ),
          )}
        </div>
        <input
          type="text"
          placeholder="Search use cases…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-border rounded-sm px-3 py-1.5 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria w-64"
        />
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-blue-aria"
          />
          Show archived
        </label>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No use cases found.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {[
                  'ID',
                  'Description',
                  'Process',
                  'AI Types',
                  'People',
                  'Score',
                  'Status',
                  'ROI',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((uc) => {
                const scoreResult = uc.score?.dimensions
                  ? calculateScore(
                      uc.score.dimensions as Parameters<
                        typeof calculateScore
                      >[0],
                    )
                  : null;
                const total = scoreResult?.total ?? null;
                const cat = scoreResult?.category;
                const people = peopleImpacted(uc);
                const proc = uc.processId as any;
                const editHref = proc
                  ? `/audits/${auditId}/processes/${proc._id}/b5?edit=${uc._id}`
                  : null;
                return (
                  <tr
                    key={uc._id}
                    className={`border-b border-border/50 hover:bg-slate-50 cursor-pointer ${uc.isArchived ? 'opacity-60 bg-smoke/40' : ''}`}
                    onClick={() => editHref && router.push(editHref)}
                  >
                    <td
                      className="py-3 px-4 font-mono text-xs font-medium whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {proc ? (
                        <Link
                          href={`/audits/${auditId}/processes/${proc._id}/b5?edit=${uc._id}`}
                          className="text-blue-aria hover:underline"
                        >
                          {uc.cuId}
                        </Link>
                      ) : (
                        <span className="text-blue-aria">{uc.cuId}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-text line-clamp-2" title={uc.description}>{uc.description}</p>
                    </td>
                    <td
                      className="py-3 px-4 text-xs text-muted whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {proc ? (
                        <Link
                          href={`/audits/${auditId}/processes/${proc._id}/b5`}
                          className="text-blue-aria hover:underline"
                        >
                          {proc.procId} · {proc.name || ''}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(uc.aiTypes || []).map((t) => (
                          <Badge key={t} variant={AI_TYPE_COLORS[t]}>
                            {AI_TYPE_LABELS[t]?.label ?? t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {people > 0 ? (
                        <span className="font-bold text-text text-sm">
                          {people}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {total !== null ? (
                        <span className="font-mono font-bold text-text">
                          {total}/30
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={STATUS_VARIANTS[uc.status]}>
                        {uc.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <UCRoi
                        uc={uc}
                        b1Profiles={(uc.processId as any)?.b1?.profiles ?? []}
                        annualReps={(uc.processId as any)?.b3?.annualRepetitions ?? 0}
                        activities={(uc.processId as any)?.b3?.activities ?? []}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
