'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { IndustrializationStatus } from '@/lib/types';
import { apiUrl } from '@/lib/utils';
import { INDUSTRIALIZATION_STATUS_LABELS } from '@/lib/types';

const POC_PHASE_COLORS: Record<string, string> = {
  design: '#94a3b8',
  execution: '#1B6CA8',
  evaluation: '#f59e0b',
  closed: '#22c55e',
};

const POC_PHASE_VARIANTS: Record<string, 'slate' | 'blue' | 'amber' | 'green'> =
  {
    design: 'slate',
    execution: 'blue',
    evaluation: 'amber',
    closed: 'green',
  };

const IND_STATUS_COLORS: Record<IndustrializationStatus, string> = {
  pending_customer_validation: '#D97706',
  planned: '#94a3b8',
  work_in_progress: '#1B6CA8',
  go_for_run: '#16a34a',
  stand_by: '#7c3aed',
  cancelled: '#b91c1c',
};

const IND_STATUS_VARIANTS: Record<
  IndustrializationStatus,
  'slate' | 'blue' | 'amber' | 'green' | 'purple' | 'red'
> = {
  pending_customer_validation: 'amber',
  planned: 'slate',
  work_in_progress: 'blue',
  go_for_run: 'green',
  stand_by: 'purple',
  cancelled: 'red',
};

const MILESTONE_COLORS: Record<string, string> = {
  done: '#22c55e',
  missed: '#ef4444',
  pending: '#94a3b8',
};

