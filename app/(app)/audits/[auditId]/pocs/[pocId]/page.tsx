'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, CheckCircle2, Bot, RefreshCw, Archive, ArchiveRestore } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { OriginTrace, type OriginNode } from '@/components/ui/OriginTrace';
import { ComputeCalculator as PocComputeCalculator } from '@/components/cost/ComputeCalculator';
import { useAuditAccess } from '@/context/AuditAccessContext';
import type { POC, POCPhase, POCDecisionType, POCCriterion, POCMilestone } from '@/lib/types';

const PHASES: { key: POCPhase; label: string; num: number }[] = [
  { key: 'design', label: 'Design', num: 1 },
  { key: 'execution', label: 'Execution', num: 2 },
  { key: 'evaluation', label: 'Evaluation', num: 3 },
  { key: 'closed', label: 'Decision', num: 4 },
];

const DECISIONS: { key: POCDecisionType; label: string; color: string; desc: string }[] = [
  { key: 'go', label: 'GO — Scale to implementation', color: 'bg-green-sov text-white border-green-sov', desc: 'All criteria met. Proceed to full implementation.' },
  { key: 'go_conditional', label: 'GO Conditional — Scale with conditions', color: 'bg-teal-poc text-white border-teal-poc', desc: 'Most criteria met. One condition pending.' },
  { key: 'no_go_redesign', label: 'No-Go — Redesign POC', color: 'bg-amber-sov text-white border-amber-sov', desc: 'Criteria not met. Redesign and retry.' },
  { key: 'no_go_discard', label: 'No-Go — Discard use case', color: 'bg-red-sov text-white border-red-sov', desc: 'Use case not viable in this context. Move to Blocked.' },
  { key: 'paused', label: 'Paused — External dependency', color: 'bg-purple-aria text-white border-purple-aria', desc: 'Unresolved external dependency. Document and track.' },
  { key: 'pending', label: 'Pending Decision', color: 'bg-slate-600 text-white border-slate-600', desc: 'Decision has not been made yet.' },
];

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

const STATUS_WEIGHT: Record<MilestoneStatus, number> = {
  pending: 0, work_in_progress: 50, done: 100, missed: 0,
};

function milestonePct(m: { status: MilestoneStatus; progressPct?: number }): number {
  if (m.status === 'done') return 100;
  if (m.status === 'missed' || m.status === 'pending') return Math.max(0, Math.min(100, m.progressPct ?? 0));
  const explicit = m.progressPct;
  if (typeof explicit === 'number' && explicit > 0) return Math.min(100, explicit);
  return STATUS_WEIGHT.work_in_progress;
}


