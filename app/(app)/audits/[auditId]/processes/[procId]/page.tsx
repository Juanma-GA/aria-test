'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Minus, Plus, Pencil, X, FlaskConical, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { TagInput } from '@/components/ui/TagInput';
import type { Priority, ProcessStatus, SectorType, BlockCompletion } from '@/lib/types';
import { AI_TYPE_LABELS } from '@/lib/types';
import { calculateScore } from '@/lib/calculations';

interface ProcessDetail {
  _id: string;
  auditId: string;
  procId: string;
  name: string;
  department: string;
  responsible: string;
  sector: SectorType;
  priority: Priority;
  status: ProcessStatus;
  applicableNorms: string[];
  sovereigntyIndex?: number | null;
  completion?: BlockCompletion;
  useCaseCount?: number;
  b1?: any;
  b2?: any;
  b3?: any;
}

interface UCRow {
  _id: string;
  cuId: string;
  description: string;
  status: string;
  score?: { dimensions?: Record<string, { value: number }> };
  timeSavedPerProfile: { hoursPerExecution: number }[];
  estimatedDevCostEur: number;
  aiTypes: string[];
}

interface POCRow {
  _id: string;
  pocId: string;
  phase: string;
  decision?: { decision?: string };
  design?: { measurableObjective?: string; deadlineDate?: string };
  useCaseId?: { cuId?: string };
}

const PRIORITY_VARIANTS: Record<Priority, 'red' | 'amber' | 'slate'> = {
  high: 'red', medium: 'amber', low: 'slate',
};

const PROCESS_STATUS_VARIANTS: Record<ProcessStatus, 'slate' | 'blue' | 'green' | 'amber'> = {
  pending: 'slate', in_audit: 'blue', completed: 'green', paused: 'amber',
};

function getSovVariant(idx: number | null | undefined): 'green' | 'amber' | 'red' | 'slate' {
  if (idx == null) return 'slate';
  if (idx >= 4.0) return 'green';
  if (idx >= 2.0) return 'amber';
  return 'red';
}


const EMPTY_COMPLETION: BlockCompletion = {
  b1: false, b2: false, b3: false, b4: false, b5: false, b6: false, b7: false,
};

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const PROCESS_STATUSES: ProcessStatus[] = ['pending', 'in_audit', 'completed', 'paused'];

const UC_STATUS_VARIANTS: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  eligible: 'green', blocked: 'red', pending_review: 'amber',
};

const PHASE_VARIANTS: Record<string, 'slate' | 'blue' | 'amber' | 'green'> = {
  design: 'slate', execution: 'blue', evaluation: 'amber', closed: 'green',
};

