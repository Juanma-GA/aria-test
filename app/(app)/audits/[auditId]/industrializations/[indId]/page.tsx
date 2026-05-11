'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Factory, Bot, Sparkles, Archive, ArchiveRestore } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { OriginTrace, type OriginNode } from '@/components/ui/OriginTrace';
import { useAuditAccess } from '@/context/AuditAccessContext';
import type {
  Industrialization,
  IndustrializationStatus,
  IndustrializationMilestone,
  IndustrializationCost,
  IndustrializationROI,
  IndustrializationRisk,
} from '@/lib/types';
import { INDUSTRIALIZATION_STATUS_LABELS } from '@/lib/types';
import { CostEditor } from './_components/CostEditor';
import { ROIEditor } from './_components/ROIEditor';
import { RisksEditor } from './_components/RisksEditor';

const STATUS_VARIANTS: Record<IndustrializationStatus, 'slate' | 'blue' | 'amber' | 'green' | 'purple' | 'red'> = {
  pending_customer_validation: 'amber',
  planned: 'slate',
  work_in_progress: 'blue',
  go_for_run: 'green',
  stand_by: 'purple',
  cancelled: 'red',
};

const TABS = [
  { key: 'plan', label: 'Plan' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'cost', label: 'Cost' },
  { key: 'roi', label: 'ROI' },
  { key: 'production', label: 'Production' },
  { key: 'risks', label: 'Risks & Change' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

type MilestoneStatus = 'pending' | 'work_in_progress' | 'done' | 'missed';

const MILESTONE_STATUSES: { key: MilestoneStatus; label: string }[] = [
  { key: 'pending',          label: 'Pending' },
  { key: 'work_in_progress', label: 'Work in progress' },
  { key: 'done',             label: 'Done' },
  { key: 'missed',           label: 'Missed' },
];

const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  pending:          'border-amber-sov bg-amber-sov text-white',
  work_in_progress: 'border-blue-aria bg-blue-aria text-white',
  done:             'border-green-sov bg-green-sov text-white',
  missed:           'border-red-sov bg-red-sov text-white',
};

// Per-status weight when computing the overall milestone progress.
// Used as a fallback when the milestone has no explicit progressPct.
const STATUS_WEIGHT: Record<MilestoneStatus, number> = {
  pending: 0,
  work_in_progress: 50,
  done: 100,
  missed: 0,
};

function milestonePct(m: { status: MilestoneStatus; progressPct?: number }): number {
  if (m.status === 'done') return 100;
  if (m.status === 'missed' || m.status === 'pending') return Math.max(0, Math.min(100, m.progressPct ?? 0));
  // work_in_progress: prefer the explicit value, else fall back to the status weight.
  const explicit = m.progressPct;
  if (typeof explicit === 'number' && explicit > 0) return Math.min(100, explicit);
  return STATUS_WEIGHT.work_in_progress;
}

function dateInput(value: Date | string | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export default function IndustrializationDetailPage() {
  const { auditId, indId } = useParams<{ auditId: string; indId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ind, setInd] = useState<Industrialization | null>(null);
  const [audit, setAudit] = useState<{ _id: string; auditCode?: string; name: string; client?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [statusError, setStatusError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiBusy, setAiBusy] = useState<null | 'milestones' | 'cost' | 'maintenance'>(null);
  const [aiError, setAiError] = useState('');
  const [costRationale, setCostRationale] = useState('');
  const [maintenanceRationale, setMaintenanceRationale] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { canEdit } = useAuditAccess();

  useEffect(() => {
    Promise.all([
      fetch(`/api/audits/${auditId}/industrializations/${indId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/audits/${auditId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ])
      .then(([indData, auditData]) => {
        setInd(indData);
        if (auditData) setAudit(auditData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, indId]);

  const save = useCallback(async (updated: Partial<Industrialization>) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/audits/${auditId}/industrializations/${indId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error || 'Save failed');
        setSaveStatus('unsaved');
        return;
      }
      setStatusError('');
      setInd(data);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    }
  }, [auditId, indId]);

  const trigger = (updated: Partial<Industrialization>) => {
    setSaveStatus('unsaved');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 1500);
  };

  const updatePlan = (field: string, value: unknown) => {
    if (!ind) return;
    const next = { ...ind, plan: { ...ind.plan, [field]: value } };
    setInd(next);
    trigger({ plan: next.plan });
  };

  const updateStatus = async (status: IndustrializationStatus) => {
    if (!ind) return;
    setStatusError('');
    const next = { ...ind, status };
    setInd(next);
    await save({ status });
  };

  const addMilestone = () => {
    if (!ind) return;
    const m: IndustrializationMilestone = {
      id: uuidv4(), name: '', dueDate: undefined,
      status: 'pending', progressPct: 0, effortHours: 0, notes: '',
    };
    const milestones = [...(ind.milestones ?? []), m];
    const next = { ...ind, milestones };
    setInd(next);
    trigger({ milestones });
  };

  const updateMilestone = (id: string, field: string, value: unknown) => {
    if (!ind) return;
    const milestones = (ind.milestones ?? []).map(m => m.id === id ? { ...m, [field]: value } : m);
    const next = { ...ind, milestones };
    setInd(next);
    trigger({ milestones });
  };

  const removeMilestone = (id: string) => {
    if (!ind) return;
    const milestones = (ind.milestones ?? []).filter(m => m.id !== id);
    const next = { ...ind, milestones };
    setInd(next);
    trigger({ milestones });
  };

  const handleDelete = async () => {
    await fetch(`/api/audits/${auditId}/industrializations/${indId}`, { method: 'DELETE', credentials: 'include' });
    router.push(`/audits/${auditId}/industrializations`);
  };

  const toggleArchive = async () => {
    if (!ind) return;
    const next = !ind.isArchived;
    setSaveStatus('saving');
    const res = await fetch(`/api/audits/${auditId}/industrializations/${indId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: next }),
    });
    if (res.ok) {
      const data = await res.json();
      setInd(data);
      setSaveStatus('saved');
      // Bounce back to list when archiving — keeps focus on active items.
      if (next) router.push(`/audits/${auditId}/industrializations`);
    } else {
      setSaveStatus('unsaved');
    }
  };

  const callAi = async (kind: 'milestones' | 'cost') => {
    setAiBusy(kind);
    setAiError('');
    try {
      const path = kind === 'milestones' ? 'suggest-milestones' : 'bootstrap-cost';
      const res = await fetch(`/api/audits/${auditId}/industrializations/${indId}/ai/${path}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI call failed');
      if (data.industrialization) setInd(data.industrialization);
      if (kind === 'cost' && typeof data.rationale === 'string') setCostRationale(data.rationale);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'AI call failed');
    } finally {
      setAiBusy(null);
    }
  };

  const suggestMaintenance = async () => {
    if (!ind) return;
    setAiBusy('maintenance');
    setAiError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/industrializations/${indId}/ai/suggest-maintenance`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI call failed');
      const incomingAssessment = data.assessment ?? {};
      const incomingDrivers = data.drivers ?? {};
      if (typeof data.rationale === 'string') setMaintenanceRationale(data.rationale);
      const existingMaint = ind.cost.recurringAnnual?.maintenance ?? ({} as any);
      // Apply suggested drivers only for categories that don't already have
      // a user-defined driver block. Manual `*Eur` overrides are preserved.
      const existingDrivers = (existingMaint.drivers ?? {}) as Record<string, unknown>;
      const mergedDrivers: Record<string, unknown> = { ...existingDrivers };
      for (const k of Object.keys(incomingDrivers)) {
        if (existingDrivers[k] === undefined) mergedDrivers[k] = incomingDrivers[k];
      }
      const next: Industrialization = {
        ...ind,
        cost: {
          ...ind.cost,
          recurringAnnual: {
            ...ind.cost.recurringAnnual,
            maintenance: {
              ...existingMaint,
              drivers: mergedDrivers,
              assessment: {
                ...(existingMaint.assessment ?? {} as any),
                ...incomingAssessment,
                // Auto-mark the assessment complete so the cost panel becomes editable
                // (the AI has supplied both yes/no answers and structured drivers).
                completedAt: new Date(),
              },
            },
          },
        } as IndustrializationCost,
      };
      setInd(next);
      trigger({ cost: next.cost });
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'AI call failed');
    } finally {
      setAiBusy(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (!ind) return <div className="card p-12 text-center text-muted text-sm">Industrialization not found.</div>;

  const milestonesAll = (ind.milestones ?? []) as IndustrializationMilestone[];
  const total = milestonesAll.length;
  const done = milestonesAll.filter(m => m.status === 'done').length;
  // Aggregate progress: average of per-milestone progress, weighted equally.
  const aggregateProgress = total === 0 ? 0
    : Math.round(milestonesAll.reduce((s, m) => s + milestonePct(m as any), 0) / total);
  const progress = ind.status === 'cancelled' ? 0
    : ind.status === 'go_for_run' ? 100
    : aggregateProgress;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Factory size={20} className="text-indu" />
          <span className="font-mono text-sm font-bold text-indu">{ind.industrializationId}</span>
          <Badge variant={STATUS_VARIANTS[ind.status]}>{INDUSTRIALIZATION_STATUS_LABELS[ind.status]}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {ind.isArchived && (
            <span className="text-[11px] uppercase tracking-wide font-semibold text-muted bg-smoke border border-border rounded px-2 py-0.5">Archived</span>
          )}
          {canEdit && <SaveIndicator status={saveStatus} />}
          {canEdit && (
            <button onClick={toggleArchive} className="text-muted hover:text-blue-aria" title={ind.isArchived ? 'Unarchive' : 'Archive'}>
              {ind.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
          )}
          {canEdit && (
            <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-red-sov" title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Origin trace */}
      {(() => {
        const uc = (ind as any).useCaseId;
        const proc = (ind as any).processId;
        const poc = (ind as any).pocId;
        const nodes: OriginNode[] = [];
        if (audit) nodes.push({ kind: 'audit', code: audit.auditCode ?? '—', label: audit.name, href: `/audits/${audit._id}` });
        if (proc && typeof proc === 'object' && proc.procId) nodes.push({ kind: 'process', code: proc.procId, label: proc.name, href: `/audits/${auditId}/processes/${(proc as any)._id ?? ''}` });
        if (uc && typeof uc === 'object' && uc.cuId) nodes.push({ kind: 'usecase', code: uc.cuId, label: uc.description, href: `/audits/${auditId}/usecases` });
        if (poc && typeof poc === 'object' && poc.pocId) nodes.push({ kind: 'poc', code: poc.pocId, label: poc.name, href: `/audits/${auditId}/pocs/${(poc as any)._id ?? ''}` });
        nodes.push({ kind: 'industrialization', code: ind.industrializationId, label: ind.name });
        return <OriginTrace nodes={nodes} />;
      })()}

      <fieldset disabled={!canEdit} className="contents">
      <div className="card p-4 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="form-label">Name</label>
          <input
            value={ind.name ?? ''}
            onChange={e => { const next = { ...ind, name: e.target.value }; setInd(next); trigger({ name: e.target.value }); }}
            placeholder="Industrialization name"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Status</label>
          <select
            value={ind.status}
            onChange={e => updateStatus(e.target.value as IndustrializationStatus)}
            className="form-input"
          >
            {(Object.keys(INDUSTRIALIZATION_STATUS_LABELS) as IndustrializationStatus[]).map(s => (
              <option key={s} value={s}>{INDUSTRIALIZATION_STATUS_LABELS[s]}</option>
            ))}
          </select>
          {statusError && <p className="text-[11px] text-red-sov mt-1">{statusError}</p>}
        </div>
        <div className="md:col-span-3">
          <label className="form-label">Status reason / notes</label>
          <input
            value={ind.statusReason ?? ''}
            onChange={e => { const next = { ...ind, statusReason: e.target.value }; setInd(next); trigger({ statusReason: e.target.value }); }}
            placeholder="Required when Stand by / Cancelled"
            className="form-input"
          />
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <span className="text-xs text-muted">Progress</span>
          <div className="flex-1 h-2 bg-smoke rounded-full overflow-hidden">
            <div className="h-full bg-indu" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums">{progress}%</span>
          <span className="text-[11px] text-muted">({done}/{total} milestones)</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key ? 'border-indu text-indu' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'plan' && (
        <div className="card p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Business owner</label>
              <input value={ind.plan?.ownerBusiness ?? ''} onChange={e => updatePlan('ownerBusiness', e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Technical lead</label>
              <input value={ind.plan?.ownerTechnical ?? ''} onChange={e => updatePlan('ownerTechnical', e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Start date</label>
              <input type="date" value={dateInput(ind.plan?.startDate)} onChange={e => updatePlan('startDate', e.target.value || null)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Target go-live date</label>
              <input type="date" value={dateInput(ind.plan?.targetGoLiveDate)} onChange={e => updatePlan('targetGoLiveDate', e.target.value || null)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Actual go-live date</label>
              <input type="date" value={dateInput(ind.plan?.actualGoLiveDate)} onChange={e => updatePlan('actualGoLiveDate', e.target.value || null)} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Scope (sites, teams, geographies)</label>
            <textarea value={ind.plan?.scope ?? ''} onChange={e => updatePlan('scope', e.target.value)} className="form-textarea" rows={3} />
          </div>
          <div>
            <label className="form-label">Dependencies</label>
            <textarea value={ind.plan?.dependencies ?? ''} onChange={e => updatePlan('dependencies', e.target.value)} className="form-textarea" rows={2} />
          </div>
          <div>
            <label className="form-label">Sovereignty constraints (carried from B2 / POC)</label>
            <textarea value={ind.plan?.sovereigntyConstraints ?? ''} onChange={e => updatePlan('sovereigntyConstraints', e.target.value)} className="form-textarea" rows={2} />
          </div>
        </div>
      )}

      {activeTab === 'milestones' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Milestones</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => callAi('milestones')}
                disabled={aiBusy !== null}
                className="text-[11px] text-blue-aria border border-blue-aria rounded px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                title="Replaces all milestones with AI-generated ones"
              >
                {aiBusy === 'milestones' ? <Spinner size="sm" /> : <Sparkles size={12} />}
                Suggest with AI
              </button>
              <button onClick={addMilestone} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
          </div>
          {aiError && aiBusy === null && (
            <p className="text-[11px] text-red-sov bg-red-sov-light rounded p-2">{aiError}</p>
          )}
          {milestonesAll.length === 0 ? (
            <p className="text-xs text-muted">No milestones yet.</p>
          ) : (
            <div className="space-y-3">
              {milestonesAll.map(m => {
                const pct = milestonePct(m as any);
                return (
                  <div key={m.id} className="border border-border rounded p-3 space-y-2">
                    {/* Row 1: name + due date + remove */}
                    <div className="grid md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-7">
                        <label className="text-[10px] text-muted uppercase tracking-wide">Name</label>
                        <input className="form-input text-xs" placeholder="Milestone name" value={m.name}
                          onChange={e => updateMilestone(m.id, 'name', e.target.value)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-muted uppercase tracking-wide">Effort (h)</label>
                        <input type="number" min={0} className="form-input text-xs tabular-nums"
                          value={(m as any).effortHours ?? 0}
                          onChange={e => updateMilestone(m.id, 'effortHours', Number(e.target.value) || 0)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-muted uppercase tracking-wide">Due date</label>
                        <input type="date" className="form-input text-xs" value={dateInput(m.dueDate)}
                          onChange={e => updateMilestone(m.id, 'dueDate', e.target.value || null)} />
                      </div>
                      <button onClick={() => removeMilestone(m.id)}
                        className="md:col-span-1 text-muted hover:text-red-sov justify-self-end p-1 self-center"
                        title="Remove milestone">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Row 2: status + progress slider */}
                    <div className="grid md:grid-cols-12 gap-2 items-center">
                      <div className="md:col-span-6 flex gap-1 flex-wrap">
                        {MILESTONE_STATUSES.map(s => (
                          <button
                            key={s.key}
                            onClick={() => updateMilestone(m.id, 'status', s.key)}
                            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                              m.status === s.key
                                ? MILESTONE_STATUS_COLORS[s.key]
                                : 'border-border text-muted hover:border-text'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <div className="md:col-span-6 flex items-center gap-2">
                        <span className="text-[10px] text-muted uppercase tracking-wide">Progress</span>
                        <input
                          type="range" min={0} max={100} step={5}
                          className="flex-1"
                          value={pct}
                          onChange={e => updateMilestone(m.id, 'progressPct', Number(e.target.value))}
                        />
                        <input
                          type="number" min={0} max={100}
                          className="form-input text-xs w-16 tabular-nums"
                          value={pct}
                          onChange={e => updateMilestone(m.id, 'progressPct', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        />
                        <span className="text-[10px] text-muted">%</span>
                      </div>
                    </div>

                    {/* Row 3: notes (full-width textarea) */}
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide">Notes</label>
                      <textarea
                        className="form-textarea text-xs"
                        rows={2}
                        placeholder="Notes (assumptions, dependencies, lead time…)"
                        value={m.notes ?? ''}
                        onChange={e => updateMilestone(m.id, 'notes', e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cost' && (
        <CostEditor
          cost={ind.cost}
          onChange={patch => {
            const next = { ...ind, cost: { ...ind.cost, ...patch } as IndustrializationCost };
            setInd(next);
            trigger({ cost: next.cost });
          }}
          aiBusy={aiBusy}
          aiError={aiError}
          onBootstrapWithAi={() => callAi('cost')}
          onSuggestMaintenance={suggestMaintenance}
          costRationale={costRationale}
          maintenanceRationale={maintenanceRationale}
          poc={(ind as any).pocId}
          inheritedFromPoc={(ind.aiGeneratedFields ?? []).includes('cost.recurringAnnual.computeBreakdown')}
        />
      )}
      {activeTab === 'roi' && (
        <ROIEditor
          roi={ind.roi}
          cost={ind.cost}
          useCase={(ind as any).useCaseId}
          process={(ind as any).processId}
          onChange={patch => {
            const next = { ...ind, roi: { ...ind.roi, ...patch } as IndustrializationROI };
            setInd(next);
            trigger({ roi: next.roi });
          }}
        />
      )}
      {activeTab === 'production' && (
        <div className="card p-5 space-y-3">
          <div>
            <label className="form-label">Monitored KPIs</label>
            <textarea value={ind.production?.monitoredKpis ?? ''} onChange={e => { const v = e.target.value; const next = { ...ind, production: { ...ind.production, monitoredKpis: v } }; setInd(next); trigger({ production: next.production }); }} className="form-textarea" rows={3} />
          </div>
          <div>
            <label className="form-label">Incidents log</label>
            <textarea value={ind.production?.incidentsLog ?? ''} onChange={e => { const v = e.target.value; const next = { ...ind, production: { ...ind.production, incidentsLog: v } }; setInd(next); trigger({ production: next.production }); }} className="form-textarea" rows={3} />
          </div>
          <div>
            <label className="form-label">Decommissioning plan (legacy system)</label>
            <textarea value={ind.production?.decommissioningPlan ?? ''} onChange={e => { const v = e.target.value; const next = { ...ind, production: { ...ind.production, decommissioningPlan: v } }; setInd(next); trigger({ production: next.production }); }} className="form-textarea" rows={2} />
          </div>
        </div>
      )}
      {activeTab === 'risks' && (
        <RisksEditor
          risks={ind.risks ?? []}
          changeManagement={ind.changeManagement ?? { trainingPlan: '', communicationPlan: '' }}
          onRisksChange={(risks: IndustrializationRisk[]) => {
            const next = { ...ind, risks };
            setInd(next);
            trigger({ risks });
          }}
          onChangeManagementChange={cm => {
            const next = { ...ind, changeManagement: cm };
            setInd(next);
            trigger({ changeManagement: cm });
          }}
        />
      )}
      </fieldset>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete industrialization?"
        message={`This will permanently delete ${ind.industrializationId}.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
