'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, FolderOpen, Archive, Columns } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import type { AuditStatus, SectorType } from '@/lib/types';

interface AuditSummary {
  _id: string;
  name: string;
  client: string;
  sector: SectorType;
  status: AuditStatus;
  leadConsultant: { name: string } | string;
  processCount: number;
  useCaseCount: number;
  pocCount: number;
  pocsByPhase: {
    design: number;
    execution: number;
    evaluation: number;
    closed: number;
  };
  useCasesByCategory: { quickWin: number; midTerm: number; strategic: number };
  savingsByCategory: { quickWin: number; midTerm: number; strategic: number };
  totalAnnualSavingEur: number;
  totalHoursSavedPerRun: number;
  totalProcessHoursPerRun: number;
  totalPeople: number;
  updatedAt: string;
  totalNetAnnualSaving: number;
  totalComputeCostPerYear: number;
  totalDevCost: number;
  paybackMonths: number;
  totalProcessCostPerYear: number;
}

type StatusFilter = 'all' | AuditStatus;

const SECTOR_VARIANTS: Record<
  SectorType,
  'red' | 'blue' | 'teal' | 'amber' | 'slate'
> = {
  defence: 'red',
  aerospace: 'blue',
  naval: 'teal',
  railway: 'amber',
  internal: 'slate',
  other: 'slate',
};
const STATUS_VARIANTS: Record<
  AuditStatus,
  'slate' | 'green' | 'amber' | 'blue'
> = {
  draft: 'slate',
  active: 'green',
  review: 'amber',
  completed: 'blue',
};
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

function getLeadName(lead: { name: string } | string | undefined): string {
  if (!lead) return '—';
  return typeof lead === 'string' ? lead : (lead.name ?? '—');
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

// ── Savings Donut (SVG) ────────────────────────────────────────────────────────

function SavingsDonut({
  netSaving,
  processCost,
}: {
  netSaving: number;
  processCost: number;
}) {
  const r = 62;
  const sw = 18;
  const c = 2 * Math.PI * r;
  const procCost = processCost ?? 0;
  const fSaved = procCost > 0 ? Math.min((netSaving ?? 0) / procCost, 1) : 0;
  const fRemaining = Math.max(1 - fSaved, 0);
  const lSaved = fSaved * c;
  const lRemaining = fRemaining * c;

  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 160 160"
      className="drop-shadow-sm"
    >
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke="#1e293b"
        strokeWidth={sw}
      />
      {lSaved > 0 && (
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#1B6CA8"
          strokeWidth={sw}
          strokeDasharray={`${lSaved} ${c}`}
          strokeDashoffset={0}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }}
          strokeLinecap="butt"
        />
      )}
      {lRemaining > 0 && (
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#475569"
          strokeWidth={sw}
          strokeDasharray={`${lRemaining} ${c}`}
          strokeDashoffset={-(fSaved * c)}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }}
          strokeLinecap="butt"
        />
      )}
      <text
        x="80"
        y="72"
        textAnchor="middle"
        fontSize="20"
        fontWeight="bold"
        fill="white"
        fontFamily="inherit"
      >
        €{fmt(netSaving)}
      </text>
      <text
        x="80"
        y="91"
        textAnchor="middle"
        fontSize="9"
        fill="#94a3b8"
        fontFamily="inherit"
      >
        net annual savings
      </text>
      <text
        x="80"
        y="102"
        textAnchor="middle"
        fontSize="8"
        fill="#64748b"
        fontFamily="inherit"
      >
        of €{fmt(processCost)}/yr process cost
      </text>
    </svg>
  );
}

// ── Savings Infographic ────────────────────────────────────────────────────────

interface SavingsProps {
  audits: AuditSummary[];
  totalSaving: number;
  savingsByCategory: { quickWin: number; midTerm: number; strategic: number };
  ucsByCategory: { quickWin: number; midTerm: number; strategic: number };
  coveragePct: number;
  totalPeople: number;
  totalNetAnnualSaving: number;
  totalComputeCostPerYear: number;
  totalDevCost: number;
  totalProcessCostPerYear: number;
}