export default function ProcessPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params?.auditId as string;
  const procId = params?.procId as string;

  const [process, setProcess] = useState<ProcessDetail | null>(null);
  const [useCases, setUseCases] = useState<UCRow[]>([]);
  const [pocs, setPocs] = useState<POCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', department: '', responsible: '', priority: 'medium' as Priority, applicableNorms: [] as string[] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [procRes, ucRes, pocRes] = await Promise.all([
          fetch(`/api/audits/${auditId}/processes/${procId}`),
          fetch(`/api/audits/${auditId}/usecases?processId=${procId}`, { credentials: 'include' }),
          fetch(`/api/audits/${auditId}/pocs?processId=${procId}`, { credentials: 'include' }),
        ]);
        if (!procRes.ok) throw new Error(`Error ${procRes.status}`);
        const data = await procRes.json();
        setProcess(data);
        setEditForm({
          name: data.name || '',
          department: data.department || '',
          responsible: data.responsible || '',
          priority: data.priority || 'medium',
          applicableNorms: data.applicableNorms || [],
        });
        if (ucRes.ok) setUseCases(await ucRes.json());
        if (pocRes.ok) setPocs(await pocRes.json());
      } catch (e: any) {
        setError(e.message ?? 'Failed to load process');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [auditId, procId]);

  const handleStatusChange = async (newStatus: ProcessStatus) => {
    if (!process || newStatus === process.status) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/processes/${procId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setProcess((prev) => prev ? { ...prev, status: updated.status } : prev);
    } catch { /* ignore */ } finally {
      setSavingStatus(false);
    }
  };

  const handleEditSave = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/processes/${procId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          department: editForm.department,
          responsible: editForm.responsible,
          priority: editForm.priority,
          applicableNorms: editForm.applicableNorms,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProcess((prev) => prev ? { ...prev, ...updated } : prev);
        setEditOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" className="text-blue-aria" /></div>;
  }

  if (error || !process) {
    return (
      <div className="p-4 rounded-sm bg-red-sov-light border border-red-sov/20 text-red-sov text-sm">
        {error ?? 'Process not found'}
      </div>
    );
  }

  const completion = process.completion ?? EMPTY_COMPLETION;

  // B1 data
  const profiles: any[] = process.b1?.profiles ?? [];
  const totalPeople = profiles.reduce((s, p) => s + (p.count ?? 0), 0);
  const stakeholders: any[] = process.b1?.stakeholders ?? [];

  // B2 data
  const sovIdx = process.sovereigntyIndex;

  // B3 data
  const activities: any[] = process.b3?.activities ?? [];
  const annualReps: number = process.b3?.annualRepetitions ?? 0;
  const totalHrsRun = activities.reduce((s, a) => s + (a.estimatedTimeHours ?? 0) * (a.stepRepetitions ?? 1), 0);
  const totalHrsYear = totalHrsRun * annualReps;

  const blocks = [
    {
      key: 'b1' as keyof BlockCompletion,
      label: 'B1', name: 'Context',
      href: `/audits/${auditId}/processes/${procId}/b1`,
      color: 'slate' as const,
      preview: totalPeople > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-aria">{totalPeople} people impacted</p>
          {stakeholders.slice(0, 2).map((s: any, i) => (
            <p key={i} className="text-[11px] text-muted truncate">{s.role}: {s.name}</p>
          ))}
          {stakeholders.length > 2 && <p className="text-[10px] text-muted">+{stakeholders.length - 2} more</p>}
        </div>
      ) : <p className="text-xs text-muted">No profiles yet</p>,
    },
    {
      key: 'b2' as keyof BlockCompletion,
      label: 'B2', name: 'Sovereignty',
      href: `/audits/${auditId}/processes/${procId}/b2`,
      color: 'red' as const,
      preview: sovIdx != null ? (
        <div className="flex items-center gap-2">
          <span className="text-xl font-display font-bold text-text">{sovIdx.toFixed(1)}</span>
          <Badge variant={getSovVariant(sovIdx)}>
            {sovIdx >= 4 ? 'Favourable' : sovIdx >= 2 ? 'Moderate' : 'High risk'}
          </Badge>
        </div>
      ) : <p className="text-xs text-muted">Not assessed yet</p>,
    },
    {
      key: 'b3' as keyof BlockCompletion,
      label: 'B3', name: 'Process Map',
      href: `/audits/${auditId}/processes/${procId}/b3`,
      color: 'teal' as const,
      preview: activities.length > 0 ? (
        <div className="space-y-0.5 text-xs">
          <p className="text-muted">{activities.length} activities · <span className="text-text font-medium">{totalHrsRun.toFixed(1)}h/run</span></p>
          <p className="text-muted">{annualReps} reps/yr · <span className="text-text font-medium">{totalHrsYear.toFixed(0)}h/yr</span></p>
        </div>
      ) : <p className="text-xs text-muted">No activities yet</p>,
    },
    {
      key: 'b5' as keyof BlockCompletion,
      label: 'B4', name: 'Use Cases',
      href: `/audits/${auditId}/processes/${procId}/b5`,
      color: 'blue' as const,
      preview: <p className="text-xs text-muted">{useCases.length} use cases identified</p>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Process header */}
      <div className="bg-white border border-border rounded-sm p-6">
        <div className="flex items-start justify-between gap-6">
          {/* Left: identity */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="amber">{process.procId}</Badge>
              <Badge variant={PRIORITY_VARIANTS[process.priority]}>
                {process.priority.charAt(0).toUpperCase() + process.priority.slice(1)}
              </Badge>
              {savingStatus ? (
                <Spinner size="sm" className="text-blue-aria" />
              ) : (
                <select
                  value={process.status}
                  onChange={(e) => handleStatusChange(e.target.value as ProcessStatus)}
                  className="text-xs border border-border rounded-sm px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-aria"
                >
                  {PROCESS_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1 text-xs text-muted hover:text-blue-aria border border-border rounded px-2 py-0.5 hover:border-blue-aria transition-colors"
              >
                <Pencil size={11} /> Edit
              </button>
            </div>

            <h1 className="font-display text-xl font-bold text-text leading-tight">{process.name}</h1>

            <div className="flex flex-wrap gap-4 text-xs text-muted">
              {process.department && <span>Dept: <span className="text-text font-medium">{process.department}</span></span>}
              {process.responsible && <span>Resp: <span className="text-text font-medium">{process.responsible}</span></span>}
            </div>

            {process.applicableNorms && process.applicableNorms.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {process.applicableNorms.map((norm) => (
                  <Badge key={norm} variant="slate">{norm}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Block cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {blocks.map((block) => {
          const isDone = completion[block.key];
          return (
            <Link
              key={block.key}
              href={block.href}
              className="bg-white border border-border rounded-sm p-4 flex flex-col gap-3 hover:shadow-md hover:border-blue-aria/40 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={block.color}>{block.label} · {block.name}</Badge>
                <span className={`flex items-center justify-center w-5 h-5 rounded-full ${isDone ? 'bg-green-sov text-white' : 'bg-slate-100 text-muted'}`}>
                  {isDone ? <Check size={11} /> : <Minus size={11} />}
                </span>
              </div>
              <div className="flex-1">{block.preview}</div>
              <span className="text-[11px] font-medium text-blue-aria">Open →</span>
            </Link>
          );
        })}
      </div>

      {/* Inline Use Cases table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-base text-text flex items-center gap-2">
            <Lightbulb size={15} className="text-blue-aria" /> Use Cases
            <span className="text-muted font-normal text-sm">({useCases.length})</span>
          </h2>
          <button
            onClick={() => router.push(`/audits/${auditId}/processes/${procId}/b5`)}
            className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria/30 rounded px-2 py-1 hover:bg-blue-pale transition-colors"
          >
            <Plus size={12} /> New Use Case
          </button>
        </div>

        {useCases.length === 0 ? (
          <div className="bg-white border border-border rounded-sm p-8 text-center">
            <p className="text-sm text-muted">No use cases yet.</p>
            <button
              onClick={() => router.push(`/audits/${auditId}/processes/${procId}/b5`)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-aria text-white text-xs font-medium rounded-sm hover:bg-blue-700 transition-colors"
            >
              <Plus size={12} /> Add Use Case
            </button>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {['UC ID', 'Description', 'AI Type(s)', 'Score', 'Category', 'ROI', 'Status'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {useCases.map((uc) => {
                  const scoreResult = uc.score?.dimensions ? calculateScore(uc.score.dimensions as Parameters<typeof calculateScore>[0]) : null;
                  const total = scoreResult?.total ?? 0;
                  const cat = scoreResult?.category;
                  const timeSaved = uc.timeSavedPerProfile.reduce((s, e) => s + (e.hoursPerExecution ?? 0), 0);
                  const avgRate = profiles.map((p: any) => p.hourlyRateEur ?? 0).filter((r: number) => r > 0).reduce((a: number, b: number, _: number, arr: number[]) => a + b / arr.length, 0);
                  const annualSaving = timeSaved * avgRate * annualReps;
                  const devCost = uc.estimatedDevCostEur ?? 0;
                  const paybackMonths = devCost > 0 && annualSaving > 0 ? Math.round((devCost / annualSaving) * 12) : null;
                  return (
                    <tr key={uc._id} className="border-b border-border/50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => router.push(`/audits/${auditId}/processes/${procId}/b5`)}>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-xs text-blue-aria font-medium">{uc.cuId}</span>
                      </td>
                      <td className="py-2.5 px-4 max-w-[200px]">
                        <p className="text-xs text-text truncate">{uc.description}</p>
                      </td>
                      <td className="py-2.5 px-4 max-w-[160px]">
                        <div className="flex flex-wrap gap-1">
                          {(uc.aiTypes ?? []).map((t) => (
                            <span key={t} className="inline-block px-1.5 py-0.5 bg-blue-pale text-blue-aria text-[10px] rounded-sm whitespace-nowrap">
                              {(AI_TYPE_LABELS as any)[t]?.label ?? t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="text-xs font-bold text-text">{total}/30</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant={cat === 'quick_win' ? 'green' : cat === 'mid_term' ? 'amber' : 'blue'}>
                          {cat === 'quick_win' ? 'Quick Win' : cat === 'mid_term' ? 'Mid-term' : 'Strategic'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5 text-[10px]">
                          {timeSaved > 0 && <p className="text-muted">{timeSaved}h/run saved</p>}
                          {annualSaving > 0 && <p className="text-green-600 font-semibold">€{Math.round(annualSaving).toLocaleString()}/yr</p>}
                          {devCost > 0 && <p className="text-muted">Dev: €{devCost.toLocaleString()}</p>}
                          {paybackMonths !== null && <p className="text-amber-600">Payback: {paybackMonths}m</p>}
                          {timeSaved === 0 && annualSaving === 0 && devCost === 0 && <span className="text-muted">—</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant={UC_STATUS_VARIANTS[uc.status] ?? 'slate'}>
                          {uc.status.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline POC table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-base text-text flex items-center gap-2">
            <FlaskConical size={15} className="text-teal-poc" /> POCs
            <span className="text-muted font-normal text-sm">({pocs.length})</span>
          </h2>
          <button
            onClick={() => router.push(`/audits/${auditId}/pocs/new?processId=${procId}`)}
            className="flex items-center gap-1 text-xs text-blue-aria border border-blue-aria/30 rounded px-2 py-1 hover:bg-blue-pale transition-colors"
          >
            <Plus size={12} /> New POC
          </button>
        </div>

        {pocs.length === 0 ? (
          <div className="bg-white border border-border rounded-sm p-8 text-center">
            <p className="text-sm text-muted">No POCs for this process yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {['POC ID', 'Use Case', 'Phase', 'Decision', 'Objective', 'Deadline'].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pocs.map((poc) => (
                  <tr key={poc._id} className="border-b border-border/50 hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/audits/${auditId}/pocs/${poc._id}`)}>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs text-blue-aria font-medium">{poc.pocId}</span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted">{(poc as any).useCaseId?.cuId ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant={PHASE_VARIANTS[poc.phase] ?? 'slate'}>{poc.phase}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted capitalize">
                      {poc.decision?.decision?.replace(/_/g, ' ') ?? 'pending'}
                    </td>
                    <td className="py-2.5 px-4 max-w-[200px]">
                      <p className="text-xs text-text truncate">{poc.design?.measurableObjective ?? '—'}</p>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted">
                      {poc.design?.deadlineDate ? new Date(poc.design.deadlineDate).toLocaleDateString('en-GB') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Process Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg text-text">Edit Process</h2>
              <button onClick={() => setEditOpen(false)} className="text-muted hover:text-text"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">Process Name <span className="text-red-sov">*</span></label>
                <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Department</label>
                  <input className="form-input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Responsible</label>
                  <input className="form-input" value={editForm.responsible} onChange={e => setEditForm(f => ({ ...f, responsible: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="form-input" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Applicable Norms</label>
                <TagInput value={editForm.applicableNorms} onChange={v => setEditForm(f => ({ ...f, applicableNorms: v }))} placeholder="Type norm + Enter" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors">Cancel</button>
              <button
                onClick={handleEditSave}
                disabled={saving || !editForm.name.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 disabled:opacity-50 transition-colors"
              >
                {saving && <Spinner size="sm" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
