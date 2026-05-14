'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { IndustrializationStatus } from '@/lib/types';
import { INDUSTRIALIZATION_STATUS_LABELS } from '@/lib/types';

const POC_PHASE_COLORS: Record<string, string> = {
  design: '#94a3b8',
  execution: '#1B6CA8',
  evaluation: '#f59e0b',
  closed: '#22c55e',
};

const POC_PHASE_VARIANTS: Record<string, 'slate' | 'blue' | 'amber' | 'green'> = {
  design: 'slate', execution: 'blue', evaluation: 'amber', closed: 'green',
};

const IND_STATUS_COLORS: Record<IndustrializationStatus, string> = {
  pending_customer_validation: '#D97706',
  planned: '#94a3b8',
  work_in_progress: '#1B6CA8',
  go_for_run: '#16a34a',
  stand_by: '#7c3aed',
  cancelled: '#b91c1c',
};

const IND_STATUS_VARIANTS: Record<IndustrializationStatus, 'slate' | 'blue' | 'amber' | 'green' | 'purple' | 'red'> = {
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

function addMonths(date: Date, n: number): Date { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
function startOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
function monthsBetween(a: Date, b: Date): number { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }
function formatMonth(date: Date): string { return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); }

function dateToPct(date: Date, ganttStart: Date, totalMonths: number): number {
  const months = monthsBetween(ganttStart, startOfMonth(date));
  const dayFraction = (date.getDate() - 1) / 30;
  return Math.max(0, Math.min(100, ((months + dayFraction) / totalMonths) * 100));
}

interface Milestone { id: string; name: string; dueDate: string; status: 'pending' | 'done' | 'missed' }

interface EnrichedPOC {
  _id: string;
  pocId: string;
  name?: string;
  auditId: string;
  phase: 'design' | 'execution' | 'evaluation' | 'closed';
  design?: { startDate?: string; deadlineDate?: string; measurableObjective?: string };
  execution?: { milestones: Milestone[] };
  decision?: { decision?: string };
  audit?: { _id: string; name: string; client?: string; startDate?: string; targetEndDate?: string } | null;
  useCase?: { _id: string; cuId: string; description?: string } | null;
  processId?: { procId?: string; name?: string } | null;
}

interface EnrichedInd {
  _id: string;
  industrializationId: string;
  name?: string;
  auditId: string;
  pocId: string | { _id: string };
  useCaseId: string | { _id: string };
  status: IndustrializationStatus;
  plan?: { startDate?: string; targetGoLiveDate?: string };
  milestones?: Milestone[];
  audit?: { _id: string; name: string; client?: string; startDate?: string; targetEndDate?: string } | null;
  useCase?: { _id: string; cuId: string; description?: string } | null;
  poc?: { _id: string; pocId: string; name?: string } | null;
}

type GroupBy = 'audit' | 'usecase';

export default function GlobalRoadmapPage() {
  const [pocs, setPocs] = useState<EnrichedPOC[]>([]);
  const [inds, setInds] = useState<EnrichedInd[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('audit');
  const [showPocs, setShowPocs] = useState(true);
  const [showInds, setShowInds] = useState(true);
  const [pocPhaseFilter, setPocPhaseFilter] = useState<'all' | 'design' | 'execution' | 'evaluation' | 'closed'>('all');
  const [indStatusFilter, setIndStatusFilter] = useState<'all' | IndustrializationStatus>('all');
  const [auditFilter, setAuditFilter] = useState<Set<string>>(new Set());
  const [clientFilter, setClientFilter] = useState<Set<string>>(new Set());
  const [collapsedAudits, setCollapsedAudits] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch('/api/pocs', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/industrializations', { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([p, i]) => {
        setPocs(Array.isArray(p) ? p : []);
        setInds(Array.isArray(i) ? i : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" className="text-blue-aria" /></div>;

  // Available audits and clients derived from full datasets (regardless of current filters)
  const availableAudits = new Map<string, { name: string; client?: string }>();
  for (const p of pocs) {
    const a = p.audit;
    if (a?._id) availableAudits.set(a._id, { name: a.name, client: a.client });
  }
  for (const i of inds) {
    const a = i.audit;
    if (a?._id) availableAudits.set(a._id, { name: a.name, client: a.client });
  }
  const availableClients = new Set<string>();
  for (const v of availableAudits.values()) if (v.client) availableClients.add(v.client);

  const auditMatches = (auditId?: string, clientName?: string) => {
    if (auditFilter.size > 0 && (!auditId || !auditFilter.has(auditId))) return false;
    if (clientFilter.size > 0 && (!clientName || !clientFilter.has(clientName))) return false;
    return true;
  };

  const datedPocs = pocs.filter(p => p.design?.startDate && p.design?.deadlineDate
    && auditMatches(p.audit?._id ?? p.auditId, p.audit?.client));
  const datedInds = inds.filter(i => i.plan?.startDate && i.plan?.targetGoLiveDate
    && auditMatches(i.audit?._id ?? i.auditId, i.audit?.client));

  const visiblePocs = showPocs
    ? datedPocs.filter(p => pocPhaseFilter === 'all' || p.phase === pocPhaseFilter)
    : [];
  const visibleInds = showInds
    ? datedInds.filter(i => indStatusFilter === 'all' || i.status === indStatusFilter)
    : [];

  const toggleCollapsed = (auditId: string) => {
    setCollapsedAudits(prev => {
      const next = new Set(prev);
      if (next.has(auditId)) next.delete(auditId); else next.add(auditId);
      return next;
    });
  };

  const collapseAll = () => {
    const ids = new Set<string>();
    for (const p of visiblePocs) ids.add(p.audit?._id ?? p.auditId);
    for (const i of visibleInds) ids.add(i.audit?._id ?? i.auditId);
    setCollapsedAudits(ids);
  };
  const expandAll = () => setCollapsedAudits(new Set());

  // Time window across both datasets
  const allDates: Date[] = [];
  for (const p of visiblePocs) {
    allDates.push(new Date(p.design!.startDate!), new Date(p.design!.deadlineDate!));
    for (const ms of p.execution?.milestones ?? []) if (ms.dueDate) allDates.push(new Date(ms.dueDate));
  }
  for (const i of visibleInds) {
    allDates.push(new Date(i.plan!.startDate!), new Date(i.plan!.targetGoLiveDate!));
    for (const ms of i.milestones ?? []) if (ms.dueDate) allDates.push(new Date(ms.dueDate));
  }
  // Include audit duration in the time window when grouping by audit
  if (groupBy === 'audit') {
    const seen = new Set<string>();
    const collect = (a?: EnrichedPOC['audit']) => {
      if (!a?._id || seen.has(a._id)) return;
      seen.add(a._id);
      if (a.startDate) allDates.push(new Date(a.startDate));
      if (a.targetEndDate) allDates.push(new Date(a.targetEndDate));
    };
    for (const p of visiblePocs) collect(p.audit);
    for (const i of visibleInds) collect(i.audit);
  }

  let ganttStart: Date;
  let ganttEnd: Date;
  if (allDates.length > 0) {
    ganttStart = startOfMonth(new Date(Math.min(...allDates.map(d => d.getTime()))));
    ganttEnd = startOfMonth(addMonths(new Date(Math.max(...allDates.map(d => d.getTime()))), 1));
  } else {
    ganttStart = startOfMonth(new Date());
    ganttEnd = startOfMonth(addMonths(new Date(), 3));
  }

  const totalMonths = Math.max(monthsBetween(ganttStart, ganttEnd), 1);
  const months: Date[] = Array.from({ length: totalMonths }, (_, i) => addMonths(ganttStart, i));
  const monthWidth = Math.floor(Math.max(containerWidth - LABEL_W, 0) / 3);
  const ganttW = monthWidth * totalMonths;
  const todayPct = dateToPct(new Date(), ganttStart, totalMonths);
  const showToday = todayPct >= 0 && todayPct <= 100;

  // Index Industrializations by pocId for quick lookup
  const indByPoc = new Map<string, EnrichedInd>();
  for (const i of visibleInds) {
    const pid = typeof i.pocId === 'object' ? i.pocId._id : String(i.pocId);
    indByPoc.set(pid, i);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Global Roadmap</h1>
        <p className="text-sm text-muted mt-0.5">
          {pocs.length} POCs · {inds.length} Industrializations
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          <span className="px-2 py-1.5 text-[11px] text-muted">Group by:</span>
          {(['audit', 'usecase'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${groupBy === g ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}
            >
              {g === 'audit' ? 'Audit' : 'Use Case'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 bg-white border border-border rounded-sm px-3 py-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={showPocs} onChange={e => setShowPocs(e.target.checked)} className="accent-teal-poc" />
          POCs
        </label>
        <label className="flex items-center gap-1.5 bg-white border border-border rounded-sm px-3 py-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={showInds} onChange={e => setShowInds(e.target.checked)} className="accent-indu" />
          Industrializations
        </label>

        {showPocs && (
          <select value={pocPhaseFilter} onChange={e => setPocPhaseFilter(e.target.value as any)} className="form-input text-xs h-8 w-auto">
            <option value="all">All POC phases</option>
            <option value="design">Design</option>
            <option value="execution">Execution</option>
            <option value="evaluation">Evaluation</option>
            <option value="closed">Closed</option>
          </select>
        )}
        {showInds && (
          <select value={indStatusFilter} onChange={e => setIndStatusFilter(e.target.value as any)} className="form-input text-xs h-8 w-auto">
            <option value="all">All IND statuses</option>
            {(Object.keys(INDUSTRIALIZATION_STATUS_LABELS) as IndustrializationStatus[]).map(s => (
              <option key={s} value={s}>{INDUSTRIALIZATION_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}

        <MultiSelectFilter
          label="Audits"
          options={[...availableAudits.entries()].map(([id, v]) => ({ id, label: v.name, sublabel: v.client }))}
          selected={auditFilter}
          onChange={setAuditFilter}
        />
        <MultiSelectFilter
          label="Clients"
          options={[...availableClients].sort().map(c => ({ id: c, label: c }))}
          selected={clientFilter}
          onChange={setClientFilter}
        />

        {groupBy === 'audit' && (
          <div className="flex gap-1 ml-auto text-[11px]">
            <button onClick={collapseAll} className="text-muted hover:text-text px-2 py-1 border border-border rounded-sm">Collapse all</button>
            <button onClick={expandAll} className="text-muted hover:text-text px-2 py-1 border border-border rounded-sm">Expand all</button>
          </div>
        )}
      </div>

      {visiblePocs.length === 0 && visibleInds.length === 0 ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No items with scheduled dates match the current filters.
        </div>
      ) : (
        <div ref={containerRef} className="bg-white border border-border rounded-sm overflow-x-auto">
          {/* Legend */}
          <div className="flex items-center gap-5 px-4 pt-3 pb-2 border-b border-border text-xs text-muted flex-wrap">
            {showPocs && (
              <>
                <span className="font-medium text-text">POC phases:</span>
                {Object.entries(POC_PHASE_VARIANTS).map(([phase]) => (
                  <div key={phase} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: POC_PHASE_COLORS[phase] }} />
                    <span className="capitalize">{phase}</span>
                  </div>
                ))}
              </>
            )}
            {showInds && (
              <>
                <span className="font-medium text-text ml-3">IND status:</span>
                {(Object.keys(INDUSTRIALIZATION_STATUS_LABELS) as IndustrializationStatus[]).map(s => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: IND_STATUS_COLORS[s] }} />
                    <span>{INDUSTRIALIZATION_STATUS_LABELS[s]}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ width: LABEL_W + ganttW }}>
            {/* Month header */}
            <div className="flex border-b border-border sticky top-0 z-10 bg-white">
              <div className="flex-shrink-0 px-4 py-2 text-xs font-medium text-muted bg-slate-50 border-r border-border" style={{ width: LABEL_W }}>
                {groupBy === 'audit' ? 'Item' : 'Use Case'}
              </div>
              <div className="flex" style={{ width: ganttW }}>
                {months.map((m, i) => (
                  <div key={i} style={{ width: monthWidth, flexShrink: 0 }} className="py-2 px-1 text-center text-[10px] text-muted border-r border-border/40 bg-slate-50">
                    {formatMonth(m)}
                  </div>
                ))}
              </div>
            </div>

            {groupBy === 'audit'
              ? renderByAudit({ visiblePocs, visibleInds, indByPoc, ganttStart, totalMonths, ganttW, monthWidth, months, todayPct, showToday, router, collapsedAudits, toggleCollapsed })
              : renderByUseCase({ visiblePocs, visibleInds, indByPoc, ganttStart, totalMonths, ganttW, monthWidth, months, todayPct, showToday, router })}

            {showToday && (
              <div className="relative h-4 border-t border-border/30">
                <div className="absolute -translate-x-1/2 text-[9px] text-red-500 font-medium whitespace-nowrap" style={{ left: `calc(${todayPct}% + ${LABEL_W}px)` }}>
                  Today
                </div>
              </div>
            )}

            {/* Hidden items count */}
            {(() => {
              const hidden =
                pocs.filter(p => !p.design?.startDate || !p.design?.deadlineDate).length +
                inds.filter(i => !i.plan?.startDate || !i.plan?.targetGoLiveDate).length;
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

interface RenderArgs {
  visiblePocs: EnrichedPOC[];
  visibleInds: EnrichedInd[];
  indByPoc: Map<string, EnrichedInd>;
  ganttStart: Date;
  totalMonths: number;
  ganttW: number;
  monthWidth: number;
  months: Date[];
  todayPct: number;
  showToday: boolean;
  router: ReturnType<typeof useRouter>;
  collapsedAudits?: Set<string>;
  toggleCollapsed?: (auditId: string) => void;
}

function POCBar({ poc, ganttStart, totalMonths, hasMilestones }: { poc: EnrichedPOC; ganttStart: Date; totalMonths: number; hasMilestones: boolean }) {
  const start = new Date(poc.design!.startDate!);
  const end = new Date(poc.design!.deadlineDate!);
  const leftPct = dateToPct(start, ganttStart, totalMonths);
  const rightPct = dateToPct(end, ganttStart, totalMonths);
  const widthPct = Math.max(rightPct - leftPct, 0.5);
  return (
    <div
      className="absolute rounded-sm flex items-center px-2 overflow-hidden group-hover:opacity-90 transition-opacity"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        minWidth: 6,
        height: 20,
        top: hasMilestones ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
        backgroundColor: POC_PHASE_COLORS[poc.phase],
      }}
      title={`${poc.pocId} · ${start.toLocaleDateString('en-GB')} → ${end.toLocaleDateString('en-GB')}`}
    >
      <span className="text-white text-[10px] font-medium truncate">{poc.pocId}</span>
    </div>
  );
}

function IndBar({ ind, ganttStart, totalMonths, hasMilestones }: { ind: EnrichedInd; ganttStart: Date; totalMonths: number; hasMilestones: boolean }) {
  const start = new Date(ind.plan!.startDate!);
  const end = new Date(ind.plan!.targetGoLiveDate!);
  const leftPct = dateToPct(start, ganttStart, totalMonths);
  const rightPct = dateToPct(end, ganttStart, totalMonths);
  const widthPct = Math.max(rightPct - leftPct, 0.5);
  return (
    <div
      className="absolute rounded-sm flex items-center px-2 overflow-hidden group-hover:opacity-90 transition-opacity"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        minWidth: 6,
        height: 20,
        top: hasMilestones ? 'calc(50% - 22px)' : 'calc(50% - 10px)',
        backgroundColor: IND_STATUS_COLORS[ind.status],
      }}
      title={`${ind.industrializationId} · ${start.toLocaleDateString('en-GB')} → ${end.toLocaleDateString('en-GB')} · ${INDUSTRIALIZATION_STATUS_LABELS[ind.status]}`}
    >
      <span className="text-white text-[10px] font-medium truncate">{ind.industrializationId}</span>
    </div>
  );
}

function MilestoneMarkers({ milestones, ganttStart, totalMonths }: { milestones: Milestone[]; ganttStart: Date; totalMonths: number }) {
  return (
    <>
      {milestones.filter(ms => ms.dueDate).map(ms => {
        const msPct = dateToPct(new Date(ms.dueDate), ganttStart, totalMonths);
        const color = MILESTONE_COLORS[ms.status] ?? MILESTONE_COLORS.pending;
        const msDate = new Date(ms.dueDate).toLocaleDateString('en-GB');
        return (
          <div
            key={ms.id}
            className="absolute flex flex-col items-center"
            style={{ left: `calc(${msPct}% - 5px)`, top: 'calc(50%)' }}
            title={`${ms.name}\n${msDate} · ${ms.status}`}
          >
            <div className="w-2.5 h-2.5 rotate-45 flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-medium whitespace-nowrap mt-0.5 leading-none" style={{ color, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={ms.name}>
              {ms.name.length > 10 ? ms.name.slice(0, 9) + '…' : ms.name}
            </span>
          </div>
        );
      })}
    </>
  );
}

function GridAndToday({ months, monthWidth, showToday, todayPct }: { months: Date[]; monthWidth: number; showToday: boolean; todayPct: number }) {
  return (
    <>
      <div className="absolute inset-0 flex pointer-events-none">
        {months.map((_, i) => (
          <div key={i} style={{ width: monthWidth, flexShrink: 0 }} className="border-r border-border/20 h-full" />
        ))}
      </div>
      {showToday && (
        <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: `${todayPct}%`, width: 1, backgroundColor: '#ef4444', opacity: 0.5 }} />
      )}
    </>
  );
}

function renderByAudit({ visiblePocs, visibleInds, indByPoc, ganttStart, totalMonths, ganttW, monthWidth, months, todayPct, showToday, router, collapsedAudits, toggleCollapsed }: RenderArgs) {
  const auditGroups = new Map<string, { name: string; client?: string; startDate?: string; targetEndDate?: string; pocs: EnrichedPOC[]; orphanInds: EnrichedInd[] }>();

  // Group POCs by audit
  for (const poc of visiblePocs) {
    const aid = poc.audit?._id ?? poc.auditId ?? 'unknown';
    if (!auditGroups.has(aid)) auditGroups.set(aid, { name: poc.audit?.name ?? 'Unknown Audit', client: poc.audit?.client, startDate: poc.audit?.startDate, targetEndDate: poc.audit?.targetEndDate, pocs: [], orphanInds: [] });
    auditGroups.get(aid)!.pocs.push(poc);
  }

  // Inds whose POC is not visible become "orphan" rows in their audit
  const visiblePocIds = new Set(visiblePocs.map(p => p._id));
  for (const ind of visibleInds) {
    const pocId = typeof ind.pocId === 'object' ? ind.pocId._id : String(ind.pocId);
    if (visiblePocIds.has(pocId)) continue; // will render under its POC
    const aid = ind.audit?._id ?? ind.auditId ?? 'unknown';
    if (!auditGroups.has(aid)) auditGroups.set(aid, { name: ind.audit?.name ?? 'Unknown Audit', client: ind.audit?.client, startDate: ind.audit?.startDate, targetEndDate: ind.audit?.targetEndDate, pocs: [], orphanInds: [] });
    auditGroups.get(aid)!.orphanInds.push(ind);
  }

  return [...auditGroups.entries()].map(([auditId, group]) => {
    const isCollapsed = collapsedAudits?.has(auditId) ?? false;
    const totalRows = group.pocs.length + group.orphanInds.length + group.pocs.filter(p => indByPoc.has(p._id)).length;
    const auditStart = group.startDate ? new Date(group.startDate) : null;
    const auditEnd = group.targetEndDate ? new Date(group.targetEndDate) : null;
    const hasAuditRange = auditStart && auditEnd && auditEnd.getTime() > auditStart.getTime();
    const auditLeftPct = hasAuditRange ? dateToPct(auditStart!, ganttStart, totalMonths) : 0;
    const auditRightPct = hasAuditRange ? dateToPct(auditEnd!, ganttStart, totalMonths) : 0;
    const auditWidthPct = Math.max(auditRightPct - auditLeftPct, 0.5);
    return (
    <div key={auditId}>
      <button
        type="button"
        onClick={() => toggleCollapsed?.(auditId)}
        className="w-full flex bg-slate-50/80 border-b border-border/40 hover:bg-slate-100 text-left"
      >
        <div className="flex-shrink-0 px-4 py-1.5 border-r border-border flex items-center gap-1.5" style={{ width: LABEL_W }}>
          {isCollapsed ? <ChevronRight size={12} className="text-muted" /> : <ChevronDown size={12} className="text-muted" />}
          <span className="text-[11px] font-bold text-text">{group.name}</span>
          {group.client && <span className="text-[10px] text-muted ml-1.5">· {group.client}</span>}
          <span className="text-[10px] text-muted ml-auto">{totalRows} {totalRows === 1 ? 'row' : 'rows'}</span>
        </div>
        <div className="relative flex" style={{ width: ganttW, minHeight: 28 }}>
          {months.map((_, i) => <div key={i} style={{ width: monthWidth, flexShrink: 0 }} className="border-r border-border/10" />)}
          {hasAuditRange && (
            <div
              className="absolute rounded-sm flex items-center px-2 overflow-hidden border border-blue-aria/40"
              style={{
                left: `${auditLeftPct}%`,
                width: `${auditWidthPct}%`,
                minWidth: 6,
                height: 14,
                top: 'calc(50% - 7px)',
                backgroundColor: 'rgba(27, 108, 168, 0.15)',
              }}
              title={`${group.name} · ${auditStart!.toLocaleDateString('en-GB')} → ${auditEnd!.toLocaleDateString('en-GB')}`}
            >
              <span className="text-[9px] font-medium text-blue-aria truncate">Audit duration</span>
            </div>
          )}
        </div>
      </button>

      {!isCollapsed && group.pocs.map(poc => {
        const ind = indByPoc.get(poc._id);
        const milestones = (poc.execution?.milestones ?? []).filter(ms => ms.dueDate);
        const pd = poc.processId;
        const procLabel = pd?.procId ? `${pd.procId}${pd.name ? ' · ' + pd.name : ''}` : '';
        const objective = poc.design?.measurableObjective ?? '';
        return (
          <div key={poc._id}>
            {/* POC row */}
            <div
              className="flex border-b border-border/50 hover:bg-slate-50/50 cursor-pointer group transition-colors"
              style={{ minHeight: milestones.length > 0 ? 72 : 52 }}
              onClick={() => poc.audit && router.push(`/audits/${poc.audit._id}/pocs/${poc._id}`)}
            >
              <div className="flex-shrink-0 px-4 py-3 border-r border-border flex flex-col justify-center gap-0.5" style={{ width: LABEL_W }}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold" style={{ color: '#0d7a6c' }}>{poc.pocId}</span>
                  <Badge variant={POC_PHASE_VARIANTS[poc.phase]}>{poc.phase}</Badge>
                </div>
                {(poc.name || objective) && <p className="text-xs text-text font-semibold truncate" title={poc.name || objective}>{poc.name || objective}</p>}
                <div className="text-[10px] text-muted truncate">
                  {poc.useCase?.cuId && <span className="font-mono">{poc.useCase.cuId}</span>}
                  {procLabel && <span className="ml-1">· {procLabel}</span>}
                </div>
              </div>
              <div className="relative py-3" style={{ width: ganttW }}>
                <GridAndToday months={months} monthWidth={monthWidth} showToday={showToday} todayPct={todayPct} />
                <POCBar poc={poc} ganttStart={ganttStart} totalMonths={totalMonths} hasMilestones={milestones.length > 0} />
                <MilestoneMarkers milestones={milestones} ganttStart={ganttStart} totalMonths={totalMonths} />
              </div>
            </div>

            {/* IND row indented under its POC */}
            {ind && (() => {
              const indMs = (ind.milestones ?? []).filter(m => m.dueDate);
              return (
                <div
                  key={ind._id}
                  className="flex border-b border-border/40 hover:bg-indu-light/40 cursor-pointer group transition-colors"
                  style={{ minHeight: indMs.length > 0 ? 60 : 44, backgroundColor: 'rgba(255,237,213,0.25)' }}
                  onClick={(e) => { e.stopPropagation(); ind.audit && router.push(`/audits/${ind.audit._id}/industrializations/${ind._id}`); }}
                >
                  <div className="flex-shrink-0 pl-8 pr-4 py-2 border-r border-border flex flex-col justify-center gap-0.5" style={{ width: LABEL_W }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted">↳</span>
                      <span className="font-mono text-[11px] font-bold text-indu">{ind.industrializationId}</span>
                      <Badge variant={IND_STATUS_VARIANTS[ind.status]}>{INDUSTRIALIZATION_STATUS_LABELS[ind.status]}</Badge>
                    </div>
                    {ind.name && <p className="text-[11px] text-text truncate" title={ind.name}>{ind.name}</p>}
                  </div>
                  <div className="relative py-3" style={{ width: ganttW }}>
                    <GridAndToday months={months} monthWidth={monthWidth} showToday={showToday} todayPct={todayPct} />
                    <IndBar ind={ind} ganttStart={ganttStart} totalMonths={totalMonths} hasMilestones={indMs.length > 0} />
                    <MilestoneMarkers milestones={indMs} ganttStart={ganttStart} totalMonths={totalMonths} />
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Orphan INDs (POC not visible due to filter, or POC has no dates) */}
      {!isCollapsed && group.orphanInds.map(ind => {
        const indMs = (ind.milestones ?? []).filter(m => m.dueDate);
        return (
          <div
            key={ind._id}
            className="flex border-b border-border/50 hover:bg-indu-light/40 cursor-pointer group transition-colors"
            style={{ minHeight: indMs.length > 0 ? 60 : 44 }}
            onClick={() => ind.audit && router.push(`/audits/${ind.audit._id}/industrializations/${ind._id}`)}
          >
            <div className="flex-shrink-0 px-4 py-2 border-r border-border flex flex-col justify-center gap-0.5" style={{ width: LABEL_W }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-indu">{ind.industrializationId}</span>
                <Badge variant={IND_STATUS_VARIANTS[ind.status]}>{INDUSTRIALIZATION_STATUS_LABELS[ind.status]}</Badge>
              </div>
              {ind.name && <p className="text-xs text-text truncate" title={ind.name}>{ind.name}</p>}
              {ind.poc?.pocId && <p className="text-[10px] text-muted font-mono">from {ind.poc.pocId}</p>}
            </div>
            <div className="relative py-3" style={{ width: ganttW }}>
              <GridAndToday months={months} monthWidth={monthWidth} showToday={showToday} todayPct={todayPct} />
              <IndBar ind={ind} ganttStart={ganttStart} totalMonths={totalMonths} hasMilestones={indMs.length > 0} />
              <MilestoneMarkers milestones={indMs} ganttStart={ganttStart} totalMonths={totalMonths} />
            </div>
          </div>
        );
      })}
    </div>
    );
  });
}

function renderByUseCase({ visiblePocs, visibleInds, indByPoc, ganttStart, totalMonths, ganttW, monthWidth, months, todayPct, showToday, router }: RenderArgs) {
  // One row per Use Case. The row contains the POC bar and (optionally) the IND bar.
  const ucGroups = new Map<string, { cuId: string; description?: string; auditName?: string; pocs: EnrichedPOC[]; inds: EnrichedInd[] }>();

  for (const poc of visiblePocs) {
    const ucId = poc.useCase?._id ?? String(poc._id);
    if (!ucGroups.has(ucId)) ucGroups.set(ucId, { cuId: poc.useCase?.cuId ?? '—', description: poc.useCase?.description, auditName: poc.audit?.name, pocs: [], inds: [] });
    ucGroups.get(ucId)!.pocs.push(poc);
  }

  for (const ind of visibleInds) {
    const ucId = typeof ind.useCaseId === 'object' ? ind.useCaseId._id : String(ind.useCaseId);
    if (!ucGroups.has(ucId)) ucGroups.set(ucId, { cuId: ind.useCase?.cuId ?? '—', description: ind.useCase?.description, auditName: ind.audit?.name, pocs: [], inds: [] });
    ucGroups.get(ucId)!.inds.push(ind);
  }

  return [...ucGroups.entries()].map(([ucId, group]) => {
    // For each row, collect milestones from all bars to size the row
    const allMs: Milestone[] = [];
    for (const p of group.pocs) for (const m of (p.execution?.milestones ?? [])) if (m.dueDate) allMs.push(m as Milestone);
    for (const i of group.inds) for (const m of (i.milestones ?? [])) if (m.dueDate) allMs.push(m as Milestone);
    const hasMs = allMs.length > 0;

    // Connector: POC.end → IND.start (use the first POC and the first IND if both exist)
    const poc = group.pocs[0];
    const ind = group.inds[0];
    let connector: { fromPct: number; toPct: number } | null = null;
    if (poc && ind && poc.design?.deadlineDate && ind.plan?.startDate) {
      const fromPct = dateToPct(new Date(poc.design.deadlineDate), ganttStart, totalMonths);
      const toPct = dateToPct(new Date(ind.plan.startDate), ganttStart, totalMonths);
      if (toPct > fromPct) connector = { fromPct, toPct };
    }

    const onClick = () => {
      const target = ind && ind.audit ? `/audits/${ind.audit._id}/industrializations/${ind._id}`
        : poc && poc.audit ? `/audits/${poc.audit._id}/pocs/${poc._id}` : null;
      if (target) router.push(target);
    };

    return (
      <div
        key={ucId}
        className="flex border-b border-border/50 hover:bg-slate-50/50 cursor-pointer group transition-colors"
        style={{ minHeight: hasMs ? 76 : 56 }}
        onClick={onClick}
      >
        <div className="flex-shrink-0 px-4 py-2 border-r border-border flex flex-col justify-center gap-0.5" style={{ width: LABEL_W }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-purple-aria">{group.cuId}</span>
            {group.pocs.map(p => <Badge key={p._id} variant={POC_PHASE_VARIANTS[p.phase]}>POC</Badge>)}
            {group.inds.map(i => <Badge key={i._id} variant={IND_STATUS_VARIANTS[i.status]}>IND</Badge>)}
          </div>
          {group.description && <p className="text-xs text-text font-semibold truncate" title={group.description}>{group.description}</p>}
          {group.auditName && <p className="text-[10px] text-muted truncate">{group.auditName}</p>}
        </div>
        <div className="relative py-3" style={{ width: ganttW }}>
          <GridAndToday months={months} monthWidth={monthWidth} showToday={showToday} todayPct={todayPct} />
          {connector && (
            <div
              className="absolute"
              style={{
                left: `${connector.fromPct}%`,
                width: `${connector.toPct - connector.fromPct}%`,
                top: 'calc(50% - 1px)',
                height: 2,
                background: 'repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 8px)',
              }}
              title="POC → Industrialization handoff"
            />
          )}
          {group.pocs.map(p => <POCBar key={p._id} poc={p} ganttStart={ganttStart} totalMonths={totalMonths} hasMilestones={hasMs} />)}
          {group.inds.map(i => <IndBar key={i._id} ind={i} ganttStart={ganttStart} totalMonths={totalMonths} hasMilestones={hasMs} />)}
          <MilestoneMarkers milestones={allMs} ganttStart={ganttStart} totalMonths={totalMonths} />
        </div>
      </div>
    );
  });
}

interface MultiOption { id: string; label: string; sublabel?: string }

function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: MultiOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const clear = () => onChange(new Set());

  const summary = selected.size === 0 ? `All ${label.toLowerCase()}` : `${selected.size} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 bg-white border border-border rounded-sm px-3 py-1.5 text-xs hover:border-blue-aria ${selected.size > 0 ? 'border-blue-aria text-blue-aria' : 'text-text'}`}
      >
        <Filter size={12} />
        {label}: <span className="font-medium">{summary}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-border rounded-sm shadow-panel min-w-[220px] max-h-72 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No options</p>
          ) : (
            <>
              {selected.size > 0 && (
                <button onClick={clear} className="w-full text-left px-3 py-1.5 text-[11px] text-blue-aria hover:bg-smoke border-b border-border">
                  Clear selection
                </button>
              )}
              {options.map(opt => (
                <label key={opt.id} className="flex items-start gap-2 px-3 py-1.5 hover:bg-smoke cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(opt.id)}
                    onChange={() => toggle(opt.id)}
                    className="mt-0.5 accent-blue-aria"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.sublabel && <span className="block text-[10px] text-muted truncate">{opt.sublabel}</span>}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
