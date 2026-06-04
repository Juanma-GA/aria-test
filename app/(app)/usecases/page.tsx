'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, TrendingUp, AlertTriangle, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import { AI_TYPE_LABELS } from '@/lib/types';
import type { AIType, UseCaseStatus } from '@/lib/types';
import { calculateScore } from '@/lib/calculations';

interface ProcessData {
  b1Profiles: {
    id: string;
    role: string;
    hourlyRateEur: number;
    count: number;
  }[];
  annualRepetitions: number;
  totalProcessHoursPerRun: number;
  activities: { id: string; name: string }[];
}

interface GlobalUseCase {
  _id: string;
  cuId: string;
  description: string;
  aiTypes: AIType[];
  status: UseCaseStatus;
  estimatedDevCostEur: number;
  estimatedImplWeeks: number;
  timeSavedPerProfile: {
    profileId: string;
    role: string;
    hoursPerExecution: number;
  }[];
  targetActivities?: string[];
  blockedReason?: string;
  blockedAxis?: string;
  unblockCondition?: string;
  notes?: string;
  createdAt: string;
  audit: { _id: string; name: string; client: string } | null;
  process: { _id: string; procId: string; name: string } | null;
  processData?: ProcessData | null;
  score?: {
    dimensions: {
      d1_efficiencyImpact: { value: number; justification?: string };
      d2_qualityImpact: { value: number; justification?: string };
      d3_techMaturity: { value: number; justification?: string };
      d4_dataReadiness: { value: number; justification?: string };
      d5_sovereigntyIndex: { value: number; justification?: string };
      d6_governanceComplexity: { value: number; justification?: string };
    };
    scoringNotes?: string;
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  d1_efficiencyImpact: 'Efficiency Impact',
  d2_qualityImpact: 'Quality Impact',
  d3_techMaturity: 'Tech Maturity',
  d4_dataReadiness: 'Data Readiness',
  d5_sovereigntyIndex: 'Sovereignty Index',
  d6_governanceComplexity: 'Governance Complexity',
};

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

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

function peopleImpacted(uc: GlobalUseCase): number {
  const profiles = uc.processData?.b1Profiles ?? [];
  return (uc.timeSavedPerProfile ?? []).reduce((sum, e) => {
    const p = profiles.find((p) => p.id === e.profileId);
    return sum + (p?.count ?? 0);
  }, 0);
}

function computeRoi(uc: GlobalUseCase) {
  const pd = uc.processData;
  if (!pd) return null;
  const timeSaved = (uc.timeSavedPerProfile ?? []).reduce(
    (s, e) => s + (e.hoursPerExecution ?? 0),
    0,
  );
  if (timeSaved === 0 || pd.annualRepetitions === 0) return null;
  const rates = pd.b1Profiles.map((p) => p.hourlyRateEur).filter((r) => r > 0);
  const avgRate =
    rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  if (avgRate === 0) return null;
  const annualSaving = timeSaved * avgRate * pd.annualRepetitions;
  const paybackMonths =
    uc.estimatedDevCostEur > 0
      ? (uc.estimatedDevCostEur / annualSaving) * 12
      : 0;
  const savingPct =
    pd.totalProcessHoursPerRun > 0
      ? Math.round((timeSaved / pd.totalProcessHoursPerRun) * 100)
      : null;
  return { timeSaved, annualSaving, paybackMonths, savingPct, avgRate };
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-4 h-2 rounded-sm ${i <= value ? 'bg-blue-aria' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-text">{value}/5</span>
    </div>
  );
}

function UCSlideOver({
  uc,
  onClose,
}: {
  uc: GlobalUseCase;
  onClose: () => void;
}) {
  const router = useRouter();
  const scoreResult = uc.score?.dimensions
    ? calculateScore(
        uc.score.dimensions as Parameters<typeof calculateScore>[0],
      )
    : null;
  const total = scoreResult?.total ?? null;
  const cat = scoreResult?.category;
  const roi = computeRoi(uc);
  const pd = uc.processData;

  const targetActivityNames = (uc.targetActivities ?? [])
    .map((id) => pd?.activities.find((a) => a.id === id)?.name ?? id)
    .filter(Boolean);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-aria">
              {uc.cuId}
            </span>
            <Badge variant={STATUS_VARIANTS[uc.status]}>
              {uc.status.replace('_', ' ')}
            </Badge>
            {total !== null && (
              <Badge
                variant={
                  cat === 'quick_win'
                    ? 'green'
                    : cat === 'mid_term'
                      ? 'amber'
                      : 'blue'
                }
              >
                {cat === 'quick_win'
                  ? 'Quick Win'
                  : cat === 'mid_term'
                    ? 'Mid-term'
                    : 'Strategic'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {uc.process && uc.audit && (
              <button
                onClick={() => {
                  onClose();
                  router.push(
                    `/audits/${uc.audit!._id}/processes/${uc.process!._id}/b5?edit=${uc._id}`,
                  );
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-blue-aria border border-blue-aria/30 hover:bg-blue-aria hover:text-white transition-colors"
              >
                <Pencil size={12} />
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-200 text-muted hover:text-text transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Description */}
          <p className="text-text text-sm leading-relaxed">{uc.description}</p>

          {/* AI Types */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              AI Types
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(uc.aiTypes ?? []).map((t) => (
                <Badge key={t} variant={AI_TYPE_COLORS[t]}>
                  {AI_TYPE_LABELS[t]?.label ?? t}
                </Badge>
              ))}
            </div>
          </div>

          {/* Audit / Process */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Audit
              </p>
              {uc.audit ? (
                <Link
                  href={`/audits/${uc.audit._id}`}
                  className="text-blue-aria hover:underline text-xs"
                >
                  {uc.audit.name}
                </Link>
              ) : (
                <span className="text-muted text-xs">—</span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Process
              </p>
              <span className="text-xs text-text">
                {uc.process ? `${uc.process.procId} · ${uc.process.name}` : '—'}
              </span>
            </div>
          </div>

          {/* Target Activities */}
          {targetActivityNames.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Target Activities
              </p>
              <ul className="space-y-1">
                {targetActivityNames.map((name, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-xs text-text"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-aria flex-shrink-0" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Time Saved Per Profile */}
          {(uc.timeSavedPerProfile ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Hours Saved Per Run
              </p>
              <div className="space-y-1">
                {uc.timeSavedPerProfile.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted">{e.role}</span>
                    <span className="font-medium text-text">
                      {e.hoursPerExecution}h
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs border-t border-border pt-1 mt-1">
                  <span className="font-semibold text-text">Total</span>
                  <span className="font-bold text-text">
                    {uc.timeSavedPerProfile.reduce(
                      (s, e) => s + e.hoursPerExecution,
                      0,
                    )}
                    h/run
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ROI Block */}
          {roi ? (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                ROI Estimate
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* Annual Saving */}
                <div className="rounded-sm bg-green-50 border border-green-200 p-3">
                  <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">
                    Annual Saving
                  </p>
                  <p className="text-xl font-bold text-green-700 mt-0.5">
                    €{fmt(roi.annualSaving)}
                  </p>
                  <p className="text-[10px] text-green-600 mt-1">
                    {roi.timeSaved}h/run × {pd!.annualRepetitions} runs × €
                    {Math.round(roi.avgRate)}/h
                  </p>
                  {roi.savingPct !== null && (
                    <p className="text-[11px] font-semibold text-green-700 mt-1">
                      {roi.savingPct}% of process time
                    </p>
                  )}
                </div>
                {/* Dev Cost */}
                <div className="rounded-sm bg-red-50 border border-red-200 p-3">
                  <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">
                    Dev Cost
                  </p>
                  <p className="text-xl font-bold text-red-700 mt-0.5">
                    €{fmt(uc.estimatedDevCostEur)}
                  </p>
                  {uc.estimatedImplWeeks > 0 && (
                    <p className="text-[10px] text-red-600 mt-1">
                      {uc.estimatedImplWeeks}w implementation
                    </p>
                  )}
                  {roi.paybackMonths > 0 && (
                    <p className="text-[11px] font-semibold text-red-700 mt-1">
                      Payback in {roi.paybackMonths.toFixed(1)} months
                    </p>
                  )}
                </div>
              </div>
              {/* Process context */}
              <div className="mt-2 text-[10px] text-muted bg-slate-50 rounded-sm px-3 py-2 border border-border">
                Process: {pd!.totalProcessHoursPerRun}h/run ·{' '}
                {pd!.annualRepetitions} runs/yr · Avg rate €
                {Math.round(roi.avgRate)}/h
              </div>
            </div>
          ) : (
            <div className="rounded-sm bg-slate-50 border border-border p-3 text-xs text-muted">
              ROI cannot be computed — missing process profiles or annual
              repetitions data.
            </div>
          )}

          {/* Score */}
          {uc.score?.dimensions && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Score
                </p>
                <span className="text-xs font-mono font-bold text-text">
                  {total}/30
                </span>
              </div>
              <div className="space-y-2">
                {Object.entries(uc.score.dimensions).map(([key, dim]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-muted">
                        {DIMENSION_LABELS[key] ?? key}
                      </span>
                      <ScoreBar value={dim.value} />
                    </div>
                    {dim.justification && (
                      <p className="text-[10px] text-muted italic pl-1">
                        {dim.justification}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {uc.score.scoringNotes && (
                <p className="text-xs text-muted mt-2 italic border-t border-border pt-2">
                  {uc.score.scoringNotes}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {uc.notes && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-xs text-text leading-relaxed">{uc.notes}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function GlobalUseCasesPage() {
  const [useCases, setUseCases] = useState<GlobalUseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | UseCaseStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GlobalUseCase | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/usecases'), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setUseCases(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useCases.filter((uc) => {
    if (filter !== 'all' && uc.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        uc.description.toLowerCase().includes(q) ||
        uc.cuId.toLowerCase().includes(q) ||
        (uc.audit?.name ?? '').toLowerCase().includes(q) ||
        (uc.process?.name ?? '').toLowerCase().includes(q)
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
      {selected && (
        <UCSlideOver uc={selected} onClose={() => setSelected(null)} />
      )}

      <div>
        <h1 className="font-display text-2xl font-bold text-text">Use Cases</h1>
        <p className="text-sm text-muted mt-0.5">
          All AI opportunities across all audits
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          {(['all', 'eligible', 'in_poc', 'discarded'] as const).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-blue-aria text-white'
                    : 'text-muted hover:text-text'
                }`}
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
                  'Audit / Process',
                  'Client',
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
                const roi = computeRoi(uc);
                const people = peopleImpacted(uc);
                return (
                  <tr
                    key={uc._id}
                    className="border-b border-border/50 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(uc)}
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button className="font-mono text-xs text-blue-aria font-medium hover:underline">
                        {uc.cuId}
                      </button>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-text line-clamp-2" title={uc.description}>{uc.description}</p>
                    </td>
                    <td
                      className="py-3 px-4 text-xs text-muted whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {uc.audit ? (
                        <Link
                          href={`/audits/${uc.audit._id}`}
                          className="text-blue-aria hover:underline block"
                        >
                          {uc.audit.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {uc.process && (
                        <span className="text-muted">
                          {uc.process.procId} · {uc.process.name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {uc.audit?.client ?? '—'}
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
                          {total}
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
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {roi ? (
                        <div className="space-y-0.5">
                          <span className="flex items-center gap-1 text-green-600 font-medium">
                            <TrendingUp size={11} />€{fmt(roi.annualSaving)}/yr
                          </span>
                          {roi.savingPct !== null && (
                            <span className="text-muted">
                              {roi.savingPct}% process time
                            </span>
                          )}
                          {roi.paybackMonths > 0 && (
                            <span className="text-muted">
                              {roi.paybackMonths.toFixed(1)}mo payback
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
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
