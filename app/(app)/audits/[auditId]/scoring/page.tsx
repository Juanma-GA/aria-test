'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { calculateScore } from '@/lib/calculations';
import { apiUrl } from '@/lib/utils';
import { SCORING_RUBRIC } from '@/lib/types';
import type { UseCase, ScoreValue } from '@/lib/types';

const CATEGORY_LABELS = {
  quick_win: 'Quick Win',
  mid_term: 'Mid-term',
  strategic: 'Strategic',
};
const CATEGORY_COLORS = {
  quick_win: 'green',
  mid_term: 'blue',
  strategic: 'purple',
} as const;

const DIM_KEYS = [
  'd1_efficiencyImpact',
  'd2_qualityImpact',
  'd3_techMaturity',
  'd4_dataReadiness',
  'd5_sovereigntyIndex',
  'd6_governanceComplexity',
] as const;
const DIM_SHORT = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
const RUBRIC_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

function ScoreCell({
  value,
  autoFilled,
  onChange,
}: {
  value: number | undefined;
  autoFilled?: boolean;
  onChange: (v: ScoreValue) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="radiogroup"
        className={`inline-flex overflow-hidden rounded border ${
          autoFilled
            ? 'border-amber-sov'
            : value === undefined
              ? 'border-dashed border-border'
              : 'border-border'
        }`}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(n as ScoreValue)}
              className={`w-5 h-6 text-xs leading-none font-medium transition-colors
                ${
                  active
                    ? autoFilled
                      ? 'bg-amber-sov text-white'
                      : 'bg-blue-aria text-white'
                    : 'bg-white text-muted hover:bg-blue-pale hover:text-blue-aria'
                }
                ${n < 5 ? 'border-r border-border' : ''}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {autoFilled && (
        <span
          className="text-[10px] text-amber-sov leading-none"
          title="Auto-filled from B2"
        >
          ↗B2
        </span>
      )}
    </div>
  );
}

function TotalBadge({ total }: { total: number }) {
  const color =
    total >= 22
      ? 'bg-green-sov text-white'
      : total >= 14
        ? 'bg-blue-pale text-blue-aria'
        : 'bg-purple-aria-light text-purple-aria';
  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-7 rounded font-bold text-sm ${color}`}
    >
      {total}
    </span>
  );
}

