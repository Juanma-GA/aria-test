'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, CheckCircle2, Bot, RefreshCw, Archive, ArchiveRestore, TrendingUp, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ComputeCalculator as PocComputeCalculator } from '@/components/cost/ComputeCalculator';
import { useAuditAccess } from '@/context/AuditAccessContext';
import { apiUrl } from '@/lib/utils';
import { computeAnnualCompute } from '@/lib/calculations';
import type { POC, POCPhase, POCDecisionType, POCCriterion, POCMilestone } from '@/lib/types';

const PHASES: { key: POCPhase; label: string; num: number }[] = [
  { key: 'design', label: 'Design', num: 1 },
  { key: 'execution', label: 'Execution', num: 2 },
  { key: 'evaluation', label: 'Evaluation', num: 3 },
  { key: 'decision', label: 'Decision', num: 4 },
  { key: 'closed', label: 'Closed', num: 5 },
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
  const [roiOpen, setRoiOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { canEdit } = useAuditAccess();

  const [allAudits, setAllAudits] = useState<any[]>([]);
  const [assignedUCs, setAssignedUCs] = useState<any[]>([]);
  const [showUCPicker, setShowUCPicker] = useState(false);
  const [pickerAuditId, setPickerAuditId] = useState('');
  const [pickerProcessId, setPickerProcessId] = useState('');
  const [pickerProcesses, setPickerProcesses] = useState<any[]>([]);
  const [pickerUCs, setPickerUCs] = useState<any[]>([]);
  const [pickerSelectedUCId, setPickerSelectedUCId] = useState('');
  const [loadingPickerProcesses, setLoadingPickerProcesses] = useState(false);
  const [loadingPickerUCs, setLoadingPickerUCs] = useState(false);
  const assignedUCsInitialized = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl(`/api/audits/${auditId}/pocs/${pocId}`), { credentials: 'include' }).then(r => r.json()),
      fetch(apiUrl(`/api/audits/${auditId}`), { credentials: 'include' }).then(r => r.ok ? r.json() : null),
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
      fetch(apiUrl(`/api/audits/${auditId}/processes/${procesId}`), { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      useCaseId ? fetch(apiUrl(`/api/audits/${auditId}/usecases/${useCaseId}`), { credentials: 'include' }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
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
              return `${axisNames[key]} | ${statusLabel} | ${findings}`;
            })
            .join('\n');

          const b2PreFill = `Sovereignty Index: ${sovIndex} / 5.0 — ${level}\n\n${tableRows}`;
          updates.design = { ...poc.design, activeB2Restrictions: b2PreFill };
        }

        // Pre-fill Compute Breakdown from UseCase if empty
        if (!poc.computeBreakdown?.mode && useCaseData?.computeBreakdown) {
          updates.computeBreakdown = useCaseData.computeBreakdown;
        }

        // Pre-fill dev cost fields from UseCase
        if (poc.design?.estimatedImplWeeks === undefined && useCaseData?.estimatedImplWeeks !== undefined) {
          updates.design = { ...(updates.design || poc.design),
            estimatedImplWeeks: useCaseData.estimatedImplWeeks };
        }
        if (poc.design?.nDevs === undefined && useCaseData?.nDevs !== undefined) {
          updates.design = { ...(updates.design || poc.design),
            nDevs: useCaseData.nDevs };
        }
        if (poc.design?.devRateEur === undefined && useCaseData?.devRateEur !== undefined) {
          updates.design = { ...(updates.design || poc.design),
            devRateEur: useCaseData.devRateEur };
        }

        if (Object.keys(updates).length > 0) {
          setPoc((prev) => (prev ? { ...prev, ...updates } : null));
          if (updates.design) {
            trigger({ design: updates.design } as any);
          }
        }
      })
      .catch(() => {
        // Silent fail
      });
  }, [poc?.processId, poc?.useCaseId, auditId]);

  useEffect(() => {
    assignedUCsInitialized.current = false;
    setAssignedUCs([]);
  }, [pocId]);

  useEffect(() => {
    fetch(apiUrl('/api/audits'), { credentials: 'include' })
      .then(r => r.json())
      .then(data => setAllAudits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!poc || assignedUCsInitialized.current) return;
    const ids = (poc as any).useCaseIds as any[] ?? [];
    if (ids.length > 0) {
      if (typeof ids[0] === 'object' && ids[0]?.cuId) {
        setAssignedUCs(ids);
        assignedUCsInitialized.current = true;
      } else {
        const singularUC = (poc as any).useCaseId;
        if (singularUC && typeof singularUC === 'object' && singularUC.cuId) {
          const additionalIds = ids.filter(
            id => String(id) !== String(singularUC._id));
          if (additionalIds.length === 0) {
            setAssignedUCs([singularUC]);
            assignedUCsInitialized.current = true;
          } else {
            Promise.all(
              additionalIds.map(id =>
                fetch(apiUrl(`/api/usecases/${id}`), { credentials: 'include' })
                  .then(r => r.ok ? r.json() : null)
                  .catch(() => null)
              )
            ).then(results => {
              const fetched = results.filter(Boolean);
              setAssignedUCs([singularUC, ...fetched]);
              assignedUCsInitialized.current = true;
            });
          }
        }
      }
    } else if ((poc as any).useCaseId) {
      const uc = (poc as any).useCaseId;
      if (typeof uc === 'object' && uc?.cuId) {
        setAssignedUCs([uc]);
        assignedUCsInitialized.current = true;
      }
    }
  }, [poc]);

  useEffect(() => {
    if (!pickerAuditId) return;
    setPickerProcessId('');
    setPickerUCs([]);
    setPickerSelectedUCId('');
    setLoadingPickerProcesses(true);
    fetch(apiUrl(`/api/audits/${pickerAuditId}/processes`),
      { credentials: 'include' })
      .then(r => r.json())
      .then(data => setPickerProcesses(Array.isArray(data) ? data : []))
      .catch(() => setPickerProcesses([]))
      .finally(() => setLoadingPickerProcesses(false));
  }, [pickerAuditId]);

  useEffect(() => {
    if (!pickerAuditId || !pickerProcessId) return;
    setPickerSelectedUCId('');
    setLoadingPickerUCs(true);
    fetch(apiUrl(`/api/audits/${pickerAuditId}/usecases?processId=${pickerProcessId}`),
      { credentials: 'include' })
      .then(r => r.json())
      .then(data => setPickerUCs(
        Array.isArray(data)
          ? data.filter((u: any) => u.status === 'eligible' || u.status === 'in_poc')
          : []
      ))
      .catch(() => setPickerUCs([]))
      .finally(() => setLoadingPickerUCs(false));
  }, [pickerAuditId, pickerProcessId]);


  const save = useCallback(async (updated: Partial<POC>) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/pocs/${pocId}`), {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      setPoc(prev => prev ? {
        ...data,
        design: { ...data.design, ...prev.design }
      } : data);
      setSaveStatus('saved');
    } catch { setSaveStatus('unsaved'); }
  }, [auditId, pocId]);

  const trigger = (updated: Partial<POC>) => {
    setSaveStatus('unsaved');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 2000);
  };

  const patchPoc = async (fields: Record<string, any>,
    skipAssignedUCsReset = false) => {
    const res = await fetch(
      apiUrl(`/api/audits/${auditId}/pocs/${pocId}`),
      { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(fields) });
    if (res.ok) {
      const data = await res.json();
      if (skipAssignedUCsReset) {
        setPoc((prev: any) => prev
          ? { ...prev, ...data, useCaseIds: prev.useCaseIds }
          : data);
      } else {
        setPoc(data);
      }
    }
  };

  const handleRemoveUC = async (ucId: string) => {
    if (assignedUCs.length <= 1) return;
    const newIds = assignedUCs
      .filter(u => String(u._id ?? u) !== String(ucId))
      .map(u => String(u._id ?? u));
    await patchPoc({ useCaseIds: newIds }, true);
    // Re-fetch to get populated useCaseIds for ROI calculation
    const res = await fetch(apiUrl(`/api/audits/${auditId}/pocs/${pocId}`),
      { credentials: 'include' });
    if (res.ok) {
      const updated = await res.json();
      setPoc(updated);
      // Derive assignedUCs from re-fetched populated data
      setAssignedUCs(updated.useCaseIds || []);
    } else {
      // Fallback: update from memory if re-fetch fails
      setAssignedUCs(prev =>
        prev.filter(u => String(u._id ?? u) !== String(ucId)));
    }
  };

  const handleAddUC = async () => {
    if (!pickerSelectedUCId) return;
    const uc = pickerUCs.find(u => u._id === pickerSelectedUCId);
    if (!uc) return;
    if (assignedUCs.find(u => String(u._id ?? u) === pickerSelectedUCId))
      return;
    const newIds = [...assignedUCs.map(u => String(u._id ?? u)),
      pickerSelectedUCId];
    await patchPoc({ useCaseIds: newIds }, true);
    // Re-fetch to get populated useCaseIds for ROI calculation
    const res = await fetch(apiUrl(`/api/audits/${auditId}/pocs/${pocId}`),
      { credentials: 'include' });
    if (res.ok) {
      const updated = await res.json();
      setPoc(updated);
      // Derive assignedUCs from re-fetched populated data
      setAssignedUCs(updated.useCaseIds || []);
    } else {
      // Fallback: update from memory if re-fetch fails
      setAssignedUCs(prev => [...prev, uc]);
    }
    setPickerSelectedUCId('');
    setPickerProcessId('');
    setPickerUCs([]);
    setShowUCPicker(false);
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
    const next = { ...poc, phase: 'decision' as POCPhase, decision: { ...poc.decision, decision, decidedAt: new Date() } };
    setPoc(next as POC);
    setActiveTab('decision');
    await save({ phase: 'decision', decision: next.decision });
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
    const url = apiUrl(`/api/audits/${auditId}/pocs/${pocId}${confirmDelete.cascade ? '?cascade=true' : ''}`);
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
    const res = await fetch(apiUrl(`/api/audits/${auditId}/pocs/${pocId}`), {
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

      {/* Assigned Use Cases section */}
      <div className="px-4 py-3 border-b border-border bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">
            Assigned Use Cases ({assignedUCs.length})
          </span>
          {canEdit && (
            <button
              onClick={() => setShowUCPicker(true)}
              className="text-xs text-blue-aria hover:underline
                flex items-center gap-1"
            >
              + Add UC
            </button>
          )}
        </div>
        {assignedUCs.length === 0 ? (
          <p className="text-xs text-muted">No use cases assigned.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {assignedUCs.map((uc, index) => {
              const ucObj = typeof uc === 'object' ? uc as any : null;
              const isReference = index === 0;
              return (
                <Tooltip key={ucObj?._id ?? index}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex items-start justify-between
                        rounded p-2 border text-xs cursor-help ${
                        isReference
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-border'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-xs">
                            {ucObj?.cuId ?? String(uc)}
                          </span>
                          {isReference && (
                            <span className="text-[10px] font-medium px-1.5
                              py-0.5 rounded bg-blue-100 text-blue-700">
                              Reference
                            </span>
                          )}
                        </div>
                        <span className="text-muted text-[10px]">
                          {ucObj?.processId?.procId ? `${ucObj.processId.procId} — ${ucObj.processId.name}` : ''}
                        </span>
                        <span className="text-muted truncate">
                          {ucObj?.description?.slice(0, 60)}
                        </span>
                      </div>
                      {!isReference && canEdit && (
                        <button
                          onClick={() => handleRemoveUC(ucObj?._id)}
                          className="ml-2 text-muted hover:text-red-500
                            flex-shrink-0 mt-0.5"
                          title="Remove UC"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <div className="text-xs space-y-1">
                      <p className="font-semibold">{ucObj?.cuId}</p>
                      <p>{ucObj?.description}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible ROI Estimate */}
      <div className="px-4 py-2 border-b border-border bg-slate-50 mb-5">
        <button
          onClick={() => setRoiOpen(r => !r)}
          className="flex items-center gap-2 text-xs font-medium text-text hover:text-blue-aria transition-colors"
        >
          <TrendingUp size={12} />
          ROI Estimate
          <ChevronDown size={12} className={`transition-transform ${roiOpen ? 'rotate-180' : ''}`} />
        </button>

        {roiOpen && (() => {
          const assignedUCsForROI = assignedUCs.length > 0
            ? assignedUCs
            : [(poc as any).useCaseId].filter(Boolean);

          const proc = (poc as any).processId;
          const b1Profiles = proc?.b1?.profiles ?? [];
          const annualReps = proc?.b3?.annualRepetitions ?? 0;

          const grossSaving = assignedUCsForROI.reduce(
            (total: number, uc: any) => {
              const ucTimeSaved = uc?.timeSavedPerProfile ?? [];
              return total + ucTimeSaved.reduce((s: number, e: any) => {
                const profile = b1Profiles.find(
                  (p: any) => p.id === e.profileId);
                return s + (e.hoursPerExecution ?? 0)
                  * (profile?.hourlyRateEur ?? 0) * annualReps;
              }, 0);
            }, 0);

          const computeCost = assignedUCsForROI.reduce(
            (total: number, uc: any) =>
              total + (uc?.computeBreakdown?.computedAnnualEur ?? 0), 0);

          const devCost = assignedUCsForROI.reduce(
            (total: number, uc: any) => {
              const base = uc?.estimatedDevCostEur ?? 0;
              const additional = uc?.isInstance
                ? (uc?.additionalDevCostEur ?? 0) : 0;
              return total + base + additional;
            }, 0);

          const netSaving = Math.max(grossSaving - computeCost, 0);
          const paybackMonths = devCost > 0 && netSaving > 0
            ? devCost / (netSaving / 12) : 0;

          if (grossSaving === 0) {
            return <p className="text-xs text-muted mt-2">No ROI data available.</p>;
          }

          return (
            <div className="mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-green-50 border border-green-200 rounded p-2">
                  <p className="text-muted uppercase tracking-wide text-[10px] mb-1">Gross Annual Saving</p>
                  <p className="font-bold text-green-700 text-sm">€{Math.round(grossSaving).toLocaleString('de-DE')}/yr</p>
                </div>
                {computeCost > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2">
                    <p className="text-muted uppercase tracking-wide text-[10px] mb-1">Compute Cost/yr</p>
                    <p className="font-bold text-amber-700 text-sm">€{Math.round(computeCost).toLocaleString('de-DE')}/yr</p>
                  </div>
                )}
                <div className="bg-green-50 border border-green-200 rounded p-2">
                  <p className="text-muted uppercase tracking-wide text-[10px] mb-1">Net Annual Saving</p>
                  <p className="font-bold text-green-700 text-sm">€{Math.round(netSaving).toLocaleString('de-DE')}/yr</p>
                </div>
                {devCost > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded p-2">
                    <p className="text-muted uppercase tracking-wide text-[10px] mb-1">Dev Cost (one-time)</p>
                    <p className="font-bold text-red-700 text-sm">€{devCost.toLocaleString('de-DE')}</p>
                  </div>
                )}
                {paybackMonths > 0 && (
                  <div className="bg-slate-50 border border-border rounded p-2 col-span-2">
                    <p className="text-muted uppercase tracking-wide text-[10px] mb-1">Payback Period</p>
                    <p className="font-bold text-text text-sm">{paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} months</p>
                    <p className="text-[9px] text-muted border-t border-border/30 mt-1.5 pt-1.5">
                      €{Math.round(devCost).toLocaleString('de-DE')} / €{Math.round(netSaving / 12).toLocaleString('de-DE')}/mo ≈ {paybackMonths.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} months
                    </p>
                  </div>
                )}
              </div>

              {assignedUCsForROI.length > 1 && (
                <div className="bg-slate-50 border border-border rounded p-3 text-xs space-y-2">
                  <p className="font-semibold text-muted uppercase tracking-wide text-[10px]">Breakdown by Use Case</p>
                  <div className="space-y-1.5">
                    {assignedUCsForROI.map((uc: any) => {
                      const ucGross = (uc?.timeSavedPerProfile ?? []).reduce((s: number, e: any) => {
                        const profile = b1Profiles.find((p: any) => p.id === e.profileId);
                        return s + (e.hoursPerExecution ?? 0) * (profile?.hourlyRateEur ?? 0) * annualReps;
                      }, 0);
                      const ucCompute = uc?.computeBreakdown?.computedAnnualEur ?? 0;
                      const ucDevCost = (uc?.estimatedDevCostEur ?? 0) + (uc?.isInstance ? (uc?.additionalDevCostEur ?? 0) : 0);
                      const ucNet = Math.max(ucGross - ucCompute, 0);

                      return (
                        <div key={uc._id} className="flex justify-between items-start text-[11px] py-1 border-t border-border/30 pt-1.5 first:border-t-0 first:pt-0">
                          <span className="font-mono text-text">{uc.cuId}</span>
                          <div className="flex gap-2 text-right">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-muted">Gross</span>
                              <span className="font-medium text-green-700">€{Math.round(ucGross).toLocaleString('de-DE')}</span>
                            </div>
                            {ucCompute > 0 && (
                              <div className="flex flex-col">
                                <span className="text-[9px] text-muted">Compute</span>
                                <span className="font-medium text-amber-700">€{Math.round(ucCompute).toLocaleString('de-DE')}</span>
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-[9px] text-muted">Net</span>
                              <span className="font-medium text-green-700">€{Math.round(ucNet).toLocaleString('de-DE')}</span>
                            </div>
                            {ucDevCost > 0 && (
                              <div className="flex flex-col">
                                <span className="text-[9px] text-muted">Dev</span>
                                <span className="font-medium text-red-700">€{Math.round(ucDevCost).toLocaleString('de-DE')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

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
              <div className="col-span-2">
                <label className="form-label">Sovereignty Matrix (B2)</label>
                <textarea rows={5} className="form-textarea" value={poc.design?.activeB2Restrictions || ''}
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

            <div className="card border-l-4 border-l-blue-aria p-3 space-y-3 bg-blue-50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">€ Dev Cost (man-hour)</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Impl. Time (weeks) */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text">Impl. Time</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="form-input flex-1"
                      value={poc.design?.estimatedImplWeeks || 0}
                      onChange={(e) => {
                        const weeks = Number(e.target.value) || 0;
                        setPoc(prev => {
                          if (!prev) return prev;
                          const cost = weeks * 5 * (prev.design?.devRateEur ?? 450) * (prev.design?.nDevs ?? 1);
                          return { ...prev, design: { ...prev.design, estimatedImplWeeks: weeks, estimatedDevCostEur: cost } };
                        });
                        trigger({ design: {
                          estimatedImplWeeks: weeks,
                          nDevs: poc.design?.nDevs ?? 1,
                          devRateEur: poc.design?.devRateEur ?? 450,
                          estimatedDevCostEur: weeks * 5 * (poc.design?.devRateEur ?? 450) * (poc.design?.nDevs ?? 1)
                        }} as any);
                      }}
                    />
                    <span className="text-xs text-muted">weeks</span>
                  </div>
                </div>

                {/* Nº Developers */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text">Nº Developers</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="form-input flex-1"
                      value={poc.design?.nDevs || 1}
                      onChange={(e) => {
                        const devs = Number(e.target.value) || 1;
                        setPoc(prev => {
                          if (!prev) return prev;
                          const cost = (prev.design?.estimatedImplWeeks ?? 0) * 5 * (prev.design?.devRateEur ?? 450) * devs;
                          return { ...prev, design: { ...prev.design, nDevs: devs, estimatedDevCostEur: cost } };
                        });
                        trigger({ design: {
                          estimatedImplWeeks: poc.design?.estimatedImplWeeks ?? 0,
                          nDevs: devs,
                          devRateEur: poc.design?.devRateEur ?? 450,
                          estimatedDevCostEur: (poc.design?.estimatedImplWeeks ?? 0) * 5 * (poc.design?.devRateEur ?? 450) * devs
                        }} as any);
                      }}
                    />
                    <span className="text-xs text-muted">devs</span>
                  </div>
                </div>

                {/* Dev Rate Reference */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text">Dev Rate Reference</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      className="form-input flex-1"
                      value={poc.design?.devRateEur || 450}
                      onChange={(e) => {
                        const rate = Number(e.target.value) || 450;
                        setPoc(prev => {
                          if (!prev) return prev;
                          const cost = (prev.design?.estimatedImplWeeks ?? 0) * 5 * rate * (prev.design?.nDevs ?? 1);
                          return { ...prev, design: { ...prev.design, devRateEur: rate, estimatedDevCostEur: cost } };
                        });
                        trigger({ design: {
                          estimatedImplWeeks: poc.design?.estimatedImplWeeks ?? 0,
                          nDevs: poc.design?.nDevs ?? 1,
                          devRateEur: rate,
                          estimatedDevCostEur: (poc.design?.estimatedImplWeeks ?? 0) * 5 * rate * (poc.design?.nDevs ?? 1)
                        }} as any);
                      }}
                    />
                    <span className="text-xs text-muted">€/day</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center pt-1 border-t border-border">
                <span className="text-xs text-muted mr-2">Dev Cost estimate</span>
                <span className="text-sm font-bold text-text">
                  €{(poc.design?.estimatedDevCostEur || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

        {/* Catalog-driven POC compute scope (carries to Industrialization) */}
        <div className="card border-l-4 border-l-blue-aria p-3 space-y-2 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                € Compute cost
              </h3>
              <p className="text-[11px] text-muted leading-snug">
                Re-size the PoC for a small pilot, with a limited number of users and a low volume of executions. Use the model and GPU intended for production. If the PoC results indicate that changes are needed, they can be implemented during the industrialization phase.
              </p>
            </div>
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

        {poc.phase === 'design' && (
          <button
            onClick={() => advanceTo('execution')}
            disabled={(poc.design?.successCriteria || []).length < 2}
            className="btn-primary disabled:opacity-50"
          >
            Advance to Execution →
          </button>
        )}

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
              <div className="flex gap-2">
                <button
                  onClick={() => advanceTo('design')}
                  className="flex-1 px-4 py-2 rounded-sm border-2 border-slate-400 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Return to Design
                </button>
                <button
                  onClick={() => advanceTo('evaluation')}
                  disabled={milestones.length === 0}
                  className="btn-primary disabled:opacity-50 flex-1"
                >
                  Advance to Evaluation →
                </button>
              </div>
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
              <div className="flex gap-2">
                <button
                  onClick={() => advanceTo('execution')}
                  className="flex-1 px-4 py-2 rounded-sm border-2 border-slate-400 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                >
                  ← Return to Execution
                </button>
                <button onClick={() => advanceTo('decision')} className="btn-primary flex-1">Proceed to Decision →</button>
              </div>
            )}
          </div>
        )}

        {/* Phase 4: Decision */}
        {activeTab === 'decision' && (
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
            <div className="flex gap-2">
              <button
                onClick={() => advanceTo('evaluation')}
                className="flex-1 px-4 py-2 rounded-sm border-2 border-slate-400 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                ← Return to Evaluation
              </button>
              <button
                onClick={() => advanceTo('closed')}
                className="btn-primary flex-1"
              >
                Close POC ✓
              </button>
            </div>
          </div>
        )}

        {/* Phase 5: Closed */}
        {activeTab === 'closed' && (
          <div className="space-y-4">
            {poc.decision?.decision && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Final Decision</p>
                <Badge
                  variant={
                    poc.decision.decision === 'go'
                      ? 'green'
                      : poc.decision.decision === 'go_conditional'
                        ? 'amber'
                        : 'red'
                  }
                >
                  {DECISIONS.find(d => d.key === poc.decision.decision)?.label || poc.decision.decision}
                </Badge>
              </div>
            )}
            {poc.decision?.justification && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Justification</p>
                <p className="text-sm text-text whitespace-pre-wrap">{poc.decision.justification}</p>
              </div>
            )}
            {poc.decision?.nextSteps && (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Next Steps</p>
                <p className="text-sm text-text whitespace-pre-wrap">{poc.decision.nextSteps}</p>
              </div>
            )}
            <div className="text-sm text-muted italic pt-3 border-t border-border">
              This POC is closed.
            </div>
            <div className="flex gap-2 pt-3 border-t border-border">
              <button
                onClick={() => advanceTo('decision')}
                className="flex-1 px-4 py-2 rounded-sm border-2 border-slate-400 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                ← Return to Decision
              </button>
            </div>
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

      {showUCPicker && (
        <div className="fixed inset-0 z-50 flex items-center
          justify-center p-4">
          <div className="absolute inset-0 bg-black/40"
            onClick={() => setShowUCPicker(false)} />
          <div className="relative bg-white rounded-lg shadow-xl
            w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">
                Add Use Case to POC
              </h3>
              <button onClick={() => setShowUCPicker(false)}
                className="text-muted hover:text-text">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted font-medium
                  uppercase tracking-wide mb-1 block">Audit</label>
                <select className="form-input w-full text-sm"
                  value={pickerAuditId}
                  onChange={e => setPickerAuditId(e.target.value)}>
                  <option value="">Select audit...</option>
                  {allAudits.map(a => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {pickerAuditId && (
                <div>
                  <label className="text-xs text-muted font-medium
                    uppercase tracking-wide mb-1 block">Process</label>
                  <select className="form-input w-full text-sm"
                    value={pickerProcessId}
                    onChange={e => setPickerProcessId(e.target.value)}
                    disabled={loadingPickerProcesses}>
                    <option value="">
                      {loadingPickerProcesses
                        ? 'Loading...' : 'Select process...'}
                    </option>
                    {pickerProcesses.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.procId} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {pickerProcessId && (
                <div>
                  <label className="text-xs text-muted font-medium
                    uppercase tracking-wide mb-1 block">Use Case</label>
                  <select className="form-input w-full text-sm"
                    value={pickerSelectedUCId}
                    onChange={e => setPickerSelectedUCId(e.target.value)}
                    disabled={loadingPickerUCs}>
                    <option value="">
                      {loadingPickerUCs
                        ? 'Loading...' : 'Select use case...'}
                    </option>
                    {pickerUCs
                      .filter(uc => !assignedUCs
                        .find(a => String(a._id ?? a) === uc._id))
                      .map(uc => (
                        <option key={uc._id} value={uc._id}>
                          {uc.cuId} — {uc.description?.slice(0, 50)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleAddUC}
                disabled={!pickerSelectedUCId}
                className="btn-primary flex-1 disabled:opacity-50">
                Add UC
              </button>
              <button onClick={() => setShowUCPicker(false)}
                className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