const LABEL_W = 280;

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  );
}
function formatMonth(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
function dateToPct(d: Date, start: Date, total: number): number {
  const months = monthsBetween(start, startOfMonth(d));
  const day = (d.getDate() - 1) / 30;
  return Math.max(0, Math.min(100, ((months + day) / total) * 100));
}

interface Milestone {
  id: string;
  name: string;
  dueDate: string;
  status: 'pending' | 'done' | 'missed';
}

interface POCRow {
  _id: string;
  pocId: string;
  name?: string;
  phase: 'design' | 'execution' | 'evaluation' | 'closed';
  design: {
    startDate: string;
    deadlineDate: string;
    measurableObjective?: string;
  };
  execution?: { milestones: Milestone[] };
  useCaseId?: { _id: string; cuId?: string; description?: string } | string;
  processId?: { _id: string; procId?: string; name?: string } | string;
}

interface IndRow {
  _id: string;
  industrializationId: string;
  name?: string;
  status: IndustrializationStatus;
  pocId: string | { _id: string; pocId?: string; name?: string };
  useCaseId: string | { _id: string; cuId?: string; description?: string };
  processId?: string | { _id: string; procId?: string; name?: string };
  plan?: { startDate?: string; targetGoLiveDate?: string };
  milestones?: Milestone[];
}

type GroupBy = 'list' | 'usecase';

export default function AuditRoadmapPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [pocs, setPocs] = useState<POCRow[]>([]);
  const [inds, setInds] = useState<IndRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('list');
  const [showPocs, setShowPocs] = useState(true);
  const [showInds, setShowInds] = useState(true);
  const [pocPhaseFilter, setPocPhaseFilter] = useState<
    'all' | 'design' | 'execution' | 'evaluation' | 'closed'
  >('all');
  const [indStatusFilter, setIndStatusFilter] = useState<
    'all' | IndustrializationStatus
  >('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl(`/api/audits/${auditId}/pocs`), {
        credentials: 'include',
      }).then((r) => r.json()),
      fetch(apiUrl(`/api/audits/${auditId}/industrializations`), {
        credentials: 'include',
      }).then((r) => r.json()),
    ])
      .then(([p, i]) => {
        setPocs(Array.isArray(p) ? p : []);
        setInds(Array.isArray(i) ? i : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  const datedPocs = pocs.filter(
    (p) => p.design?.startDate && p.design?.deadlineDate,
  );
  const datedInds = inds.filter(
    (i) => i.plan?.startDate && i.plan?.targetGoLiveDate,
  );
  const visiblePocs = showPocs
    ? datedPocs.filter(
        (p) => pocPhaseFilter === 'all' || p.phase === pocPhaseFilter,
      )
    : [];
  const visibleInds = showInds
    ? datedInds.filter(
        (i) => indStatusFilter === 'all' || i.status === indStatusFilter,
      )
    : [];

  const allDates: Date[] = [];
  for (const p of visiblePocs) {
    allDates.push(
      new Date(p.design.startDate),
      new Date(p.design.deadlineDate),
    );
    for (const ms of p.execution?.milestones ?? [])
      if (ms.dueDate) allDates.push(new Date(ms.dueDate));
  }
  for (const i of visibleInds) {
    allDates.push(
      new Date(i.plan!.startDate!),
      new Date(i.plan!.targetGoLiveDate!),
    );
    for (const ms of i.milestones ?? [])
      if (ms.dueDate) allDates.push(new Date(ms.dueDate));
  }

  let ganttStart: Date, ganttEnd: Date;
  if (allDates.length > 0) {
    ganttStart = startOfMonth(
      new Date(Math.min(...allDates.map((d) => d.getTime()))),
    );
    ganttEnd = startOfMonth(
      addMonths(new Date(Math.max(...allDates.map((d) => d.getTime()))), 1),
    );
  } else {
    ganttStart = startOfMonth(new Date());
    ganttEnd = startOfMonth(addMonths(new Date(), 3));
  }

  const totalMonths = Math.max(monthsBetween(ganttStart, ganttEnd), 1);
  const months: Date[] = Array.from({ length: totalMonths }, (_, i) =>
    addMonths(ganttStart, i),
  );
  const monthWidth = Math.floor(Math.max(containerWidth - LABEL_W, 0) / 3);
  const ganttW = monthWidth * totalMonths;
  const todayPct = dateToPct(new Date(), ganttStart, totalMonths);
  const showToday = todayPct >= 0 && todayPct <= 100;

  const indByPoc = new Map<string, IndRow>();
  for (const i of visibleInds) {
    const pid = typeof i.pocId === 'object' ? i.pocId._id : String(i.pocId);
    indByPoc.set(pid, i);
  }
  const visiblePocIds = new Set(visiblePocs.map((p) => p._id));
  const orphanInds = visibleInds.filter((i) => {
    const pid = typeof i.pocId === 'object' ? i.pocId._id : String(i.pocId);
    return !visiblePocIds.has(pid);
  });

  const empty = visiblePocs.length === 0 && visibleInds.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-display font-bold text-text">
            Audit Roadmap
          </h1>
          <span className="text-muted text-sm">
            — {pocs.length} POCs · {inds.length} Industrializations
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/audits/${auditId}/pocs`)}
            className="btn-secondary flex items-center gap-1 text-xs"
          >
            <ExternalLink size={13} /> POCs
          </button>
          <button
            onClick={() => router.push(`/audits/${auditId}/industrializations`)}
            className="btn-secondary flex items-center gap-1 text-xs"
          >
            <ExternalLink size={13} /> Industrializations
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          <span className="px-2 py-1.5 text-[11px] text-muted">Group by:</span>
          {(['list', 'usecase'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${groupBy === g ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}
            >
              {g === 'list' ? 'Flat list' : 'Use Case'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 bg-white border border-border rounded-sm px-3 py-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showPocs}
            onChange={(e) => setShowPocs(e.target.checked)}
            className="accent-teal-poc"
          />{' '}
          POCs
        </label>
        <label className="flex items-center gap-1.5 bg-white border border-border rounded-sm px-3 py-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showInds}
            onChange={(e) => setShowInds(e.target.checked)}
            className="accent-indu"
          />{' '}
          Industrializations
        </label>
        {showPocs && (
          <select
            value={pocPhaseFilter}
            onChange={(e) => setPocPhaseFilter(e.target.value as any)}
            className="form-input text-xs h-8 w-auto"
          >
            <option value="all">All POC phases</option>
            <option value="design">Design</option>
            <option value="execution">Execution</option>
            <option value="evaluation">Evaluation</option>
            <option value="closed">Closed</option>
          </select>
        )}
        {showInds && (
          <select
            value={indStatusFilter}
            onChange={(e) => setIndStatusFilter(e.target.value as any)}
            className="form-input text-xs h-8 w-auto"
          >
            <option value="all">All IND statuses</option>
            {(
              Object.keys(
                INDUSTRIALIZATION_STATUS_LABELS,
              ) as IndustrializationStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {INDUSTRIALIZATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>

      {empty ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No items with scheduled dates match the current filters.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="bg-white border border-border rounded-sm overflow-x-auto"
        >
          {/* Legend */}
          <div className="flex items-center gap-5 px-4 pt-3 pb-2 border-b border-border text-xs text-muted flex-wrap">
            {showPocs && (
              <>
                <span className="font-medium text-text">POC phases:</span>
                {Object.entries(POC_PHASE_VARIANTS).map(([phase]) => (
                  <div key={phase} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm inline-block"
                      style={{ backgroundColor: POC_PHASE_COLORS[phase] }}
                    />
                    <span className="capitalize">{phase}</span>
                  </div>
                ))}
              </>
            )}
            {showInds && (
              <>
                <span className="font-medium text-text ml-3">IND status:</span>
                {(
                  Object.keys(
                    INDUSTRIALIZATION_STATUS_LABELS,
                  ) as IndustrializationStatus[]
                ).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm inline-block"
                      style={{ backgroundColor: IND_STATUS_COLORS[s] }}
                    />
                    <span>{INDUSTRIALIZATION_STATUS_LABELS[s]}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ width: LABEL_W + ganttW }}>
            <div className="flex border-b border-border sticky top-0 z-10 bg-white">
              <div
                className="flex-shrink-0 px-4 py-2 text-xs font-medium text-muted bg-slate-50 border-r border-border"
                style={{ width: LABEL_W }}
              >
                {groupBy === 'usecase' ? 'Use Case' : 'Item'}
              </div>
              <div className="flex" style={{ width: ganttW }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    style={{ width: monthWidth, flexShrink: 0 }}
                    className="py-2 px-1 text-center text-[10px] text-muted border-r border-border/40 bg-slate-50"
                  >
                    {formatMonth(m)}
                  </div>
                ))}
              </div>
            </div>

            {groupBy === 'list' ? (
              <>
                {visiblePocs.map((poc) => {
                  const ind = indByPoc.get(poc._id);
                  const ms = (poc.execution?.milestones ?? []).filter(
                    (m) => m.dueDate,
                  );
                  return (
                    <div key={poc._id}>
                      <RowPOC
                        poc={poc}
                        ganttStart={ganttStart}
                        totalMonths={totalMonths}
                        ganttW={ganttW}
                        monthWidth={monthWidth}
                        months={months}
                        showToday={showToday}
                        todayPct={todayPct}
                        onClick={() =>
                          router.push(`/audits/${auditId}/pocs/${poc._id}`)
                        }
                        milestones={ms}
                      />
                      {ind && (
                        <RowInd
                          ind={ind}
                          ganttStart={ganttStart}
                          totalMonths={totalMonths}
                          ganttW={ganttW}
                          monthWidth={monthWidth}
                          months={months}
                          showToday={showToday}
                          todayPct={todayPct}
                          indented
                          onClick={() =>
                            router.push(
                              `/audits/${auditId}/industrializations/${ind._id}`,
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
                {orphanInds.map((ind) => (
                  <RowInd
                    key={ind._id}
                    ind={ind}
                    ganttStart={ganttStart}
                    totalMonths={totalMonths}
                    ganttW={ganttW}
                    monthWidth={monthWidth}
                    months={months}
                    showToday={showToday}
                    todayPct={todayPct}
                    onClick={() =>
                      router.push(
                        `/audits/${auditId}/industrializations/${ind._id}`,
                      )
                    }
                  />
                ))}
              </>
            ) : (
              renderByUseCase({
                visiblePocs,
                visibleInds,
                ganttStart,
                totalMonths,
                ganttW,
                monthWidth,
                months,
                showToday,
                todayPct,
                auditId,
                router,
              })
            )}

            {showToday && (
              <div className="relative h-4 border-t border-border/30">
                <div
                  className="absolute -translate-x-1/2 text-[9px] text-red-500 font-medium whitespace-nowrap"
                  style={{ left: `calc(${todayPct}% + ${LABEL_W}px)` }}
                >
                  Today
                </div>
              </div>
            )}

            {(() => {
              const hidden =
                pocs.filter(
                  (p) => !p.design?.startDate || !p.design?.deadlineDate,
                ).length +
                inds.filter(
                  (i) => !i.plan?.startDate || !i.plan?.targetGoLiveDate,
                ).length;
              if (hidden === 0) return null;
              return (
                <div className="px-4 py-3 text-xs text-muted border-t border-border bg-slate-50">
                  {hidden} item(s) not shown — missing start/end dates.
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  ganttStart: Date;
  totalMonths: number;
  ganttW: number;
  monthWidth: number;
  months: Date[];
  showToday: boolean;
  todayPct: number;
  onClick: () => void;
}

function RowPOC({
  poc,
  milestones,
  indented,
  ...r
}: RowProps & { poc: POCRow; milestones: Milestone[]; indented?: boolean }) {
  const start = new Date(poc.design.startDate);
  const end = new Date(poc.design.deadlineDate);
  const leftPct = dateToPct(start, r.ganttStart, r.totalMonths);
  const rightPct = dateToPct(end, r.ganttStart, r.totalMonths);
  const widthPct = Math.max(rightPct - leftPct, 0.5);
  const uc = typeof poc.useCaseId === 'object' ? poc.useCaseId : null;
  const proc = typeof poc.processId === 'object' ? poc.processId : null;
  const procLabel = proc?.procId
    ? `${proc.procId}${proc.name ? ' · ' + proc.name : ''}`
    : '';
  const objective = poc.design?.measurableObjective ?? '';
  return (
    <div
      className="flex border-b border-border/50 hover:bg-slate-50/50 cursor-pointer group transition-colors"
      style={{ minHeight: milestones.length > 0 ? 72 : 52 }}
      onClick={r.onClick}
    >
      <div
        className={`flex-shrink-0 ${indented ? 'pl-8 pr-4' : 'px-4'} py-3 border-r border-border flex flex-col justify-center gap-0.5`}
        style={{ width: LABEL_W }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs font-bold text-teal-poc">
            {poc.pocId}
          </span>
          <Badge variant={POC_PHASE_VARIANTS[poc.phase]}>{poc.phase}</Badge>
        </div>
        {(poc.name || objective) && (
          <p
            className="text-xs text-text font-semibold truncate"
            title={poc.name || objective}
          >
            {poc.name || objective}
          </p>
        )}
        <div className="text-[10px] text-muted truncate">
          {uc?.cuId && <span className="font-mono">{uc.cuId}</span>}
          {procLabel && <span className="ml-1">· {procLabel}</span>}
        </div>
      </div>
      <div className="relative py-3" style={{ width: r.ganttW }}>
        <Grid months={r.months} monthWidth={r.monthWidth} />
        {r.showToday && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{
              left: `${r.todayPct}%`,
              width: 1,
              backgroundColor: '#ef4444',
              opacity: 0.5,
            }}
          />
        )}
        <div
          className="absolute rounded-sm flex items-center px-2 overflow-hidden group-hover:opacity-90"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            minWidth: 6,
            height: 20,
            top:
              milestones.length > 0 ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
            backgroundColor: POC_PHASE_COLORS[poc.phase],
          }}
          title={`${poc.pocId} · ${start.toLocaleDateString('en-GB')} → ${end.toLocaleDateString('en-GB')}`}
        >
          <span className="text-white text-[10px] font-medium truncate">
            {poc.pocId}
          </span>
        </div>
        <Markers
          milestones={milestones}
          ganttStart={r.ganttStart}
          totalMonths={r.totalMonths}
        />
      </div>
    </div>
  );
}

function RowInd({
  ind,
  indented,
  ...r
}: RowProps & { ind: IndRow; indented?: boolean }) {
  const start = new Date(ind.plan!.startDate!);
  const end = new Date(ind.plan!.targetGoLiveDate!);
  const leftPct = dateToPct(start, r.ganttStart, r.totalMonths);
  const rightPct = dateToPct(end, r.ganttStart, r.totalMonths);
  const widthPct = Math.max(rightPct - leftPct, 0.5);
  const ms = (ind.milestones ?? []).filter((m) => m.dueDate);
  const poc = typeof ind.pocId === 'object' ? ind.pocId : null;
  return (
    <div
      className={`flex border-b border-border/40 cursor-pointer group transition-colors hover:bg-indu-light/40`}
      style={{
        minHeight: ms.length > 0 ? 60 : 44,
        backgroundColor: indented ? 'rgba(255,237,213,0.25)' : undefined,
      }}
      onClick={r.onClick}
    >
      <div
        className={`flex-shrink-0 ${indented ? 'pl-8 pr-4' : 'px-4'} py-2 border-r border-border flex flex-col justify-center gap-0.5`}
        style={{ width: LABEL_W }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {indented && <span className="text-[10px] text-muted">↳</span>}
          <span className="font-mono text-[11px] font-bold text-indu">
            {ind.industrializationId}
          </span>
          <Badge variant={IND_STATUS_VARIANTS[ind.status]}>
            {INDUSTRIALIZATION_STATUS_LABELS[ind.status]}
          </Badge>
        </div>
        {ind.name && (
          <p className="text-[11px] text-text truncate" title={ind.name}>
            {ind.name}
          </p>
        )}
        {!indented && poc?.pocId && (
          <p className="text-[10px] text-muted font-mono">from {poc.pocId}</p>
        )}
      </div>
      <div className="relative py-3" style={{ width: r.ganttW }}>
        <Grid months={r.months} monthWidth={r.monthWidth} />
        {r.showToday && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{
              left: `${r.todayPct}%`,
              width: 1,
              backgroundColor: '#ef4444',
              opacity: 0.5,
            }}
          />
        )}
        <div
          className="absolute rounded-sm flex items-center px-2 overflow-hidden group-hover:opacity-90"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            minWidth: 6,
            height: 20,
            top: ms.length > 0 ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
            backgroundColor: IND_STATUS_COLORS[ind.status],
          }}
          title={`${ind.industrializationId} · ${start.toLocaleDateString('en-GB')} → ${end.toLocaleDateString('en-GB')} · ${INDUSTRIALIZATION_STATUS_LABELS[ind.status]}`}
        >
          <span className="text-white text-[10px] font-medium truncate">
            {ind.industrializationId}
          </span>
        </div>
        <Markers
          milestones={ms}
          ganttStart={r.ganttStart}
          totalMonths={r.totalMonths}
        />
      </div>
    </div>
  );
}

function Grid({ months, monthWidth }: { months: Date[]; monthWidth: number }) {
  return (
    <div className="absolute inset-0 flex pointer-events-none">
      {months.map((_, i) => (
        <div
          key={i}
          style={{ width: monthWidth, flexShrink: 0 }}
          className="border-r border-border/20 h-full"
        />
      ))}
    </div>
  );
}

function Markers({
  milestones,
  ganttStart,
  totalMonths,
}: {
  milestones: Milestone[];
  ganttStart: Date;
  totalMonths: number;
}) {
  return (
    <>
      {milestones
        .filter((ms) => ms.dueDate)
        .map((ms) => {
          const pct = dateToPct(new Date(ms.dueDate), ganttStart, totalMonths);
          const color = MILESTONE_COLORS[ms.status] ?? MILESTONE_COLORS.pending;
          const date = new Date(ms.dueDate).toLocaleDateString('en-GB');
          return (
            <div
              key={ms.id}
              className="absolute flex flex-col items-center"
              style={{ left: `calc(${pct}% - 5px)`, top: 'calc(50%)' }}
              title={`${ms.name}\n${date} · ${ms.status}`}
            >
              <div
                className="w-2.5 h-2.5 rotate-45 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span
                className="text-[9px] font-medium whitespace-nowrap mt-0.5 leading-none"
                style={{
                  color,
                  maxWidth: 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}
                title={ms.name}
              >
                {ms.name.length > 10 ? ms.name.slice(0, 9) + '…' : ms.name}
              </span>
            </div>
          );
        })}
    </>
  );
}

interface UCArgs {
  visiblePocs: POCRow[];
  visibleInds: IndRow[];
  ganttStart: Date;
  totalMonths: number;
  ganttW: number;
  monthWidth: number;
  months: Date[];
  showToday: boolean;
  todayPct: number;
  auditId: string;
  router: ReturnType<typeof useRouter>;
}

function renderByUseCase({
  visiblePocs,
  visibleInds,
  ganttStart,
  totalMonths,
  ganttW,
  monthWidth,
  months,
  showToday,
  todayPct,
  auditId,
  router,
}: UCArgs) {
  const groups = new Map<
    string,
    { cuId: string; description?: string; pocs: POCRow[]; inds: IndRow[] }
  >();

  for (const p of visiblePocs) {
    const ucKey =
      (typeof p.useCaseId === 'object'
        ? p.useCaseId._id
        : String(p.useCaseId)) ?? p._id;
    const uc = typeof p.useCaseId === 'object' ? p.useCaseId : null;
    if (!groups.has(ucKey))
      groups.set(ucKey, {
        cuId: uc?.cuId ?? '—',
        description: uc?.description,
        pocs: [],
        inds: [],
      });
    groups.get(ucKey)!.pocs.push(p);
  }
  for (const i of visibleInds) {
    const ucKey =
      typeof i.useCaseId === 'object' ? i.useCaseId._id : String(i.useCaseId);
    const uc = typeof i.useCaseId === 'object' ? i.useCaseId : null;
    if (!groups.has(ucKey))
      groups.set(ucKey, {
        cuId: uc?.cuId ?? '—',
        description: uc?.description,
        pocs: [],
        inds: [],
      });
    groups.get(ucKey)!.inds.push(i);
  }

  return [...groups.entries()].map(([ucId, g]) => {
    const allMs: Milestone[] = [];
    for (const p of g.pocs)
      for (const m of p.execution?.milestones ?? [])
        if (m.dueDate) allMs.push(m as Milestone);
    for (const i of g.inds)
      for (const m of i.milestones ?? [])
        if (m.dueDate) allMs.push(m as Milestone);
    const hasMs = allMs.length > 0;

    const poc = g.pocs[0];
    const ind = g.inds[0];
    let connector: { fromPct: number; toPct: number } | null = null;
    if (poc && ind && poc.design?.deadlineDate && ind.plan?.startDate) {
      const fromPct = dateToPct(
        new Date(poc.design.deadlineDate),
        ganttStart,
        totalMonths,
      );
      const toPct = dateToPct(
        new Date(ind.plan.startDate),
        ganttStart,
        totalMonths,
      );
      if (toPct > fromPct) connector = { fromPct, toPct };
    }

    const target = ind
      ? `/audits/${auditId}/industrializations/${ind._id}`
      : poc
        ? `/audits/${auditId}/pocs/${poc._id}`
        : null;

    return (
      <div
        key={ucId}
        className="flex border-b border-border/50 hover:bg-slate-50/50 cursor-pointer group"
        style={{ minHeight: hasMs ? 76 : 56 }}
        onClick={() => target && router.push(target)}
      >
        <div
          className="flex-shrink-0 px-4 py-2 border-r border-border flex flex-col justify-center gap-0.5"
          style={{ width: LABEL_W }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-purple-aria">
              {g.cuId}
            </span>
            {g.pocs.map((p) => (
              <Badge key={p._id} variant={POC_PHASE_VARIANTS[p.phase]}>
                POC
              </Badge>
            ))}
            {g.inds.map((i) => (
              <Badge key={i._id} variant={IND_STATUS_VARIANTS[i.status]}>
                IND
              </Badge>
            ))}
          </div>
          {g.description && (
            <p className="text-xs text-text truncate" title={g.description}>
              {g.description}
            </p>
          )}
        </div>
        <div className="relative py-3" style={{ width: ganttW }}>
          <Grid months={months} monthWidth={monthWidth} />
          {showToday && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: `${todayPct}%`,
                width: 1,
                backgroundColor: '#ef4444',
                opacity: 0.5,
              }}
            />
          )}
          {connector && (
            <div
              className="absolute"
              style={{
                left: `${connector.fromPct}%`,
                width: `${connector.toPct - connector.fromPct}%`,
                top: 'calc(50% - 1px)',
                height: 2,
                background:
                  'repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 8px)',
              }}
              title="POC → Industrialization handoff"
            />
          )}
          {g.pocs.map((p) => {
            const s = new Date(p.design.startDate);
            const e = new Date(p.design.deadlineDate);
            const lp = dateToPct(s, ganttStart, totalMonths);
            const rp = dateToPct(e, ganttStart, totalMonths);
            return (
              <div
                key={p._id}
                className="absolute rounded-sm flex items-center px-2 overflow-hidden"
                style={{
                  left: `${lp}%`,
                  width: `${Math.max(rp - lp, 0.5)}%`,
                  minWidth: 6,
                  height: 20,
                  top: hasMs ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
                  backgroundColor: POC_PHASE_COLORS[p.phase],
                }}
                title={`${p.pocId} · ${s.toLocaleDateString('en-GB')} → ${e.toLocaleDateString('en-GB')}`}
              >
                <span className="text-white text-[10px] font-medium truncate">
                  {p.pocId}
                </span>
              </div>
            );
          })}
          {g.inds.map((i) => {
            const s = new Date(i.plan!.startDate!);
            const e = new Date(i.plan!.targetGoLiveDate!);
            const lp = dateToPct(s, ganttStart, totalMonths);
            const rp = dateToPct(e, ganttStart, totalMonths);
            return (
              <div
                key={i._id}
                className="absolute rounded-sm flex items-center px-2 overflow-hidden"
                style={{
                  left: `${lp}%`,
                  width: `${Math.max(rp - lp, 0.5)}%`,
                  minWidth: 6,
                  height: 20,
                  top: hasMs ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
                  backgroundColor: IND_STATUS_COLORS[i.status],
                }}
                title={`${i.industrializationId} · ${s.toLocaleDateString('en-GB')} → ${e.toLocaleDateString('en-GB')} · ${INDUSTRIALIZATION_STATUS_LABELS[i.status]}`}
              >
                <span className="text-white text-[10px] font-medium truncate">
                  {i.industrializationId}
                </span>
              </div>
            );
          })}
          <Markers
            milestones={allMs}
            ganttStart={ganttStart}
            totalMonths={totalMonths}
          />
        </div>
      </div>
    );
  });
}