function SavingsInfographic({
  audits,
  totalSaving,
  savingsByCategory,
  ucsByCategory,
  coveragePct,
  totalPeople,
  totalNetAnnualSaving,
  totalComputeCostPerYear,
  totalDevCost,
  totalProcessCostPerYear,
}: SavingsProps) {
  const auditsWithSaving = audits
    .filter((a) => (a.totalNetAnnualSaving ?? 0) > 0)
    .sort((a, b) => (b.totalNetAnnualSaving ?? 0) - (a.totalNetAnnualSaving ?? 0));

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-sm overflow-hidden shadow-lg">
      {/* Hero */}
      <div className="px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-aria" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            All Audits
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-2">
          <div>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest">
              Total Net Annual Saving
            </p>
            <p className="text-4xl font-bold text-white mt-0.5 font-display">
              €{fmt(totalNetAnnualSaving)}
            </p>
            {totalComputeCostPerYear > 0 && (
              <p className="text-[10px] text-slate-500">
                incl. −€{fmt(totalComputeCostPerYear)} compute/yr
              </p>
            )}
          </div>
          {coveragePct > 0 && (
            <div>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest">
                Process Automation
              </p>
              <p className="text-4xl font-bold text-blue-aria mt-0.5 font-display">
                {coveragePct.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500">
                of process hours automated
              </p>
            </div>
          )}
          <div>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest">
              Dev Cost
            </p>
            <p className="text-4xl font-bold text-white mt-0.5 font-display">
              €{fmt(totalDevCost)}
            </p>
            {totalDevCost > 0 && totalNetAnnualSaving > 0 && (
              <p className="text-[10px] text-slate-500">
                payback ≈ {(totalDevCost / (totalNetAnnualSaving / 12)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} months
              </p>
            )}
            {(totalDevCost === 0 || totalNetAnnualSaving === 0) && (
              <p className="text-[10px] text-slate-500">—</p>
            )}
          </div>
          <div className="ml-auto text-right hidden sm:block">
            <p className="text-slate-400 text-[10px] uppercase tracking-widest">
              Portfolio
            </p>
            <p className="text-2xl font-bold text-white mt-0.5">
              {audits.reduce((s, a) => s + a.pocCount, 0)} POCs ·{' '}
              {audits.reduce((s, a) => s + a.useCaseCount, 0)} UCs ·{' '}
              {audits.length} audits
            </p>
            {totalPeople > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">
                <span className="text-white font-bold">{totalPeople}</span>{' '}
                people impacted
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-aria" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Audits with Savings
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
        {/* Left: donut only */}
        <div className="lg:col-span-2 flex flex-col items-center gap-5">
          <SavingsDonut
            netSaving={totalNetAnnualSaving}
            processCost={totalProcessCostPerYear}
          />
          <div className="text-[9px] text-slate-500 flex gap-3">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-aria mr-1" />
              AI savings
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-slate-600 mr-1" />
              remaining cost
            </span>
          </div>
        </div>

        {/* Right: per-audit bars */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Value by Audit
          </p>
          {auditsWithSaving.length > 0 && (
            <div className="flex justify-end">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                Net Annual Saving
              </span>
            </div>
          )}
          {auditsWithSaving.length === 0 ? (
            <p className="text-slate-500 text-xs mt-2">
              No savings computed yet — add process profiles and use cases.
            </p>
          ) : (
            <div className="space-y-4">
              {auditsWithSaving.map((audit) => {
                const netTotal = audit.totalNetAnnualSaving ?? 0;
                const barWidthPct = totalNetAnnualSaving > 0 ? (netTotal / totalNetAnnualSaving) * 100 : 0;
                const covPct =
                  audit.totalProcessHoursPerRun > 0
                    ? Math.round(
                        (audit.totalHoursSavedPerRun /
                          audit.totalProcessHoursPerRun) *
                          100,
                      )
                    : null;
                const paybackDisplay =
                  audit.totalDevCost > 0 && audit.totalNetAnnualSaving > 0
                    ? (audit.totalDevCost / (audit.totalNetAnnualSaving / 12)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    : '—';
                return (
                  <div key={audit._id}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <Link
                          href={`/audits/${audit._id}`}
                          className="text-xs font-semibold text-slate-200 hover:text-white transition-colors truncate max-w-[180px]"
                        >
                          {audit.client}
                        </Link>
                        {covPct !== null && (
                          <span className="text-[10px] text-slate-500">
                            {covPct}% automated · ({audit.totalHoursSavedPerRun.toFixed(1)}h / {audit.totalProcessHoursPerRun.toFixed(1)}h per run)
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-white ml-3 flex-shrink-0">
                        {Math.round(barWidthPct)}% · €{fmt(netTotal)}/yr
                      </span>
                    </div>
                    {/* Solid bar */}
                    <div className="h-5 bg-white/5 rounded overflow-hidden">
                      <div
                        className="h-full w-full bg-blue-aria transition-all"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                    {/* Sublínea */}
                    <div className="text-[9px] text-slate-500 mt-1">
                      Dev €{fmt(audit.totalDevCost)} · payback ≈ {paybackDisplay} months · {audit.totalPeople} people
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

type ColKey =
  | 'audit'
  | 'client'
  | 'status'
  | 'sector'
  | 'procs'
  | 'people'
  | 'ucs'
  | 'pocs'
  | 'saving'
  | 'categories'
  | 'updated';
const ALL_COLUMNS: { key: ColKey; label: string; always?: boolean }[] = [
  { key: 'audit', label: 'Audit', always: true },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
  { key: 'sector', label: 'Sector' },
  { key: 'procs', label: 'Procs' },
  { key: 'people', label: 'People' },
  { key: 'ucs', label: 'UCs' },
  { key: 'pocs', label: 'POCs' },
  { key: 'saving', label: 'Annual Saving' },
  { key: 'categories', label: 'Categories' },
  { key: 'updated', label: 'Updated' },
];
const DEFAULT_VISIBLE: ColKey[] = [
  'audit',
  'client',
  'status',
  'procs',
  'ucs',
  'pocs',
  'updated',
];
const COLUMN_STORAGE_KEY = 'aria.dashboard.columns.v2';

export default function DashboardPage() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [archivedAudits, setArchivedAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    () => new Set(DEFAULT_VISIBLE),
  );
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as ColKey[];
        if (Array.isArray(arr) && arr.length > 0) setVisibleCols(new Set(arr));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCol = (key: ColKey) => {
    if (ALL_COLUMNS.find((c) => c.key === key)?.always) return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          COLUMN_STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isVisible = (key: ColKey) => visibleCols.has(key);

  useEffect(() => {
    fetch(apiUrl('/api/audits'))
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then(setAudits)
      .catch((e: any) => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const toggleArchived = async () => {
    if (!showArchived && archivedAudits.length === 0) {
      setLoadingArchived(true);
      try {
        const r = await fetch(apiUrl('/api/audits?archived=true'));
        const data = await r.json();
        setArchivedAudits(data);
      } finally {
        setLoadingArchived(false);
      }
    }
    setShowArchived((v) => !v);
  };

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/audits/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      });
      if (!res.ok) throw new Error('Failed');
      setArchivedAudits((prev) => prev.filter((a) => a._id !== id));
      toast.success('Audit restored');
    } catch {
      toast.error('Failed to restore audit');
    }
  };

  const filtered = audits.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return (
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.client.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Global aggregates
  const totalSaving = audits.reduce(
    (s, a) => s + (a.totalAnnualSavingEur ?? 0),
    0,
  );
  const totalHoursSaved = audits.reduce(
    (s, a) => s + (a.totalHoursSavedPerRun ?? 0),
    0,
  );
  const totalProcessHours = audits.reduce(
    (s, a) => s + (a.totalProcessHoursPerRun ?? 0),
    0,
  );
  const coveragePct =
    totalProcessHours > 0 ? (totalHoursSaved / totalProcessHours) * 100 : 0;
  const totalNetAnnualSaving = audits.reduce(
    (s, a) => s + (a.totalNetAnnualSaving ?? 0),
    0,
  );
  const totalComputeCostPerYear = audits.reduce(
    (s, a) => s + (a.totalComputeCostPerYear ?? 0),
    0,
  );
  const totalDevCost = audits.reduce(
    (s, a) => s + (a.totalDevCost ?? 0),
    0,
  );
  const totalProcessCostPerYear = audits.reduce(
    (s, a) => s + (a.totalProcessCostPerYear ?? 0),
    0,
  );
  const savingsByCategory = {
    quickWin: audits.reduce(
      (s, a) => s + (a.savingsByCategory?.quickWin ?? 0),
      0,
    ),
    midTerm: audits.reduce(
      (s, a) => s + (a.savingsByCategory?.midTerm ?? 0),
      0,
    ),
    strategic: audits.reduce(
      (s, a) => s + (a.savingsByCategory?.strategic ?? 0),
      0,
    ),
  };
  const ucsByCategory = {
    quickWin: audits.reduce(
      (s, a) => s + (a.useCasesByCategory?.quickWin ?? 0),
      0,
    ),
    midTerm: audits.reduce(
      (s, a) => s + (a.useCasesByCategory?.midTerm ?? 0),
      0,
    ),
    strategic: audits.reduce(
      (s, a) => s + (a.useCasesByCategory?.strategic ?? 0),
      0,
    ),
  };
  const totalUseCases = audits.reduce((s, a) => s + (a.useCaseCount ?? 0), 0);
  const totalPocs = audits.reduce((s, a) => s + (a.pocCount ?? 0), 0);
  const totalPeople = audits.reduce((s, a) => s + (a.totalPeople ?? 0), 0);
  const pocsByPhase = {
    design: audits.reduce((s, a) => s + (a.pocsByPhase?.design ?? 0), 0),
    execution: audits.reduce((s, a) => s + (a.pocsByPhase?.execution ?? 0), 0),
    evaluation: audits.reduce(
      (s, a) => s + (a.pocsByPhase?.evaluation ?? 0),
      0,
    ),
    closed: audits.reduce((s, a) => s + (a.pocsByPhase?.closed ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">
            Dashboard
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Overview of all AI readiness audits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleArchived}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-sm border transition-colors ${
              showArchived
                ? 'bg-slate-100 text-text border-slate-300'
                : 'bg-white text-muted border-border hover:border-blue-aria hover:text-blue-aria'
            }`}
          >
            <Archive size={14} />
            {showArchived ? 'Hide Archived' : 'Archived'}
          </button>
          <Link
            href="/audits/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
          >
            <Plus size={15} />
            New Audit
          </Link>
        </div>
      </div>

      {/* AI Value Landscape */}
      {!loading && audits.length > 0 && (
        <SavingsInfographic
          audits={audits}
          totalSaving={totalSaving}
          savingsByCategory={savingsByCategory}
          ucsByCategory={ucsByCategory}
          coveragePct={coveragePct}
          totalPeople={totalPeople}
          totalNetAnnualSaving={totalNetAnnualSaving}
          totalComputeCostPerYear={totalComputeCostPerYear}
          totalDevCost={totalDevCost}
          totalProcessCostPerYear={totalProcessCostPerYear}
        />
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-sm border transition-colors ${
                statusFilter === f.value
                  ? 'bg-blue-aria text-white border-blue-aria'
                  : 'bg-white text-muted border-border hover:border-blue-aria hover:text-blue-aria'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder="Search audits…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColPicker((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border bg-white text-muted hover:border-blue-aria hover:text-blue-aria transition-colors"
          >
            <Columns size={13} /> Columns
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-sm border border-border bg-white shadow-lg p-2 text-xs">
              {ALL_COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className={`flex items-center gap-2 px-2 py-1 rounded ${c.always ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}
                >
                  <input
                    type="checkbox"
                    disabled={c.always}
                    checked={c.always || isVisible(c.key)}
                    onChange={() => toggleCol(c.key)}
                  />
                  {c.label}
                  {c.always && <span className="text-muted">(required)</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" className="text-blue-aria" />
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <FolderOpen size={40} className="text-muted" />
          <div>
            <p className="font-display text-lg font-semibold text-text">
              No audits yet
            </p>
            <p className="text-sm text-muted mt-1">
              Create your first audit to get started.
            </p>
          </div>
          <Link
            href="/audits/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
          >
            <Plus size={15} /> Create Audit
          </Link>
        </div>
      )}

      {/* Audits table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {ALL_COLUMNS.filter((c) => isVisible(c.key)).map((c) => (
                  <th
                    key={c.key}
                    className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit) => (
                <tr
                  key={audit._id}
                  onClick={() => router.push(`/audits/${audit._id}`)}
                  className="border-b border-border/50 hover:bg-slate-50 cursor-pointer"
                >
                  {isVisible('audit') && (
                    <td className="py-3 px-4">
                      <span className="font-semibold text-text hover:text-blue-aria transition-colors line-clamp-1 block max-w-[220px]">
                        {audit.name}
                      </span>
                      <p className="text-[10px] text-muted mt-0.5">
                        {getLeadName(audit.leadConsultant)}
                      </p>
                    </td>
                  )}
                  {isVisible('client') && (
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {audit.client}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="py-3 px-4">
                      <Badge variant={STATUS_VARIANTS[audit.status]}>
                        {audit.status.charAt(0).toUpperCase() +
                          audit.status.slice(1)}
                      </Badge>
                    </td>
                  )}
                  {isVisible('sector') && (
                    <td className="py-3 px-4">
                      <Badge variant={SECTOR_VARIANTS[audit.sector]}>
                        {audit.sector.charAt(0).toUpperCase() +
                          audit.sector.slice(1)}
                      </Badge>
                    </td>
                  )}
                  {isVisible('procs') && (
                    <td className="py-3 px-4 text-center text-xs font-semibold text-text">
                      {audit.processCount ?? 0}
                    </td>
                  )}
                  {isVisible('people') && (
                    <td className="py-3 px-4 text-center">
                      {(audit.totalPeople ?? 0) > 0 ? (
                        <span className="text-xs font-bold text-blue-aria">
                          {audit.totalPeople}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('ucs') && (
                    <td className="py-3 px-4 text-center text-xs font-semibold text-text">
                      {audit.useCaseCount ?? 0}
                    </td>
                  )}
                  {isVisible('pocs') && (
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs font-semibold text-text">
                        {audit.pocCount ?? 0}
                      </span>
                    </td>
                  )}
                  {isVisible('saving') && (
                    <td className="py-3 px-4 whitespace-nowrap">
                      {(audit.totalAnnualSavingEur ?? 0) > 0 ? (
                        <>
                          <span className="text-xs font-bold text-green-600">
                            €{fmt(audit.totalAnnualSavingEur)}/yr
                          </span>
                          {(audit.totalProcessHoursPerRun ?? 0) > 0 && (
                            <p className="text-[10px] text-muted">
                              {Math.round(
                                ((audit.totalHoursSavedPerRun ?? 0) /
                                  audit.totalProcessHoursPerRun) *
                                  100,
                              )}
                              % automation
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('categories') && (
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        {(audit.useCasesByCategory?.quickWin ?? 0) > 0 && (
                          <span className="text-[10px] text-green-700 font-medium">
                            QW ×{audit.useCasesByCategory.quickWin}
                          </span>
                        )}
                        {(audit.useCasesByCategory?.midTerm ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            MT ×{audit.useCasesByCategory.midTerm}
                          </span>
                        )}
                        {(audit.useCasesByCategory?.strategic ?? 0) > 0 && (
                          <span className="text-[10px] text-blue-aria font-medium">
                            ST ×{audit.useCasesByCategory.strategic}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {isVisible('updated') && (
                    <td className="py-3 px-4 text-[10px] text-muted whitespace-nowrap">
                      {new Date(audit.updatedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Archived section */}
      {showArchived && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-muted flex items-center gap-2">
            <Archive size={14} />
            Archived Audits
          </h2>
          {loadingArchived ? (
            <div className="flex justify-center py-8">
              <Spinner size="sm" className="text-muted" />
            </div>
          ) : archivedAudits.length === 0 ? (
            <p className="text-sm text-muted py-4">No archived audits.</p>
          ) : (
            <div className="bg-white border border-border rounded-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    {['Audit', 'Client', 'Sector', 'Status', ''].map((h) => (
                      <th
                        key={h}
                        className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archivedAudits.map((audit) => (
                    <tr
                      key={audit._id}
                      className="border-b border-border/50 hover:bg-slate-50"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/audits/${audit._id}`}
                          className="font-semibold text-text hover:text-blue-aria transition-colors"
                        >
                          {audit.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted">
                        {audit.client}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={SECTOR_VARIANTS[audit.sector]}>
                          {audit.sector.charAt(0).toUpperCase() +
                            audit.sector.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="slate">Archived</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleRestore(audit._id)}
                          className="text-xs font-medium text-blue-aria hover:underline"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