export default function POCDetailPage() {
  const { auditId, pocId } = useParams<{ auditId: string; pocId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [poc, setPoc] = useState<POC | null>(null);
  const [audit, setAudit] = useState<{ _id: string; auditCode?: string; name: string; client?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<POCPhase>('design');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; cascade: boolean; indCount: number; error?: string }>({ open: false, cascade: false, indCount: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { canEdit } = useAuditAccess();

  useEffect(() => {
    Promise.all([
      fetch(`/api/audits/${auditId}/pocs/${pocId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/audits/${auditId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ])
      .then(([pocData, auditData]) => {
        setPoc(pocData);
        if (pocData?.phase) setActiveTab(pocData.phase as POCPhase);
        if (auditData) setAudit(auditData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, pocId]);

  // Pre-fill B2 Restrictions and UseCase data on mount
  useEffect(() => {
    if (!poc || !poc.processId) return;

    const procesId = typeof poc.processId === 'object' ? (poc.processId as any)._id : poc.processId;
    const useCaseId = typeof poc.useCaseId === 'object' ? (poc.useCaseId as any)._id : poc.useCaseId;

    Promise.all([
      fetch(`/api/audits/${auditId}/processes/${procesId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      useCaseId ? fetch(`/api/audits/${auditId}/usecases/${useCaseId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
    ])
      .then(([processData, useCaseData]) => {
        const updates: Partial<POC> = {};

        // Pre-fill Active B2 Restrictions from B2 data if empty
        if (!poc.design?.activeB2Restrictions && processData?.b2?.axes) {
          const axes = processData.b2.axes;
          const axisNames: Record<string, string> = {
            axis1_InfoClassification: 'Axis 1 — Information Classification',
            axis2_ProcessSovereignty: 'Axis 2 — Process Sovereignty',
            axis3_ToolSovereignty: 'Axis 3 — Tool Sovereignty',
            axis4_DataSovereignty: 'Axis 4 — Data Sovereignty',
            axis5_Infrastructure: 'Axis 5 — Infrastructure',
          };

          // Calculate sovereignty index
          const vals = Object.values(axes)
            .map((a: any) => (a?.status === 'green' ? 5 : a?.status === 'amber' ? 3 : a?.status === 'red' ? 1 : null))
            .filter((v) => v !== null) as number[];
          const sovIndex = vals.length > 0 ? (Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10).toFixed(1) : 'N/A';

          const levels: Record<string, string> = { '5.0': 'Full Autonomy', '4.5': 'Managed', '3.5': 'Conditioned', '2.5': 'Restricted', '1.0': 'Critical' };
          let level = 'Not assessed';
          if (sovIndex !== 'N/A') {
            const idx = parseFloat(sovIndex);
            if (idx >= 4.5) level = 'Full Autonomy';
            else if (idx >= 3.5) level = 'Managed';
            else if (idx >= 2.5) level = 'Conditioned';
            else if (idx >= 1.5) level = 'Restricted';
            else level = 'Critical';
          }

          const tableRows = Object.entries(axes)
            .map(([key, axis]: [string, any]) => {
              const status = axis?.status || 'amber';
              const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
              const findings = axis?.findings?.trim() ? axis.findings : '—';
              return `| ${axisNames[key]} | ${statusLabel} | ${findings} |`;
            })
            .join('\n');

          const b2PreFill = `**Sovereignty Index: ${sovIndex} / 5.0 — ${level}**\n\n| Axis | Status | Findings |\n|------|--------|----------|\n${tableRows}`;
          updates.design = { ...poc.design, activeB2Restrictions: b2PreFill };
        }

        // Pre-fill Dev Cost from UseCase if empty
        if (!poc.design?.estimatedDevCostEur && useCaseData?.estimatedDevCostEur) {
          updates.design = { ...(updates.design || poc.design), estimatedDevCostEur: useCaseData.estimatedDevCostEur };
        }

        // Pre-fill Compute Breakdown from UseCase if empty
        if (!poc.computeBreakdown?.mode && useCaseData?.computeBreakdown) {
          updates.computeBreakdown = useCaseData.computeBreakdown;
        }

        if (Object.keys(updates).length > 0) {
          setPoc((prev) => (prev ? { ...prev, ...updates } : null));
        }
      })
      .catch(() => {
        // Silent fail
      });
  }, [poc?.processId, poc?.useCaseId, auditId]);


  const save = useCallback(async (updated: Partial<POC>) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/audits/${auditId}/pocs/${pocId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      setPoc(data);
      setSaveStatus('saved');
    } catch { setSaveStatus('unsaved'); }
  }, [auditId, pocId]);

  const trigger = (updated: Partial<POC>) => {
    setSaveStatus('unsaved');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 2000);
  };

  const updateDesign = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, design: { ...poc.design, [field]: value } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const updateCriterion = (id: string, field: string, value: unknown) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).map((c: POCCriterion) => c.id === id ? { ...c, [field]: value } : c);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const addCriterion = () => {
    if (!poc) return;
    const criterion: POCCriterion = { id: uuidv4(), criterion: '', description: '', successThreshold: '' };
    const next = { ...poc, design: { ...poc.design, successCriteria: [...(poc.design?.successCriteria || []), criterion] } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const removeCriterion = (id: string) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).filter((c: POCCriterion) => c.id !== id);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const updateExecution = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, execution: { ...poc.execution, [field]: value } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  // Milestones
  const addMilestone = () => {
    if (!poc) return;
    const milestones: POCMilestone[] = poc.execution?.milestones ?? [];
    const m: POCMilestone = {
      id: uuidv4(), name: '', dueDate: new Date(),
      status: 'pending', progressPct: 0, effortHours: 0, notes: '',
    };
    const next = { ...poc, execution: { ...poc.execution, milestones: [...milestones, m] } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const updateMilestone = (id: string, field: string, value: unknown) => {
    if (!poc) return;
    const milestones = (poc.execution?.milestones ?? []).map((m: POCMilestone) => m.id === id ? { ...m, [field]: value } : m);
    const next = { ...poc, execution: { ...poc.execution, milestones } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const removeMilestone = (id: string) => {
    if (!poc) return;
    const milestones = (poc.execution?.milestones ?? []).filter((m: POCMilestone) => m.id !== id);
    const next = { ...poc, execution: { ...poc.execution, milestones } };
    setPoc(next as POC);
    trigger({ execution: next.execution });
  };

  const updateEvaluation = (field: string, value: unknown) => {
    if (!poc) return;
    const next = { ...poc, evaluation: { ...poc.evaluation, [field]: value } };
    setPoc(next as POC);
    trigger({ evaluation: next.evaluation });
  };

  const updateCriterionResult = (id: string, actualResult: string, passed: boolean) => {
    if (!poc) return;
    const criteria = (poc.design?.successCriteria || []).map((c: POCCriterion) => c.id === id ? { ...c, actualResult, passed } : c);
    const next = { ...poc, design: { ...poc.design, successCriteria: criteria } };
    setPoc(next as POC);
    trigger({ design: next.design });
  };

  const setDecision = async (decision: POCDecisionType) => {
    if (!poc) return;
    const next = { ...poc, phase: 'closed' as POCPhase, decision: { ...poc.decision, decision, decidedAt: new Date() } };
    setPoc(next as POC);
    setActiveTab('closed');
    await save({ phase: 'closed', decision: next.decision });
  };

  const advanceTo = async (nextPhase: POCPhase) => {
    if (!poc) return;
    const next = { ...poc, phase: nextPhase };
    setPoc(next as POC);
    setActiveTab(nextPhase);
    await save({ phase: nextPhase });
  };

  const requestDelete = () => setConfirmDelete({ open: true, cascade: false, indCount: 0 });

  const handleDelete = async () => {
    const url = `/api/audits/${auditId}/pocs/${pocId}${confirmDelete.cascade ? '?cascade=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      router.push(`/audits/${auditId}/pocs`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data?.dependents) {
      setConfirmDelete({ open: true, cascade: true, indCount: data.dependents.industrializations ?? 0, error: data.error });
    } else {
      setConfirmDelete(s => ({ ...s, error: data?.error || 'Delete failed' }));
    }
  };

  const toggleArchive = async () => {
    if (!poc) return;
    const next = !(poc as any).isArchived;
    setSaveStatus('saving');
    const res = await fetch(`/api/audits/${auditId}/pocs/${pocId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: next }),
    });
    if (res.ok) {
      const data = await res.json();
      setPoc(data);
      setSaveStatus('saved');
      if (next) router.push(`/audits/${auditId}/pocs`);
    } else {
      setSaveStatus('unsaved');
    }
  };

  const [refreshingFill, setRefreshingFill] = useState(false);
  const aiGeneratedFields: string[] = (poc as any)?.aiGeneratedFields ?? [];

  const milestones: POCMilestone[] = poc?.execution?.milestones ?? [];
  const doneMilestones = milestones.filter(m => m.status === 'done').length;
  const aggregateProgress = milestones.length === 0 ? 0
    : Math.round(milestones.reduce((s, m) => s + milestonePct(m as any), 0) / milestones.length);
  const currentPhaseIdx = PHASES.findIndex(p => p.key === poc?.phase);

  if (loading || !poc) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/audits/${auditId}/pocs`)} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="teal">B8</Badge>
          <span className="font-mono text-sm text-teal-poc font-semibold">{poc.pocId}</span>
          {poc.name && <span className="text-sm font-semibold text-text">— {poc.name}</span>}
          <Badge variant={currentPhaseIdx === 3 ? 'green' : 'blue'}>{poc.phase}</Badge>
          {(poc as any).isArchived && (
            <span className="text-[11px] uppercase tracking-wide font-semibold text-muted bg-smoke border border-border rounded px-2 py-0.5">Archived</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          {canEdit && (
            <button onClick={toggleArchive} className="text-muted hover:text-blue-aria" title={(poc as any).isArchived ? 'Unarchive' : 'Archive'}>
              {(poc as any).isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
          )}
          {canEdit && (
            <button onClick={requestDelete} className="text-muted hover:text-red-sov" title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Origin trace */}
      {(() => {
        const uc = (poc as any).useCaseId;
        const proc = (poc as any).processId;
        const nodes: OriginNode[] = [];
        if (audit) nodes.push({ kind: 'audit', code: audit.auditCode ?? '—', label: audit.name, href: `/audits/${audit._id}` });
        if (proc && typeof proc === 'object' && proc.procId) nodes.push({ kind: 'process', code: proc.procId, label: proc.name, href: `/audits/${auditId}/processes/${typeof proc === 'object' ? (proc as any)._id ?? '' : proc}` });
        if (uc && typeof uc === 'object' && uc.cuId) nodes.push({ kind: 'usecase', code: uc.cuId, label: uc.description, href: `/audits/${auditId}/usecases` });
        nodes.push({ kind: 'poc', code: poc.pocId, label: poc.name });
        return <div className="mb-5"><OriginTrace nodes={nodes} /></div>;
      })()}

      <fieldset disabled={!canEdit} className="contents">

      {/* Phase stepper */}
      <div className="flex items-center gap-0 mb-6 card p-3">
        {PHASES.map((p, i) => {
          const active = poc.phase === p.key;
          const done = currentPhaseIdx > i;
          return (
            <div key={p.key} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 flex-1 justify-center py-1 rounded text-xs font-medium ${active ? 'bg-teal-poc text-white' : done ? 'text-green-sov' : 'text-muted'}`}>
                {done ? <CheckCircle2 size={14} /> : <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${active ? 'border-white bg-white/20' : 'border-current'}`}>{p.num}</span>}
                {p.label}
              </div>
              {i < PHASES.length - 1 && <div className={`h-px w-4 ${done ? 'bg-green-sov' : 'bg-border'}`} />}
            </div>
          );
        })}
      </div>

      {/* Tabs nav */}
      <div className="flex gap-1 border-b border-border mb-5">
        {PHASES.map(p => {
          const isActive = activeTab === p.key;
          const isCurrent = poc.phase === p.key;
          const isDone = currentPhaseIdx > PHASES.findIndex(x => x.key === p.key);
          return (
            <button
              key={p.key}
              onClick={() => setActiveTab(p.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                isActive
                  ? 'border-teal-poc text-teal-poc'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {isDone ? (
                <CheckCircle2 size={14} className="text-green-sov" />
              ) : (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${isActive ? 'border-teal-poc text-teal-poc' : isCurrent ? 'border-blue-aria text-blue-aria' : 'border-muted text-muted'}`}>
                  {p.num}
                </span>
              )}
              {p.label}
              {isCurrent && !isActive && <span className="text-[10px] text-blue-aria ml-1">· current</span>}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {/* Phase 1: Design */}
        {activeTab === 'design' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">POC Name</label>
                <input className="form-input" placeholder="Short descriptive name for this POC…"
                  value={poc.name || ''}
                  onChange={e => {
                    const next = { ...poc, name: e.target.value };
                    setPoc(next as POC);
                    trigger({ name: e.target.value });
                  }} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Measurable Objective</label>
                <textarea rows={1} className="form-textarea resize-none h-[42px]" value={poc.design?.measurableObjective || ''}
                  onChange={e => updateDesign('measurableObjective', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Scope Description</label>
                <textarea rows={4} className="form-textarea" value={poc.design?.scopeDescription || ''}
                  onChange={e => updateDesign('scopeDescription', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input type="date" className="form-input"
                  value={poc.design?.startDate ? new Date(poc.design.startDate).toISOString().slice(0, 10) : ''}
                  onChange={e => updateDesign('startDate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Deadline</label>
                <input type="date" className="form-input"
                  value={poc.design?.deadlineDate ? new Date(poc.design.deadlineDate).toISOString().slice(0, 10) : ''}
                  onChange={e => updateDesign('deadlineDate', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Required Resources</label>
                <textarea rows={4} className="form-textarea" value={poc.design?.requiredResources || ''}
                  onChange={e => updateDesign('requiredResources', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Dev Cost — Man-Hours (€)</label>
                <input type="number" className="form-input" value={poc.design?.estimatedDevCostEur || ''}
                  onChange={e => updateDesign('estimatedDevCostEur', Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Active B2 Restrictions</label>
                <textarea rows={2} className="form-textarea" value={poc.design?.activeB2Restrictions || ''}
                  onChange={e => updateDesign('activeB2Restrictions', e.target.value)} />
              </div>
            </div>

            {/* Success Criteria */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Success Criteria</h3>
                <button onClick={addCriterion} className="btn-primary text-xs flex items-center gap-1"><Plus size={13} /> Add Criterion</button>
              </div>
              {(poc.design?.successCriteria || []).length === 0 ? (
                <p className="text-sm text-muted">Add at least 2 success criteria.</p>
              ) : (
                <div className="space-y-3">
                  {(poc.design?.successCriteria as POCCriterion[]).map(c => (
                    <div key={c.id} className="border border-border rounded p-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">Criterion</label>
                        <input className="form-input text-xs" value={c.criterion} onChange={e => updateCriterion(c.id, 'criterion', e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label">Description</label>
                        <input className="form-input text-xs" value={c.description} onChange={e => updateCriterion(c.id, 'description', e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="form-label">Success Threshold</label>
                          <input className="form-input text-xs" value={c.successThreshold} onChange={e => updateCriterion(c.id, 'successThreshold', e.target.value)} />
                        </div>
                        <button onClick={() => removeCriterion(c.id)} className="text-muted hover:text-red-sov mt-4"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {poc.phase === 'design' && (
              <button
                onClick={() => advanceTo('execution')}
                disabled={(poc.design?.successCriteria || []).length < 2}
                className="btn-primary disabled:opacity-50"
              >
                Advance to Execution →
              </button>
            )}


        {/* Catalog-driven POC compute scope (carries to Industrialization) */}
        <div className="card border-l-4 border-l-blue-aria p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                Compute scope &amp; cost (POC)
                <span className="text-[10px] font-medium uppercase tracking-wide text-blue-aria bg-blue-pale rounded px-1.5 py-0.5">carries to industrialization</span>
              </h3>
              <p className="text-[11px] text-muted leading-snug">
                Size the POC for its <strong>limited pilot scope</strong> — typical POC volumes (a handful of users, hundreds–low thousands of executions/year) — using the central model + GPU catalog. The model / GPU / mode choice is the part that usually carries unchanged to production; <em>annual executions</em> and <em>GPU count</em> are the ones that get <strong>scaled up</strong> on promotion to industrialization.
                {' '}If POC results invalidate the assumptions (e.g. a different model wins, on-prem turns out infeasible), you can change anything in industrialization without losing the inherited starting point.
              </p>
            </div>
            {(poc as any).computeBreakdown?.computedAnnualEur > 0 && (
              <span className="text-xs font-semibold text-text tabular-nums whitespace-nowrap ml-2">
                €{((poc as any).computeBreakdown?.computedAnnualEur ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })} /yr (POC)
              </span>
            )}
          </div>
          <PocComputeCalculator
            title="POC compute calculator"
            breakdown={(poc as any).computeBreakdown}
            onChange={(next, computed) => {
              const merged = { ...next, computedAnnualEur: computed };
              const nextPoc = { ...poc, computeBreakdown: merged } as any;
              setPoc(nextPoc);
              trigger({ computeBreakdown: merged } as any);
            }}
          />
        </div>

          </div>
        )}

        {/* Phase 2: Execution */}
        {activeTab === 'execution' && (
          <div className="space-y-4">
            {/* Milestones table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Milestones</h3>
                <button onClick={addMilestone} className="btn-primary text-xs flex items-center gap-1"><Plus size={13} /> Add Milestone</button>
              </div>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted">No milestones yet. Add at least one to track progress.</p>
              ) : (
                <div className="space-y-3">
                  {milestones.map(m => {
                    const pct = milestonePct(m as any);
                    return (
                      <div key={m.id} className="border border-border rounded p-3 space-y-2">
                        <div className="grid md:grid-cols-12 gap-2 items-end">
                          <div className="md:col-span-7">
                            <label className="text-[10px] text-muted uppercase tracking-wide">Name</label>
                            <input className="form-input text-xs" placeholder="Milestone name…"
                              value={m.name} onChange={e => updateMilestone(m.id, 'name', e.target.value)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted uppercase tracking-wide">Effort (h)</label>
                            <input type="number" min={0} className="form-input text-xs tabular-nums"
                              value={(m as any).effortHours ?? 0}
                              onChange={e => updateMilestone(m.id, 'effortHours', Number(e.target.value) || 0)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-muted uppercase tracking-wide">Due date</label>
                            <input type="date" className="form-input text-xs"
                              value={m.dueDate ? new Date(m.dueDate).toISOString().slice(0, 10) : ''}
                              onChange={e => updateMilestone(m.id, 'dueDate', e.target.value)} />
                          </div>
                          <button onClick={() => removeMilestone(m.id)}
                            className="md:col-span-1 text-muted hover:text-red-sov justify-self-end p-1 self-center"
                            title="Remove milestone">
                            <Trash2 size={13} />
                          </button>
                        </div>
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
              {/* Progress bar */}
              {milestones.length > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Progress</span>
                    <span>{doneMilestones}/{milestones.length} done · {aggregateProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full">
                    <div className="h-2 bg-teal-poc rounded-full transition-all"
                      style={{ width: `${aggregateProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Incidents</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.execution?.incidents || ''}
                  onChange={e => updateExecution('incidents', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Plan Deviations</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.execution?.planDeviations || ''}
                  onChange={e => updateExecution('planDeviations', e.target.value)} />
              </div>
            </div>

            {poc.phase === 'execution' && (
              <button
                onClick={() => advanceTo('evaluation')}
                disabled={milestones.length === 0}
                className="btn-primary disabled:opacity-50"
              >
                Advance to Evaluation →
              </button>
            )}
          </div>
        )}

        {/* Phase 3: Evaluation */}
        {activeTab === 'evaluation' && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Results vs. Success Criteria</h3>
            <div className="space-y-3">
              {(poc.design?.successCriteria as POCCriterion[] || []).map(c => (
                <div key={c.id} className="border border-border rounded p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{c.criterion || 'Unnamed criterion'}</div>
                      <div className="text-xs text-muted">Threshold: {c.successThreshold}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="form-input text-xs w-36" placeholder="Actual result…" value={c.actualResult || ''}
                        onChange={e => updateCriterionResult(c.id, e.target.value, c.passed || false)} />
                      <button onClick={() => updateCriterionResult(c.id, c.actualResult || '', !c.passed)}
                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${c.passed ? 'bg-green-sov text-white border-green-sov' : 'border-border text-muted hover:border-green-sov'}`}>
                        {c.passed ? '✓ Pass' : '✗ Fail'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(poc.design?.successCriteria || []).length === 0 && (
                <p className="text-sm text-muted">No success criteria defined in Design phase.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Technical Lessons', field: 'technicalLessons' },
                { label: 'Organisational Lessons', field: 'organisationalLessons' },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="form-label">{label}</label>
                  <textarea rows={2} className="form-textarea text-xs"
                    value={((poc.evaluation || {}) as unknown as Record<string, string>)[field] || ''}
                    onChange={e => updateEvaluation(field, e.target.value)} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="form-label">Estimated Production Impact</label>
                <textarea rows={2} className="form-textarea text-xs" value={poc.evaluation?.estimatedProductionImpact || ''}
                  onChange={e => updateEvaluation('estimatedProductionImpact', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Actual Cost (€)</label>
                <input type="number" className="form-input" value={poc.evaluation?.actualCostEur || ''}
                  onChange={e => updateEvaluation('actualCostEur', Number(e.target.value))} />
              </div>
            </div>

            {poc.phase === 'evaluation' && (
              <button onClick={() => advanceTo('closed')} className="btn-primary">Proceed to Decision →</button>
            )}
          </div>
        )}

        {/* Phase 4: Decision */}
        {activeTab === 'closed' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {DECISIONS.map(d => {
                const active = poc.decision?.decision === d.key;
                return (
                  <button key={d.key} onClick={() => setDecision(d.key)}
                    className={`flex items-start gap-3 p-4 rounded border-2 text-left transition-all ${active ? d.color : 'border-border hover:border-blue-aria'}`}>
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${active ? 'border-current bg-current' : 'border-muted'}`} />
                    <div>
                      <div className="font-semibold text-sm">{d.label}</div>
                      <div className={`text-xs mt-0.5 ${active ? 'opacity-80' : 'text-muted'}`}>{d.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Justification</label>
                <textarea rows={3} className="form-textarea" value={poc.decision?.justification || ''}
                  onChange={e => {
                    const n = { ...poc, decision: { ...poc.decision, justification: e.target.value } };
                    setPoc(n as POC);
                    trigger({ decision: n.decision });
                  }} />
              </div>
              {poc.decision?.decision === 'go_conditional' && (
                <div>
                  <label className="form-label">Conditional Requirement</label>
                  <textarea rows={2} className="form-textarea" value={poc.decision?.conditionalRequirement || ''}
                    onChange={e => {
                      const n = { ...poc, decision: { ...poc.decision, conditionalRequirement: e.target.value } };
                      setPoc(n as POC);
                      trigger({ decision: n.decision });
                    }} />
                </div>
              )}
              <div>
                <label className="form-label">Next Steps</label>
                <textarea rows={2} className="form-textarea" value={poc.decision?.nextSteps || ''}
                  onChange={e => {
                    const n = { ...poc, decision: { ...poc.decision, nextSteps: e.target.value } };
                    setPoc(n as POC);
                    trigger({ decision: n.decision });
                  }} />
              </div>
            </div>
            {(poc.decision?.decision === 'go' || poc.decision?.decision === 'go_conditional') && (
              <div className="p-3 bg-green-sov-light rounded text-sm text-green-sov flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>GO decision recorded. Update the B7 roadmap initiative with actual POC data.</span>
                <button onClick={() => router.push(`/audits/${auditId}/roadmap`)} className="ml-auto text-xs underline">Open Roadmap →</button>
              </div>
            )}
          </div>
        )}
      </div>

      </fieldset>

      <ConfirmModal
        isOpen={confirmDelete.open}
        title={confirmDelete.cascade ? 'Delete POC and its industrialization?' : 'Delete POC?'}
        message={
          confirmDelete.cascade
            ? `This POC has ${confirmDelete.indCount} linked industrialization. Deleting the POC will also delete it. This cannot be undone.`
            : `This will permanently delete ${poc.pocId}. Consider archiving instead if you might need it later.`
        }
        confirmLabel={confirmDelete.cascade ? 'Delete both' : 'Delete'}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete({ open: false, cascade: false, indCount: 0 })}
      />
    </div>
  );
}