function TooltipHeader({ short }: { short: string }) {
  const rubricKey = RUBRIC_KEYS[DIM_SHORT.indexOf(short)];
  const rubric = SCORING_RUBRIC[rubricKey];
  return (
    <th className="py-2 px-2 text-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 justify-center text-xs font-medium text-muted cursor-help">
            {short} <Info size={11} />
          </span>
        </TooltipTrigger>
        {rubric && (
          <TooltipContent side="bottom" className="w-60 space-y-1 p-3">
            <div className="font-semibold text-blue-light mb-2">
              {rubric.label}
            </div>
            {Object.entries(rubric.descriptions).map(
              ([k, v]) =>
                v && (
                  <div key={k} className="flex gap-2">
                    <span className="text-blue-light font-mono">{k}:</span>
                    <span>{v}</span>
                  </div>
                ),
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </th>
  );
}

export default function ScoringPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [filterProcess, setFilterProcess] = useState('all');
  const [processes, setProcesses] = useState<
    { _id: string; procId: string; name: string }[]
  >([]);
  const savingRef = useRef<Record<string, boolean>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const [saveStatus, setSaveStatus] = useState<
    Record<string, 'saved' | 'saving' | 'unsaved'>
  >({});

  const hasUnsaved = Object.values(saveStatus).some(
    (s) => s === 'saving' || s === 'unsaved',
  );
  useBeforeUnload(hasUnsaved);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl(`/api/audits/${auditId}/usecases`), {
        credentials: 'include',
      }).then((r) => r.json()),
      fetch(apiUrl(`/api/audits/${auditId}/processes`), {
        credentials: 'include',
      }).then((r) => r.json()),
    ])
      .then(([ucs, procs]) => {
        const all = Array.isArray(ucs) ? (ucs as UseCase[]) : [];
        setDiscardedCount(all.filter((u) => u.status === 'discarded').length);
        setUseCases(all.filter((u) => u.status !== 'discarded'));
        setProcesses(Array.isArray(procs) ? procs : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId]);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const saveScore = useCallback(
    async (ucId: string, dimensions: UseCase['score']) => {
      if (savingRef.current[ucId]) return;
      savingRef.current[ucId] = true;
      setSaveStatus((s) => ({ ...s, [ucId]: 'saving' }));
      try {
        const res = await fetch(
          apiUrl(`/api/audits/${auditId}/usecases/${ucId}`),
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: dimensions }),
          },
        );
        const updated = await res.json();
        setUseCases((prev) =>
          prev.map((u) => (u._id === ucId ? { ...u, ...updated } : u)),
        );
        setSaveStatus((s) => ({ ...s, [ucId]: 'saved' }));
      } catch {
        setSaveStatus((s) => ({ ...s, [ucId]: 'saved' }));
      } finally {
        savingRef.current[ucId] = false;
      }
    },
    [auditId],
  );

  const updateDimension = (ucId: string, dimKey: string, value: ScoreValue) => {
    let pendingScore: UseCase['score'] | undefined;
    setUseCases((prev) =>
      prev.map((u) => {
        if (u._id !== ucId) return u;
        const newDims = {
          ...(u.score?.dimensions || {}),
          [dimKey]: {
            ...(u.score?.dimensions?.[
              dimKey as keyof typeof u.score.dimensions
            ] || {}),
            value,
          },
        };
        const updated = {
          ...u,
          score: { ...u.score, dimensions: newDims } as UseCase['score'],
        };
        pendingScore = updated.score;
        return updated;
      }),
    );
    setSaveStatus((s) => ({ ...s, [ucId]: 'unsaved' }));
    if (debounceTimers.current[ucId])
      clearTimeout(debounceTimers.current[ucId]);
    debounceTimers.current[ucId] = setTimeout(() => {
      if (pendingScore) saveScore(ucId, pendingScore);
      delete debounceTimers.current[ucId];
    }, 1000);
  };

  const filtered =
    filterProcess === 'all'
      ? useCases
      : useCases.filter((u) => u.processId === filterProcess);

  // Summary stats
  const scored = useCases.filter((u) => u.score?.scoredAt);
  const cats = { quick_win: 0, mid_term: 0, strategic: 0 };
  scored.forEach((u) => {
    if (u.score?.dimensions) {
      const { category } = calculateScore(
        u.score.dimensions as Parameters<typeof calculateScore>[0],
      );
      cats[category]++;
    }
  });

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-muted hover:text-text"
            >
              <ArrowLeft size={18} />
            </button>
            <Badge variant="blue">B6</Badge>
            <h1 className="text-xl font-display font-bold text-text">
              Scoring
            </h1>
            <span className="text-muted text-sm">
              — {useCases.length} use cases to score
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded bg-green-sov" /> Quick Win:{' '}
              {cats.quick_win}
              <span className="w-3 h-3 rounded bg-blue-aria ml-2" /> Mid-term:{' '}
              {cats.mid_term}
              <span className="w-3 h-3 rounded bg-purple-aria ml-2" />{' '}
              Strategic: {cats.strategic}
            </span>
          </div>
        </div>

        {discardedCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded border border-amber-sov/40 bg-amber-sov-light px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-amber-sov">
              <AlertTriangle size={16} />
              <strong>{discardedCount}</strong> use{' '}
              {discardedCount === 1 ? 'case is' : 'cases are'} discarded
              and excluded from scoring.
            </span>
            <Link
              href={`/audits/${auditId}/usecases?status=discarded`}
              className="text-amber-sov font-medium hover:underline"
            >
              View →
            </Link>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <label className="form-label mb-0">Filter by process:</label>
          <select
            className="form-input w-56"
            value={filterProcess}
            onChange={(e) => setFilterProcess(e.target.value)}
          >
            <option value="all">All processes</option>
            {processes.map((p) => (
              <option key={p._id} value={p._id}>
                {p.procId} — {p.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-12 text-center text-muted text-sm">
            No eligible use cases to score. Add use cases in B5 and ensure they
            are not discarded.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-smoke border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted w-20">
                    CU-ID
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted w-20">
                    PROC
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted">
                    Description
                  </th>
                  {DIM_SHORT.map((d) => (
                    <TooltipHeader key={d} short={d} />
                  ))}
                  <th className="py-2 px-3 text-center text-xs font-medium text-muted w-16">
                    Total
                  </th>
                  <th className="py-2 px-3 text-xs font-medium text-muted w-28">
                    Category
                  </th>
                  <th className="py-2 px-3 text-xs font-medium text-muted w-20">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((uc) => {
                  const dims = uc.score?.dimensions;
                  const hasAllDims =
                    dims && DIM_KEYS.every((k) => dims[k]?.value);
                  const scoreResult =
                    dims && hasAllDims
                      ? calculateScore(
                          dims as Parameters<typeof calculateScore>[0],
                        )
                      : null;

                  return (
                    <tr
                      key={uc._id}
                      className="border-b border-border/50 hover:bg-smoke/30"
                    >
                      <td className="py-3 px-3">
                        <span className="font-mono text-xs text-blue-aria font-medium">
                          {uc.cuId}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="amber">{uc.procId || '—'}</Badge>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        <p
                          className="text-sm line-clamp-2"
                          title={uc.description}
                        >
                          {uc.description}
                        </p>
                      </td>
                      {DIM_KEYS.map((dimKey) => {
                        const dim = dims?.[dimKey];
                        const isD5 = dimKey === 'd5_sovereigntyIndex';
                        return (
                          <td key={dimKey} className="py-3 px-2 text-center">
                            <ScoreCell
                              value={dim?.value}
                              autoFilled={
                                isD5 &&
                                (dim as { autoFilled?: boolean })?.autoFilled
                              }
                              onChange={(v) =>
                                updateDimension(uc._id, dimKey, v)
                              }
                            />
                          </td>
                        );
                      })}
                      <td className="py-3 px-2 text-center">
                        {scoreResult ? (
                          <TotalBadge total={scoreResult.total} />
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {scoreResult ? (
                          <Badge
                            variant={CATEGORY_COLORS[scoreResult.category]}
                          >
                            {CATEGORY_LABELS[scoreResult.category]}
                          </Badge>
                        ) : (
                          <span className="text-muted text-xs">Not scored</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {saveStatus[uc._id] ? (
                          <SaveIndicator status={saveStatus[uc._id]} />
                        ) : dims && hasAllDims ? (
                          <span className="text-xs text-green-sov flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Scored
                          </span>
                        ) : (
                          <span className="text-xs text-amber-sov">
                            Incomplete
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 card p-4 text-xs text-muted">
          <strong className="text-text">Score thresholds:</strong>{' '}
          <span className="text-green-sov">Quick Win: total ≥22 AND D6 ≥4</span>{' '}
          · <span className="text-blue-aria">Mid-term: total ≥14</span> ·{' '}
          <span className="text-purple-aria">Strategic: total &lt;14</span> · D5
          (amber border) = auto-filled from B2 Sovereignty Index
        </div>
      </div>
    </TooltipProvider>
  );
}
